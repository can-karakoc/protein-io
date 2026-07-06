"""Antibody Fv detection + CDR annotation.

Primary path: AntPack (a pip wheel, no HMMER binary — deploy-safe) gives real IMGT
numbering + CDR labels across species incl. nanobodies. AntPack v0.3.x is GPL, which is
why Protein I/O is GPL-licensed. If AntPack can't be imported (a platform without a
wheel), we fall back to an in-house estimate: fit-align each chain to reference VH/VL
domains with marked Kabat-style CDRs. Either way, detection is gated behind
``include_validity`` and fails soft.
"""

from __future__ import annotations

import logging

import numpy as np

log = logging.getLogger(__name__)

_AA3_TO_1: dict[str, str] = {
    "ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C",
    "GLN": "Q", "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I",
    "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F", "PRO": "P",
    "SER": "S", "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V",
    "SEC": "U", "PYL": "O", "MSE": "M",
}


class AntibodyError(Exception):
    pass


def _seqs_by_chain(atoms: list) -> dict[str, list[tuple[str, str]]]:
    """Ordered (residue_number, one-letter) per protein chain, from Cα atoms."""
    out: dict[str, list[tuple[str, str]]] = {}
    for a in atoms:
        if a.name != "CA" or getattr(a, "residue_kind", "protein") != "protein":
            continue
        out.setdefault(a.chain_id, []).append((a.residue_number, _AA3_TO_1.get(a.residue_name.upper(), "X")))
    return out


def _group_ranges(indices: list[int], residues: list[tuple[str, str]]) -> dict:
    """Contiguous index run → {start, end, sequence, length, residue_numbers}."""
    indices = sorted(indices)
    start_i, end_i = indices[0], indices[-1]
    span = list(range(start_i, end_i + 1))
    return {
        "start": residues[start_i][0],
        "end": residues[end_i][0],
        "sequence": "".join(residues[k][1] for k in span),
        "length": len(span),
        "residue_numbers": [residues[k][0] for k in span],
    }


# Common return shape for both numbering paths:
#   (domain_type, identity, {cdr_name: [query indices]}, [ordered cdr names])
Annotated = tuple[str, float, dict[str, list[int]], list[str]]


# ── AntPack path (primary) ────────────────────────────────────────────────────

_MIN_PCT = 0.55  # germline identity floor; non-antibodies also fail AntPack's err check
_ANNOTATOR = None
_ANTPACK_OK: bool | None = None


def _antpack_available() -> bool:
    global _ANTPACK_OK, _ANNOTATOR
    if _ANTPACK_OK is None:
        try:
            from antpack import SingleChainAnnotator

            _ANNOTATOR = SingleChainAnnotator(scheme="imgt")
            _ANTPACK_OK = True
        except Exception as exc:  # pragma: no cover - only when the wheel is missing
            log.info("AntPack unavailable, using in-house antibody fallback: %s", exc)
            _ANTPACK_OK = False
    return _ANTPACK_OK


def _annotate_antpack(seq: str) -> Annotated | None:
    ann = _ANNOTATOR
    numbering, pct, chain, err = ann.analyze_seq(seq)
    if err or pct < _MIN_PCT:
        return None
    domain_type = "VH" if chain == "H" else "VL"
    order = ["CDR-H1", "CDR-H2", "CDR-H3"] if chain == "H" else ["CDR-L1", "CDR-L2", "CDR-L3"]
    label_to_name = {"cdr1": order[0], "cdr2": order[1], "cdr3": order[2]}

    labels = ann.assign_cdr_labels(numbering, chain)
    regions: dict[str, list[int]] = {}
    for idx, lab in enumerate(labels):
        name = label_to_name.get(lab)
        if name is not None:
            regions.setdefault(name, []).append(idx)
    if not all(regions.get(n) for n in order):
        return None
    return domain_type, round(float(pct), 3), regions, order


# ── In-house fallback: fit-align to reference VH/VL domains ────────────────────

_VH_REF = (
    "EVQLVESGGGLVQPGGSLRLSCAASGFNIKDTYIHWVRQAPGKGLEWVARIYPTNGYTRYADSVKG"
    "RFTISADTSKNTAYLQMNSLRAEDTAVYYCSRWGGDGFYAMDYWGQGTLVTVSS"
)
_VH_CDRS = [("CDR-H1", "GFNIKDTYIH"), ("CDR-H2", "RIYPTNGYTRYADSVKG"), ("CDR-H3", "SRWGGDGFYAMDY")]
_VL_REF = (
    "DIQMTQSPSSLSASVGDRVTITCRASQDVNTAVAWYQQKPGKAPKLLIYSASFLYSGVPSRFSGSRSG"
    "TDFTLTISSLQPEDFATYYCQQHYTTPPTFGQGTKVEIK"
)
_VL_CDRS = [("CDR-L1", "RASQDVNTAVA"), ("CDR-L2", "SASFLYS"), ("CDR-L3", "QQHYTTPPT")]

