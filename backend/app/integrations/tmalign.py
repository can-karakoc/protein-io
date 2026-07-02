from __future__ import annotations

import numpy as np
import tmtools

import gemmi

from app.parser import parse_gemmi_structure


class TmAlignError(Exception):
    pass


_AA3_TO_1: dict[str, str] = {
    "ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C",
    "GLN": "Q", "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I",
    "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F", "PRO": "P",
    "SER": "S", "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V",
    "SEC": "U", "PYL": "O", "ASX": "B", "GLX": "Z", "XLE": "J",
}


def _extract_ca(structure: gemmi.Structure) -> tuple[np.ndarray, str]:
    """Return (N×3 CA coords, one-letter sequence) from the first model."""
    coords: list[list[float]] = []
    seq: list[str] = []
    model = structure[0]
    for chain in model:
        for residue in chain:
            if residue.entity_type not in (
                gemmi.EntityType.Polymer,
                gemmi.EntityType.Unknown,
            ):
                continue
            ca = residue.find_atom("CA", "\0")
            if ca is None:
                continue
            p = ca.pos
            coords.append([p.x, p.y, p.z])
            seq.append(_AA3_TO_1.get(residue.name.upper(), "X"))
    if not coords:
        raise TmAlignError("No Cα atoms found in structure")
    return np.array(coords, dtype=np.float64), "".join(seq)


def run_tmalign(
    content_a: bytes,
    content_b: bytes,
    filename_a: str | None = None,
    filename_b: str | None = None,
) -> dict:
    """Run TM-align between two structures and return a result dict.

    Returns keys: tm_score_query, tm_score_target, rmsd, query_length, target_length.
    tm_score_query  — TM-score normalised by query (#A) residue count.
    tm_score_target — TM-score normalised by target (#B) residue count.
    Convention: structural similarity is typically reported as the max of the two.
    """
    text_a = content_a.decode("utf-8", errors="replace")
    text_b = content_b.decode("utf-8", errors="replace")
    try:
        struct_a = parse_gemmi_structure(text_a, "query")
        struct_b = parse_gemmi_structure(text_b, "target")
    except Exception as exc:
        raise TmAlignError(f"Parse error: {exc}") from exc

    coords_a, seq_a = _extract_ca(struct_a)
    coords_b, seq_b = _extract_ca(struct_b)

    try:
        res = tmtools.tm_align(coords_a, coords_b, seq_a, seq_b)
    except Exception as exc:
        raise TmAlignError(f"TM-align computation failed: {exc}") from exc

    return {
        "tm_score_query": round(float(res.tm_norm_chain1), 4),
        "tm_score_target": round(float(res.tm_norm_chain2), 4),
        "rmsd": round(float(res.rmsd), 3),
        "query_length": len(seq_a),
        "target_length": len(seq_b),
    }
