"""In-house antibody Fv detection + CDR annotation.

Antibody "mode" without the usual ANARCI/HMMER dependency (a compiled binary that
breaks the CPU-only, reviewable-deps, deploy-safe constraint). Instead each protein
chain is globally aligned (Needleman-Wunsch, numpy) to a reference VH and VL domain
whose CDR loops are marked; CDR regions transfer by alignment column, and residues
inserted within a CDR (e.g. a long CDR-H3) inherit that CDR. This is a sequence-based
estimate using Kabat-style CDR definitions — labelled as such in the UI, not a
validated numbering.
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

# Reference variable domains (trastuzumab) with their Kabat-style CDR loops. The CDR
# masks are built by locating each loop substring, so the references stay readable.
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

# Alignment identity over the reference below which a chain isn't treated as antibody.
_MIN_IDENTITY = 0.40
_MATCH, _MISMATCH, _GAP = 2, -1, -2


class AntibodyError(Exception):
    pass


def _build_mask(ref: str, cdrs: list[tuple[str, str]]) -> list[str | None]:
    """Per-residue CDR label for the reference ('F' framework, else the CDR name)."""
    mask: list[str | None] = ["F"] * len(ref)
    for name, sub in cdrs:
        i = ref.find(sub)
        if i < 0:  # pragma: no cover - references are fixed
            raise AntibodyError(f"CDR substring not found in reference: {name}")
        for j in range(i, i + len(sub)):
            mask[j] = name
    return mask


_VH_MASK = _build_mask(_VH_REF, _VH_CDRS)
_VL_MASK = _build_mask(_VL_REF, _VL_CDRS)


def _seqs_by_chain(atoms: list) -> dict[str, list[tuple[str, str]]]:
    """Ordered (residue_number, one-letter) per protein chain, from Cα atoms."""
    out: dict[str, list[tuple[str, str]]] = {}
    for a in atoms:
        if a.name != "CA" or getattr(a, "residue_kind", "protein") != "protein":
            continue
        out.setdefault(a.chain_id, []).append((a.residue_number, _AA3_TO_1.get(a.residue_name.upper(), "X")))
    return out


def _fit_align(query: str, ref: str) -> list[tuple[int | None, int | None]]:
    """Fit (semi-global) alignment: place the WHOLE reference into the best-matching
    window of the query, with free leading/trailing query gaps.

    A global alignment smears a short reference across a long chain (e.g. a full Fab
    or an unrelated 581-residue receptor), inflating scattered matches into false
    positives. Fitting the reference to one compact window makes identity reflect a
    real variable domain. Returns (query_idx, ref_idx) columns; None = a gap.
    """
    n, m = len(query), len(ref)
    score = np.zeros((n + 1, m + 1), dtype=np.int32)
    score[0, :] = np.arange(m + 1) * _GAP  # reference prefix must be gapped (penalised)
    # score[:, 0] stays 0 — skipping a query prefix is free.
    for i in range(1, n + 1):
        qi = query[i - 1]
        for j in range(1, m + 1):
            diag = score[i - 1, j - 1] + (_MATCH if qi == ref[j - 1] else _MISMATCH)
            score[i, j] = max(diag, score[i - 1, j] + _GAP, score[i, j - 1] + _GAP)

    # Reference fully consumed (last column); pick the best query end row, suffix free.
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
    """Align seq to a reference; return (identity, {cdr_name: [query indices]})."""
    aln = _fit_align(seq, ref)
    matches = 0
    regions: dict[str, list[int]] = {}
    last_region: str | None = None
    for qi, rj in aln:
        if rj is not None:
            last_region = mask[rj]
            if qi is not None and seq[qi] == ref[rj]:
                matches += 1
        # A query residue takes the region of its reference column; an insertion
        # (ref gap) inherits the previous column's region so long CDR-H3s are captured.
        if qi is not None and last_region is not None and last_region != "F":
            regions.setdefault(last_region, []).append(qi)
    identity = matches / len(ref)
    return identity, regions


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


def annotate_antibody(atoms: list) -> list[dict]:
    """Detect antibody variable domains and their CDR loops per chain.

    Returns a list of {chain_id, domain_type (VH/VL), identity, cdrs: [{name, start,
    end, sequence, length}]}. Empty when no antibody chains are found.
    """
    chains = _seqs_by_chain(atoms)
    results: list[dict] = []
    for chain_id, residues in chains.items():
        if len(residues) < 90:  # Fv domains are ~110-130 aa; skip short chains
            continue
        seq = "".join(aa for _, aa in residues)

        best = None
        for domain_type, ref, mask, order in (
            ("VH", _VH_REF, _VH_MASK, ["CDR-H1", "CDR-H2", "CDR-H3"]),
            ("VL", _VL_REF, _VL_MASK, ["CDR-L1", "CDR-L2", "CDR-L3"]),
        ):
            identity, regions = _annotate_against(seq, ref, mask)
            if best is None or identity > best[0]:
                best = (identity, domain_type, regions, order)

        identity, domain_type, regions, order = best
        # Require good framework identity and all three CDR loops located.
        if identity < _MIN_IDENTITY or not all(regions.get(name) for name in order):
            continue

        cdrs = [{"name": name, **_group_ranges(regions[name], residues)} for name in order]
        results.append({
            "chain_id": chain_id,
            "domain_type": domain_type,
            "identity": round(identity, 3),
            "cdrs": cdrs,
        })

    # Heavy chains first, then by chain id, for stable display.
    results.sort(key=lambda r: (r["domain_type"] != "VH", r["chain_id"]))
    return results
