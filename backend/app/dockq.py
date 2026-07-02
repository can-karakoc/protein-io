"""DockQ — quality of a predicted complex interface vs a reference (Phase 11).

DockQ (Basu & Wallner, 2016) is the standard continuous [0, 1] score for protein
complex predictions, combining three CAPRI quantities on the primary interface:

    Fnat  — fraction of native (reference) residue–residue contacts preserved
    iRMSD — interface backbone RMSD after superposing the interface
    LRMSD — ligand-chain backbone RMSD after superposing on the receptor chain

    DockQ = (Fnat + 1/(1+(iRMSD/1.5)²) + 1/(1+(LRMSD/8.5)²)) / 3

In-house implementation (numpy Kabsch, scipy contacts — no external dependency).
Chains and residues are matched between model (A) and reference (B) by identity, so
this is meaningful for a predicted-vs-experimental structure of the same complex.
The primary interface (most native contacts) is scored.
"""

from __future__ import annotations

from itertools import combinations

import numpy as np

import gemmi

from app.parser import classify_residue, parse_gemmi_structure

BACKBONE = ("N", "CA", "C", "O")
CONTACT_CUTOFF = 5.0


class DockQError(Exception):
    pass


def compute_dockq(
    content_model: bytes,
    content_ref: bytes,
    filename_model: str | None = None,
    filename_ref: str | None = None,
) -> dict:
    try:
        model = parse_gemmi_structure(content_model.decode("utf-8", errors="replace"), "model")
        reference = parse_gemmi_structure(content_ref.decode("utf-8", errors="replace"), "reference")
    except Exception as exc:
        raise DockQError(f"Parse error: {exc}") from exc

    bb_m = _backbone_atoms(model)
    bb_r = _backbone_atoms(reference)
    common_bb = [k for k in bb_r if k in bb_m]  # (chain, resnum, atom_name) in both
    chains = sorted({c for c, _, _ in common_bb})
    if len(chains) < 2:
        raise DockQError("Need at least two matching chains for DockQ.")

    heavy_r = _heavy_by_chain(reference)
    heavy_m = _heavy_by_chain(model)

    # Primary interface = chain pair with the most native (reference) contacts.
    best: tuple[str, str, set[tuple[str, str]]] | None = None
    for a, b in combinations(chains, 2):
        native = _residue_contacts(heavy_r, a, b)
        if native and (best is None or len(native) > len(best[2])):
            best = (a, b, native)
    if best is None:
        raise DockQError("No inter-chain contacts found in the reference.")
    a, b, native = best

    model_contacts = _residue_contacts(heavy_m, a, b)
    fnat = len(native & model_contacts) / len(native)

    iface_res_a = {ra for ra, _ in native}
    iface_res_b = {rb for _, rb in native}
    iface_keys = [
        k for k in common_bb
        if (k[0] == a and k[1] in iface_res_a) or (k[0] == b and k[1] in iface_res_b)
    ]
    if len(iface_keys) < 3:
        raise DockQError("Too few interface backbone atoms for iRMSD.")

    _, irmsd = _superpose(
        np.array([bb_m[k] for k in iface_keys]), np.array([bb_r[k] for k in iface_keys])
    )

    # Receptor = the chain with more matched backbone residues; ligand = the other.
    count_a = sum(1 for k in common_bb if k[0] == a)
    count_b = sum(1 for k in common_bb if k[0] == b)
    receptor, ligand = (a, b) if count_a >= count_b else (b, a)
    rec_keys = [k for k in common_bb if k[0] == receptor]
    lig_keys = [k for k in common_bb if k[0] == ligand]
    if len(rec_keys) < 3 or len(lig_keys) < 1:
        raise DockQError("Too few backbone atoms for LRMSD.")

    transform, _ = _superpose(
        np.array([bb_m[k] for k in rec_keys]), np.array([bb_r[k] for k in rec_keys])
    )
    lig_mod = transform(np.array([bb_m[k] for k in lig_keys]))
    lig_ref = np.array([bb_r[k] for k in lig_keys])
    lrmsd = float(np.sqrt(((lig_mod - lig_ref) ** 2).sum(axis=1).mean()))

    dockq = (fnat + 1.0 / (1.0 + (irmsd / 1.5) ** 2) + 1.0 / (1.0 + (lrmsd / 8.5) ** 2)) / 3.0

    return {
        "dockq": round(float(dockq), 4),
        "fnat": round(float(fnat), 4),
        "irmsd": round(float(irmsd), 3),
        "lrmsd": round(float(lrmsd), 3),
        "quality": _quality(dockq),
        "chain_a": a,
        "chain_b": b,
    }


