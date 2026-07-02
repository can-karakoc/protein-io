"""Interface-aware confidence from the PAE matrix (Phase 10).

Global pLDDT/PAE correlate poorly with complex quality; interface-specific metrics
are the honest signal. Given the PAE matrix (retained on ``PaeSummary.matrix``) and
the parsed structure, this module:

  * aligns PAE rows/cols to protein residues by parse order (the order predictors
    emit tokens), guarding on an exact residue-count match;
  * computes per chain-pair **interface PAE** (mean over interface-residue pairs) and
    **cross-PAE** (mean over all inter-chain residue pairs), both symmetric;
  * assigns an honest interface-confidence verdict from iPAE + interface pLDDT;
  * produces a downsampled matrix (+ chain spans) for a heatmap.

Everything degrades gracefully: if the matrix can't be aligned (e.g. token counts
differ because of ligands), the heatmap is still produced but per-pair metrics and
chain delineation are skipped.
"""

from __future__ import annotations

import numpy as np

from app.models import (
    ChainPairSummary,
    InterfaceAnalysis,
    PaeChainBlock,
    PaeMatrix,
    PaeSummary,
    StructureData,
)

HEATMAP_MAX_DIM = 80

# Interface-confidence thresholds. iPAE < 5 Å is a strong interface; the 15 Å global
# high-error threshold already lives in pae.py. pLDDT 70/50 mirror AlphaFold's
# confident / low boundaries.
IPAE_HIGH = 5.0
IPAE_MODERATE = 12.0
PLDDT_HIGH = 70.0
PLDDT_MODERATE = 50.0


def enrich_interface_confidence(
    interface_analysis: InterfaceAnalysis | None,
    pae: PaeSummary | None,
    structure: StructureData,
) -> tuple[InterfaceAnalysis | None, PaeMatrix | None]:
    """Return (interface_analysis with per-pair PAE metrics, downsampled PaeMatrix)."""
    if pae is None or not pae.matrix:
        return interface_analysis, None

    matrix = np.asarray(pae.matrix, dtype=np.float32)
    if matrix.ndim != 2 or matrix.shape[0] != matrix.shape[1]:
        return interface_analysis, None
    n = int(matrix.shape[0])

    order = _protein_residue_order(structure)
    aligned = len(order) == n

    pae_matrix = _downsample(matrix, order if aligned else None)

    if not aligned or interface_analysis is None or not interface_analysis.chain_pairs:
        return interface_analysis, pae_matrix

    index_of = {key: i for i, key in enumerate(order)}
    chain_indices: dict[str, list[int]] = {}
    for i, (chain_id, _) in enumerate(order):
        chain_indices.setdefault(chain_id, []).append(i)

    new_pairs: list[ChainPairSummary] = []
    for cp in interface_analysis.chain_pairs:
        a_iface = [index_of[(cp.chain_a, r.residue_number)]
                   for r in cp.interface_residues_a if (cp.chain_a, r.residue_number) in index_of]
        b_iface = [index_of[(cp.chain_b, r.residue_number)]
                   for r in cp.interface_residues_b if (cp.chain_b, r.residue_number) in index_of]

        interface_pae = _cross_mean(matrix, a_iface, b_iface)
        cross_pae_mean = _cross_mean(matrix, chain_indices.get(cp.chain_a, []), chain_indices.get(cp.chain_b, []))
        verdict = _verdict(interface_pae, cp.mean_plddt_a, cp.mean_plddt_b)

        new_pairs.append(cp.model_copy(update={
            "interface_pae": interface_pae,
            "cross_pae_mean": cross_pae_mean,
            "interface_confidence": verdict,
        }))

    return interface_analysis.model_copy(update={"chain_pairs": new_pairs}), pae_matrix


# ── internals ─────────────────────────────────────────────────────────────────


def _protein_residue_order(structure: StructureData) -> list[tuple[str, str]]:
    return [(r.chain_id, r.residue_number) for r in structure.residues if r.kind == "protein"]


def _cross_mean(matrix: np.ndarray, a_idx: list[int], b_idx: list[int]) -> float | None:
    """Mean PAE across two residue-index groups, averaged over both directions."""
    if not a_idx or not b_idx:
        return None
    a = np.asarray(a_idx)
    b = np.asarray(b_idx)
    ab = matrix[np.ix_(a, b)].mean()
    ba = matrix[np.ix_(b, a)].mean()
    return round(float((ab + ba) / 2.0), 2)


def _verdict(
    interface_pae: float | None,
    plddt_a: float | None,
    plddt_b: float | None,
) -> str | None:
    if interface_pae is None:
        return None
    plddt = min(plddt_a, plddt_b) if plddt_a is not None and plddt_b is not None else None
    if interface_pae < IPAE_HIGH and (plddt is None or plddt >= PLDDT_HIGH):
        return "high"
    if interface_pae < IPAE_MODERATE and (plddt is None or plddt >= PLDDT_MODERATE):
        return "moderate"
    return "low"


def _chain_spans(order: list[tuple[str, str]]) -> list[tuple[str, int, int]]:
    """Contiguous (chain_id, start, end) spans along the residue axis."""
    spans: list[tuple[str, int, int]] = []
    if not order:
        return spans
    current = order[0][0]
    start = 0
    for i, (chain_id, _) in enumerate(order):
        if chain_id != current:
            spans.append((current, start, i))
            current = chain_id
            start = i
    spans.append((current, start, len(order)))
    return spans


def _downsample(matrix: np.ndarray, order: list[tuple[str, str]] | None) -> PaeMatrix:
    n = int(matrix.shape[0])
    max_error = round(float(matrix.max()), 2)

    if n <= HEATMAP_MAX_DIM:
        dim = n
        down = matrix
    else:
        dim = HEATMAP_MAX_DIM
        edges = np.linspace(0, n, dim + 1).astype(int)
        starts = edges[:-1]
        counts = np.diff(edges)
        # Block-average: reduce rows, then columns.
        row_reduced = np.add.reduceat(matrix, starts, axis=0) / counts[:, None]
        down = np.add.reduceat(row_reduced, starts, axis=1) / counts[None, :]

    values = np.round(down, 2).tolist()

    chain_blocks: list[PaeChainBlock] = []
    if order is not None:
        for chain_id, s, e in _chain_spans(order):
            ds = int(round(s * dim / n))
            de = int(round(e * dim / n))
            if de > ds:
                chain_blocks.append(PaeChainBlock(chain_id=chain_id, start=ds, end=de))

    return PaeMatrix(size=n, down_size=int(dim), values=values, max_error=max_error, chain_blocks=chain_blocks)
