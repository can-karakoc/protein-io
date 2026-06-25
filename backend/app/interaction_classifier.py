from __future__ import annotations

from app.models import AtomRecord

# Elements that can donate or accept hydrogen bonds
_POLAR_ELEMENTS = frozenset({"N", "O", "S"})

# Charged residues (physiological pH)
_CATIONIC_RESIDUES = frozenset({"ARG", "LYS", "HIS"})
_ANIONIC_RESIDUES = frozenset({"ASP", "GLU"})
_CHARGED_RESIDUES = _CATIONIC_RESIDUES | _ANIONIC_RESIDUES

# Residues with aromatic rings + their ring atom names
_AROMATIC_RESIDUES = frozenset({"PHE", "TYR", "TRP", "HIS"})
_AROMATIC_ATOM_NAMES = frozenset({
    # PHE / TYR shared ring
    "CG", "CD1", "CD2", "CE1", "CE2", "CZ",
    # TYR hydroxyl
    "OH",
    # TRP indole
    "NE1", "CE2", "CE3", "CZ2", "CZ3", "CH2",
    # HIS imidazole
    "ND1", "NE2",
})

# Residues treated as hydrophobic (aliphatic + aromatic)
_HYDROPHOBIC_RESIDUES = frozenset({"ALA", "VAL", "LEU", "ILE", "MET", "PHE", "TRP", "PRO", "TYR"})

# Distance thresholds (Å)
_POLAR_CUTOFF = 3.5
_IONIC_CUTOFF = 5.5
_AROMATIC_CUTOFF = 5.5
_HYDROPHOBIC_CUTOFF = 4.5


def classify_interaction_class(atom_a: AtomRecord, atom_b: AtomRecord, distance: float) -> str:
    """
    Assign a geometric interaction class to a heavy-atom contact pair.

    Rules are applied in priority order (most specific first):
        polar → ionic → aromatic → hydrophobic → unclassified

    These are geometric approximations based on element types and residue
    identities. They are NOT chemistry-validated classifications (no hydrogen
    positions, formal charges, or orbital geometry are used).
    """
    elem_a = atom_a.element.strip().upper()
    elem_b = atom_b.element.strip().upper()
    res_a = atom_a.residue_name.strip().upper()
    res_b = atom_b.residue_name.strip().upper()

    # ── Polar / H-bond candidate ──────────────────────────────────────────
    # N/O/S donor-acceptor pair within classical H-bond range.
    if elem_a in _POLAR_ELEMENTS and elem_b in _POLAR_ELEMENTS and distance <= _POLAR_CUTOFF:
        return "polar"

    # ── Ionic / salt bridge candidate ─────────────────────────────────────
    # Charged protein residue (ARG/LYS/HIS vs ASP/GLU) at medium range,
    # OR a charged residue contacting a ligand (charge unknown without chemistry library).
    a_charged = res_a in _CHARGED_RESIDUES
    b_charged = res_b in _CHARGED_RESIDUES
    if distance <= _IONIC_CUTOFF and (a_charged or b_charged):
        opposite = (
            (res_a in _CATIONIC_RESIDUES and res_b in _ANIONIC_RESIDUES)
            or (res_a in _ANIONIC_RESIDUES and res_b in _CATIONIC_RESIDUES)
        )
        cross_type = atom_a.residue_kind != atom_b.residue_kind
        if opposite or cross_type:
            return "ionic"

    # ── Aromatic / pi contact ─────────────────────────────────────────────
    # Ring atom of PHE/TYR/TRP/HIS within pi-stacking / pi-cation range.
    name_a = atom_a.name.strip().upper()
    name_b = atom_b.name.strip().upper()
    if distance <= _AROMATIC_CUTOFF:
        a_pi = res_a in _AROMATIC_RESIDUES and name_a in _AROMATIC_ATOM_NAMES
        b_pi = res_b in _AROMATIC_RESIDUES and name_b in _AROMATIC_ATOM_NAMES
        if a_pi or b_pi:
            return "aromatic"

    # ── Hydrophobic ───────────────────────────────────────────────────────
    # Carbon-carbon contact where at least one side is a hydrophobic residue.
    if elem_a == "C" and elem_b == "C" and distance <= _HYDROPHOBIC_CUTOFF:
        if res_a in _HYDROPHOBIC_RESIDUES or res_b in _HYDROPHOBIC_RESIDUES:
            return "hydrophobic"

    return "unclassified"