def _quality(dockq: float) -> str:
    if dockq >= 0.80:
        return "high"
    if dockq >= 0.49:
        return "medium"
    if dockq >= 0.23:
        return "acceptable"
    return "incorrect"


# ── internals ─────────────────────────────────────────────────────────────────


def _residue_number(residue: gemmi.Residue) -> str:
    icode = residue.seqid.icode.strip()
    return f"{residue.seqid.num}{icode}" if icode else str(residue.seqid.num)


def _backbone_atoms(structure: gemmi.Structure) -> dict[tuple[str, str, str], np.ndarray]:
    out: dict[tuple[str, str, str], np.ndarray] = {}
    model = structure[0]
    for chain in model:
        for residue in chain:
            if classify_residue(residue) != "protein":
                continue
            resnum = _residue_number(residue)
            for name in BACKBONE:
                atom = residue.find_atom(name, "\0")
                if atom is not None:
                    out[(chain.name, resnum, name)] = np.array(
                        [atom.pos.x, atom.pos.y, atom.pos.z], dtype=np.float64
                    )
    return out


def _heavy_by_chain(structure: gemmi.Structure) -> dict[str, tuple[np.ndarray, list[str]]]:
    coords: dict[str, list[list[float]]] = {}
    resnums: dict[str, list[str]] = {}
    model = structure[0]
    for chain in model:
        for residue in chain:
            if classify_residue(residue) != "protein":
                continue
            resnum = _residue_number(residue)
            for atom in residue:
                if atom.element.atomic_number <= 1:
                    continue
                coords.setdefault(chain.name, []).append([atom.pos.x, atom.pos.y, atom.pos.z])
                resnums.setdefault(chain.name, []).append(resnum)
    return {c: (np.asarray(coords[c], dtype=np.float64), resnums[c]) for c in coords}


def _residue_contacts(
    heavy: dict[str, tuple[np.ndarray, list[str]]], a: str, b: str
) -> set[tuple[str, str]]:
    if a not in heavy or b not in heavy:
        return set()
    from scipy.spatial.distance import cdist

    coords_a, res_a = heavy[a]
    coords_b, res_b = heavy[b]
    dist = cdist(coords_a, coords_b)
    ii, jj = np.where(dist < CONTACT_CUTOFF)
    return {(res_a[i], res_b[j]) for i, j in zip(ii, jj)}


def _superpose(mobile: np.ndarray, target: np.ndarray):
    """Kabsch fit of `mobile` onto `target`. Returns (transform_fn, rmsd)."""
    m_mean = mobile.mean(axis=0)
    t_mean = target.mean(axis=0)
    mc = mobile - m_mean
    tc = target - t_mean
    h = mc.T @ tc
    u, _, vt = np.linalg.svd(h)
    d = np.sign(np.linalg.det(vt.T @ u.T))
    rot = vt.T @ np.diag([1.0, 1.0, d]) @ u.T

    def transform(points: np.ndarray) -> np.ndarray:
        return (points - m_mean) @ rot.T + t_mean

    rmsd = float(np.sqrt(((transform(mobile) - target) ** 2).sum(axis=1).mean()))
    return transform, rmsd
