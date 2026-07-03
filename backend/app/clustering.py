"""In-house structural clustering for design campaigns.

Groups a batch of designs by fold using an all-vs-all TM-align similarity matrix
(``tmtools`` — a pip wheel, no external binary) and leader/greedy clustering. This
is O(N²) TM-align, which is fine for the small campaigns a laptop-scale review tool
handles (capped at the batch limit). It stays true to the project constraints: CPU
only, no binaries, fail-soft.
"""

from __future__ import annotations

import logging

import numpy as np
import tmtools

from app.integrations.tmalign import _extract_ca
from app.parser import parse_gemmi_structure

log = logging.getLogger(__name__)


class ClusterError(Exception):
    pass


# TM-score >= this ≈ "same fold" (the widely used 0.5 fold-level threshold).
DEFAULT_TM_THRESHOLD = 0.5


def _prepare(files: list[tuple[str, bytes]]) -> tuple[list[str], list[tuple[np.ndarray, str]], list[str]]:
    """Parse each file to (Cα coords, sequence). Returns (names, cas, skipped)."""
    names: list[str] = []
    cas: list[tuple[np.ndarray, str]] = []
    skipped: list[str] = []
    for name, content in files:
        try:
            text = content.decode("utf-8", errors="replace")
            struct = parse_gemmi_structure(text, name or "design")
            coords, seq = _extract_ca(struct)
            if len(coords) < 3:
                raise ClusterError("too few Cα atoms")
            names.append(name)
            cas.append((coords, seq))
        except Exception as exc:  # pragma: no cover - defensive
            log.info("Clustering skipped %s: %s", name, exc)
            skipped.append(name)
    return names, cas, skipped


def _similarity_matrix(cas: list[tuple[np.ndarray, str]]) -> np.ndarray:
    """Symmetric N×N TM-score matrix (max of the two normalisations per pair)."""
    n = len(cas)
    sim = np.eye(n, dtype=np.float64)
    for i in range(n):
        coords_i, seq_i = cas[i]
        for j in range(i + 1, n):
            coords_j, seq_j = cas[j]
            try:
                res = tmtools.tm_align(coords_i, coords_j, seq_i, seq_j)
                score = max(float(res.tm_norm_chain1), float(res.tm_norm_chain2))
            except Exception as exc:  # pragma: no cover - defensive
                log.info("TM-align failed for pair %d,%d: %s", i, j, exc)
                score = 0.0
            sim[i, j] = sim[j, i] = score
    return sim


def cluster_by_fold(
    files: list[tuple[str, bytes]],
    tm_threshold: float = DEFAULT_TM_THRESHOLD,
) -> dict:
    """Cluster designs by structural similarity.

    Leader clustering: seed clusters from the largest unassigned design, absorb every
    other unassigned design whose TM-score to the seed is >= ``tm_threshold``. The seed
    is the cluster representative. Deterministic and chain-free (unlike single linkage).

    Returns a dict with keys: clusters, assignments, tm_threshold, skipped.
    """
    if not files:
        raise ClusterError("No structures to cluster")

    names, cas, skipped = _prepare(files)
    if not names:
        raise ClusterError("No clusterable structures (all failed to parse)")

    sim = _similarity_matrix(cas)
    lengths = [len(seq) for _, seq in cas]

    # Order seeds by descending residue count so the most complete design leads.
    order = sorted(range(len(names)), key=lambda i: lengths[i], reverse=True)
    assigned: dict[int, int] = {}  # design index -> cluster_id
    clusters: list[dict] = []
    next_id = 1

    for idx in order:
        if idx in assigned:
            continue
        cluster_id = next_id
        next_id += 1
        members = [idx]
        assigned[idx] = cluster_id
        for jdx in order:
            if jdx == idx or jdx in assigned:
                continue
            if sim[idx, jdx] >= tm_threshold:
                assigned[jdx] = cluster_id
                members.append(jdx)
        member_names = [names[m] for m in members]
        # Mean pairwise TM within the cluster (1.0 for singletons).
        if len(members) > 1:
            pairs = [sim[a, b] for a in members for b in members if a < b]
            mean_tm = round(float(np.mean(pairs)), 4)
        else:
            mean_tm = 1.0
        clusters.append(
            {
                "cluster_id": cluster_id,
                "representative": names[idx],
                "members": member_names,
                "size": len(members),
                "mean_tm": mean_tm,
            }
        )

    # Stable, human-friendly ordering: largest clusters first, then by id.
    clusters.sort(key=lambda c: (-c["size"], c["cluster_id"]))
    # Renumber so cluster ids match display order (1 = largest).
    remap = {c["cluster_id"]: i + 1 for i, c in enumerate(clusters)}
    for c in clusters:
        c["cluster_id"] = remap[c["cluster_id"]]
    assignments = {names[idx]: remap[cid] for idx, cid in assigned.items()}

    return {
        "clusters": clusters,
        "assignments": assignments,
        "tm_threshold": tm_threshold,
        "skipped": skipped,
    }
