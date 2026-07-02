"""Cα-lDDT between two structures (Phase 11 — reference benchmarking).

lDDT (local Distance Difference Test) is the standard superposition-free local metric
used by CASP/CAMEO and AlphaFold. It measures the fraction of reference inter-residue
distances (within an inclusion radius) that are preserved in the model, averaged over
four tolerance thresholds. Unlike RMSD it needs no alignment and is robust to domain
motions.

Here the reference defines the distance set; residues are matched between the two
structures by (chain, residue number). No external dependency — computed with numpy.
"""

from __future__ import annotations

import numpy as np

import gemmi

from app.parser import parse_gemmi_structure

INCLUSION_RADIUS = 15.0
INCLUSION_RADIUS_PLI = 6.0  # protein–ligand contacts are local
THRESHOLDS = (0.5, 1.0, 2.0, 4.0)
MAX_RESIDUES = 4000  # guard against N×N blow-up on huge assemblies


class LddtError(Exception):
    pass


def compute_lddt_pli(
    content_model: bytes,
    content_ref: bytes,
    filename_model: str | None = None,
    filename_ref: str | None = None,
) -> dict:
    """Protein–ligand interface lDDT (lDDT-PLI) of the model vs the reference.

    Measures how well protein–ligand contact distances (within 6 Å in the reference)
    are preserved in the model — the standard local metric for co-folded pose accuracy.
    Atoms are matched by (chain, residue number, atom name). Returns
    {lddt_pli, contact_count, ligand_atom_count}.
    """
    from scipy.spatial.distance import cdist

    try:
        model = parse_gemmi_structure(content_model.decode("utf-8", errors="replace"), "model")
        reference = parse_gemmi_structure(content_ref.decode("utf-8", errors="replace"), "reference")
    except Exception as exc:
        raise LddtError(f"Parse error: {exc}") from exc

    lig_m = _atoms_by_kind(model, "ligand")
    lig_r = _atoms_by_kind(reference, "ligand")
    prot_m = _atoms_by_kind(model, "protein")
    prot_r = _atoms_by_kind(reference, "protein")

    lig_keys = [k for k in lig_r if k in lig_m]
    prot_keys = [k for k in prot_r if k in prot_m]
    if len(lig_keys) < 1:
        raise LddtError("No ligand atoms match between the two structures.")
    if len(prot_keys) < 4:
        raise LddtError("Too few matching protein atoms for lDDT-PLI.")

    lig_ref = np.array([lig_r[k] for k in lig_keys])
    lig_mod = np.array([lig_m[k] for k in lig_keys])
    prot_ref = np.array([prot_r[k] for k in prot_keys])
    prot_mod = np.array([prot_m[k] for k in prot_keys])

    d_ref = cdist(lig_ref, prot_ref)
    d_mod = cdist(lig_mod, prot_mod)

    mask = (d_ref > 0.0) & (d_ref < INCLUSION_RADIUS_PLI)
    total = int(mask.sum())
    if total == 0:
        raise LddtError("No protein–ligand contacts within the inclusion radius.")

    diff = np.abs(d_ref[mask] - d_mod[mask])
    preserved = sum(int((diff < t).sum()) for t in THRESHOLDS)
    lddt_pli = preserved / (total * len(THRESHOLDS))

    return {"lddt_pli": round(float(lddt_pli), 4), "contact_count": total, "ligand_atom_count": len(lig_keys)}


def _atoms_by_kind(structure: gemmi.Structure, kind: str) -> dict[tuple[str, str, str], np.ndarray]:
    from app.parser import classify_residue

    out: dict[tuple[str, str, str], np.ndarray] = {}
    model = structure[0]
    for chain in model:
        for residue in chain:
            if classify_residue(residue) != kind:
                continue
            for atom in residue:
                if atom.element.atomic_number <= 1:
                    continue
                key = (chain.name, _residue_number(residue), atom.name.strip())
                out[key] = np.array([atom.pos.x, atom.pos.y, atom.pos.z], dtype=np.float64)
    return out


def compute_lddt(
    content_model: bytes,
    content_ref: bytes,
    filename_model: str | None = None,
    filename_ref: str | None = None,
) -> dict:
    """Cα-lDDT of the model relative to the reference. Returns {lddt, residue_count}."""
    try:
        model = parse_gemmi_structure(content_model.decode("utf-8", errors="replace"), "model")
        reference = parse_gemmi_structure(content_ref.decode("utf-8", errors="replace"), "reference")
    except Exception as exc:
        raise LddtError(f"Parse error: {exc}") from exc

    ca_model = _ca_coords(model)
    ca_ref = _ca_coords(reference)

    keys = [k for k in ca_ref if k in ca_model]  # matched residues, reference order
    if len(keys) < 4:
        raise LddtError("Fewer than 4 residues match between the two structures.")
    if len(keys) > MAX_RESIDUES:
        raise LddtError(f"Too many residues ({len(keys)}) for lDDT.")

    ref = np.array([ca_ref[k] for k in keys], dtype=np.float64)
    mod = np.array([ca_model[k] for k in keys], dtype=np.float64)

    d_ref = _pairwise_dist(ref)
    d_mod = _pairwise_dist(mod)

    mask = (d_ref > 0.0) & (d_ref < INCLUSION_RADIUS)
    total = int(mask.sum())
    if total == 0:
        raise LddtError("No residue pairs within the inclusion radius.")

    diff = np.abs(d_ref[mask] - d_mod[mask])
    preserved = sum(int((diff < t).sum()) for t in THRESHOLDS)
    lddt = preserved / (total * len(THRESHOLDS))

    return {"lddt": round(float(lddt), 4), "residue_count": len(keys)}


# ── internals ─────────────────────────────────────────────────────────────────


def _ca_coords(structure: gemmi.Structure) -> dict[tuple[str, str], np.ndarray]:
    coords: dict[tuple[str, str], np.ndarray] = {}
    model = structure[0]
    for chain in model:
        for residue in chain:
            if residue.entity_type not in (gemmi.EntityType.Polymer, gemmi.EntityType.Unknown):
                continue
            ca = residue.find_atom("CA", "\0")
            if ca is None:
                continue
            coords[(chain.name, _residue_number(residue))] = np.array(
                [ca.pos.x, ca.pos.y, ca.pos.z], dtype=np.float64
            )
    return coords


def _residue_number(residue: gemmi.Residue) -> str:
    icode = residue.seqid.icode.strip()
    return f"{residue.seqid.num}{icode}" if icode else str(residue.seqid.num)


def _pairwise_dist(x: np.ndarray) -> np.ndarray:
    """Euclidean distance matrix via the Gram trick (N×N, no N×N×3 intermediate)."""
    gram = x @ x.T
    sq = np.diag(gram)
    d2 = sq[:, None] + sq[None, :] - 2.0 * gram
    np.maximum(d2, 0.0, out=d2)
    return np.sqrt(d2)
