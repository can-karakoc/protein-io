"""Proper steric-clash detection (in-house, MolProbity-style).

A clash is a **van der Waals overlap between atoms that are not covalently connected** —
not merely "two atoms closer than 2 Å", which counts every backbone peptide bond. We
build a covalent bond graph (from covalent radii) and exclude 1-2 (bonded) and 1-3 (angle)
pairs, then flag pairs whose VDW spheres overlap by >= 0.4 Å. numpy + scipy only.
"""

from __future__ import annotations

from collections import defaultdict

import numpy as np
from scipy.spatial import cKDTree

from app.contact_classification import classify_contact_type, contact_categories
from app.models import ContactRecord

# Bondi van der Waals radii (Å); fallback for anything unlisted.
_VDW: dict[str, float] = {
    "H": 1.20, "C": 1.70, "N": 1.55, "O": 1.52, "S": 1.80, "P": 1.80, "F": 1.47,
    "CL": 1.75, "BR": 1.85, "I": 1.98, "SE": 1.90, "ZN": 1.39, "MG": 1.73,
    "NA": 2.27, "CA": 2.31, "FE": 1.56, "MN": 1.61, "K": 2.75, "B": 1.92,
}
_VDW_DEFAULT = 1.70

# Cordero covalent radii (Å) for bond perception.
_COV: dict[str, float] = {
    "H": 0.31, "C": 0.76, "N": 0.71, "O": 0.66, "S": 1.05, "P": 1.07, "F": 0.57,
    "CL": 1.02, "BR": 1.20, "I": 1.39, "SE": 1.20, "ZN": 1.22, "MG": 1.41,
    "NA": 1.66, "CA": 1.76, "FE": 1.32, "MN": 1.39, "K": 2.03, "B": 0.84,
}
_COV_DEFAULT = 0.77

BOND_TOLERANCE = 0.45   # two atoms are bonded if dist <= r_cov(a) + r_cov(b) + this
# VDW overlap (Å) at/above which a non-bonded pair is a clash. MolProbity uses 0.4 with
# hydrogens present; on heavy atoms only, routine packing already overlaps up to ~0.5 Å
# (heavy-atom VDW radii assume H fills the gap), so we require 0.7 Å — well-refined
# structures then score ~0 (crambin 0, haemoglobin ~4) instead of ~one per residue.
CLASH_OVERLAP = 0.7


def _el(atom) -> str:
    return (getattr(atom, "element", "") or "").upper()


def _vdw(atom) -> float:
    return _VDW.get(_el(atom), _VDW_DEFAULT)


def _cov(atom) -> float:
    return _COV.get(_el(atom), _COV_DEFAULT)


def detect_clashes(structure) -> list[ContactRecord]:
    """Return genuine steric clashes as ContactRecords (sorted by severity)."""
    atoms = [
        a for a in structure.atoms
        if a.residue_kind in {"protein", "ligand", "water"} and _el(a) != "H" and not a.name.startswith("H")
    ]
    if len(atoms) < 2:
        return []

    coords = np.asarray([[a.x, a.y, a.z] for a in atoms], dtype=np.float64)
    tree = cKDTree(coords)

    # ── covalent bond graph ────────────────────────────────────────────────────
    # Widest covalent bond considered ≈ max(cov)+max(cov)+tol; K is an outlier, so cap.
    adj: dict[int, set[int]] = defaultdict(set)
    for i, j in tree.query_pairs(r=2.2):
        d = float(np.linalg.norm(coords[i] - coords[j]))
        if d <= _cov(atoms[i]) + _cov(atoms[j]) + BOND_TOLERANCE:
            adj[i].add(j)
            adj[j].add(i)

    # ── clash candidates ────────────────────────────────────────────────────────
    # A clash needs overlap >= 0.4, so dist <= vdw(a)+vdw(b)-0.4 <= ~3.6 for heavy atoms.
    records: list[ContactRecord] = []
    for i, j in tree.query_pairs(r=3.6):
        a, b = atoms[i], atoms[j]
        if a.residue_id == b.residue_id:
            continue                       # intra-residue
        if j in adj[i]:
            continue                       # 1-2 (covalently bonded, incl. peptide/disulfide)
        if adj[i] & adj[j]:
            continue                       # 1-3 (share a bonded neighbour — angle pair)
        d = float(np.linalg.norm(coords[i] - coords[j]))
        overlap = _vdw(a) + _vdw(b) - d
        if overlap < CLASH_OVERLAP:
            continue
        ct = classify_contact_type(a, b)
        if ct is None:
            continue
        cats = [*contact_categories(a, b, ct, d), "possible-clash"]
        records.append(ContactRecord(
            chain_a=a.chain_id, residue_a=a.residue_number, residue_name_a=a.residue_name, atom_a=a.name,
            chain_b=b.chain_id, residue_b=b.residue_number, residue_name_b=b.residue_name, atom_b=b.name,
            distance_angstrom=round(d, 3), contact_type=ct, contact_categories=cats,
        ))

    records.sort(key=lambda r: r.distance_angstrom)
    return records


def _pair_key(r: ContactRecord) -> frozenset:
    return frozenset({(r.chain_a, r.residue_a, r.atom_a), (r.chain_b, r.residue_b, r.atom_b)})


def mark_clash_contacts(contacts: list[ContactRecord], clashes: list[ContactRecord]) -> list[ContactRecord]:
    """Tag the contact-table rows that correspond to a real clash (for trust labels + filters)."""
    keys = {_pair_key(c) for c in clashes}
    if not keys:
        return contacts
    out: list[ContactRecord] = []
    for c in contacts:
        if _pair_key(c) in keys and "possible-clash" not in c.contact_categories:
            out.append(c.model_copy(update={"contact_categories": [*c.contact_categories, "possible-clash"]}))
        else:
            out.append(c)
    return out