_MIN_IDENTITY = 0.40
_MATCH, _MISMATCH, _GAP = 2, -1, -2


def _build_mask(ref: str, cdrs: list[tuple[str, str]]) -> list[str | None]:
    mask: list[str | None] = ["F"] * len(ref)
    for name, sub in cdrs:
        i = ref.find(sub)
        if i < 0:  # pragma: no cover
            raise AntibodyError(f"CDR substring not found in reference: {name}")
        for j in range(i, i + len(sub)):
            mask[j] = name
    return mask


_VH_MASK = _build_mask(_VH_REF, _VH_CDRS)
_VL_MASK = _build_mask(_VL_REF, _VL_CDRS)


def _fit_align(query: str, ref: str) -> list[tuple[int | None, int | None]]:
    """Fit (semi-global) alignment: place the whole reference into the best-matching
    window of the query (free leading/trailing query gaps) so identity reflects a real
    variable domain rather than scattered matches across a long chain."""
    n, m = len(query), len(ref)
    score = np.zeros((n + 1, m + 1), dtype=np.int32)
    score[0, :] = np.arange(m + 1) * _GAP
    for i in range(1, n + 1):
        qi = query[i - 1]
        for j in range(1, m + 1):
            diag = score[i - 1, j - 1] + (_MATCH if qi == ref[j - 1] else _MISMATCH)
            score[i, j] = max(diag, score[i - 1, j] + _GAP, score[i, j - 1] + _GAP)
    i = int(np.argmax(score[:, m]))
    j = m
    aln: list[tuple[int | None, int | None]] = []
    while j > 0:
        if i > 0 and score[i, j] == score[i - 1, j - 1] + (_MATCH if query[i - 1] == ref[j - 1] else _MISMATCH):
            aln.append((i - 1, j - 1)); i -= 1; j -= 1
        elif i > 0 and score[i, j] == score[i - 1, j] + _GAP:
            aln.append((i - 1, None)); i -= 1
        else:
            aln.append((None, j - 1)); j -= 1
    aln.reverse()
    return aln


def _annotate_against(seq: str, ref: str, mask: list[str | None]) -> tuple[float, dict[str, list[int]]]:
    aln = _fit_align(seq, ref)
    matches = 0
    regions: dict[str, list[int]] = {}
    last_region: str | None = None
    for qi, rj in aln:
        if rj is not None:
            last_region = mask[rj]
            if qi is not None and seq[qi] == ref[rj]:
                matches += 1
        if qi is not None and last_region is not None and last_region != "F":
            regions.setdefault(last_region, []).append(qi)
    return matches / len(ref), regions


def _annotate_inhouse(seq: str) -> Annotated | None:
    best = None
    for domain_type, ref, mask, order in (
        ("VH", _VH_REF, _VH_MASK, ["CDR-H1", "CDR-H2", "CDR-H3"]),
        ("VL", _VL_REF, _VL_MASK, ["CDR-L1", "CDR-L2", "CDR-L3"]),
    ):
        identity, regions = _annotate_against(seq, ref, mask)
        if best is None or identity > best[1]:
            best = (domain_type, identity, regions, order)
    domain_type, identity, regions, order = best
    if identity < _MIN_IDENTITY or not all(regions.get(name) for name in order):
        return None
    return domain_type, round(identity, 3), regions, order


# ── Orchestrator ──────────────────────────────────────────────────────────────

def annotate_antibody(atoms: list) -> list[dict]:
    """Detect antibody variable domains + CDR loops per chain.

    Returns [{chain_id, domain_type (VH/VL), identity, cdrs: [{name, start, end,
    sequence, length, residue_numbers}]}]. Empty when no antibody chains are found.
    """
    use_antpack = _antpack_available()
    chains = _seqs_by_chain(atoms)
    results: list[dict] = []
    for chain_id, residues in chains.items():
        if len(residues) < 90:  # Fv domains are ~110-130 aa
            continue
        seq = "".join(aa for _, aa in residues)
        try:
            annotated = _annotate_antpack(seq) if use_antpack else _annotate_inhouse(seq)
        except Exception as exc:  # pragma: no cover - defensive
            log.info("Antibody numbering failed for chain %s: %s", chain_id, exc)
            annotated = None
        if annotated is None:
            continue
        domain_type, identity, regions, order = annotated
        cdrs = [{"name": name, **_group_ranges(regions[name], residues)} for name in order]
        results.append({
            "chain_id": chain_id,
            "domain_type": domain_type,
            "identity": identity,
            "cdrs": cdrs,
        })

    results.sort(key=lambda r: (r["domain_type"] != "VH", r["chain_id"]))
    return results
