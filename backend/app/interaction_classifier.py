from __future__ import annotations

from app.models import AtomRecord

# ── Polar elements (H-bond donors / acceptors) ────────────────────────────────
_POLAR_ELEMENTS = frozenset({"N", "O", "S"})

# ── Salt-bridge: specific functional-group atom names per residue ─────────────
# Cationic: ARG guanidinium, LYS ε-amino, HIS imidazole
_CATIONIC: dict[str, frozenset[str]] = {
    "ARG": frozenset({"NE", "NH1", "NH2"}),
    "LYS": frozenset({"NZ"}),
    "HIS": frozenset({"ND1", "NE2"}),
}
# Anionic: ASP / GLU carboxylate oxygens
_ANIONIC: dict[str, frozenset[str]] = {
    "ASP": frozenset({"OD1", "OD2"}),
    "GLU": frozenset({"OE1", "OE2"}),
}

# ── Aromatic residues and their ring atom names ───────────────────────────────
_AROMATIC_RESIDUES = frozenset({"PHE", "TYR", "TRP", "HIS"})
_AROMATIC_ATOM_NAMES = frozenset({
    # PHE / TYR shared benzene ring
    "CG", "CD1", "CD2", "CE1", "CE2", "CZ",
    # TYR hydroxyl oxygen (participates in pi system)
    "OH",
    # TRP indole (both rings)
    "NE1", "CE2", "CE3", "CZ2", "CZ3", "CH2",
    # HIS imidazole (overlaps with cationic atoms intentionally)
    "ND1", "NE2",
})

# ── Hydrophobic residues ──────────────────────────────────────────────────────
_HYDROPHOBIC_RESIDUES = frozenset({"ALA", "VAL", "LEU", "ILE", "MET", "PHE", "TRP", "PRO", "TYR"})

# ── Halogen-bond donor elements (ligand typically) ────────────────────────────
# F excluded — C–F is too electronegative to donate; Cl/Br/I are effective donors
_HALOGEN_DONORS = frozenset({"CL", "BR", "I"})

# ── Distance thresholds (Å) ───────────────────────────────────────────────────
_SALT_BRIDGE_CUTOFF  = 5.0   # charged functional groups
_HALOGEN_CUTOFF      = 4.0   # C–X···N/O
_HBOND_CUTOFF        = 3.5   # N/O/S donor–acceptor
_PI_CATION_CUTOFF    = 6.5   # aromatic centroid proxy (ring atom) + cationic N
_AROMATIC_CUTOFF     = 5.5   # ring-atom to ring-atom / ring-atom to ligand
_HYDROPHOBIC_CUTOFF  = 4.5   # C–C between non-polar heavy atoms


def _is_cationic(res: str, name: str) -> bool:
    return name in _CATIONIC.get(res, frozenset())


def _is_anionic(res: str, name: str) -> bool:
    return name in _ANIONIC.get(res, frozenset())


def _is_aromatic_ring_atom(res: str, name: str) -> bool:
    return res in _AROMATIC_RESIDUES and name in _AROMATIC_ATOM_NAMES


def classify_interaction_class(atom_a: AtomRecord, atom_b: AtomRecord, distance: float) -> str:
    """
    Assign a geometric interaction subtype to a heavy-atom contact pair.

    Priority (most specific first):
        salt-bridge → halogen-bond → h-bond → pi-cation → aromatic → hydrophobic → unclassified

    These are heavy-atom geometry approximations: no hydrogen positions or formal
    charges are used. Results agree with PLIP/Arpeggio on well-resolved PDB
    structures but should be treated as heuristic, not chemistry-validated.
    """
    elem_a = atom_a.element.strip().upper()
    elem_b = atom_b.element.strip().upper()
    res_a  = atom_a.residue_name.strip().upper()
    res_b  = atom_b.residue_name.strip().upper()
    name_a = atom_a.name.strip().upper()
    name_b = atom_b.name.strip().upper()

    # ── 1. Salt bridge ────────────────────────────────────────────────────────
    # Requires a specifically-charged functional-group atom on each side.
    if distance <= _SALT_BRIDGE_CUTOFF:
        a_cat = _is_cationic(res_a, name_a)
        a_ani = _is_anionic(res_a, name_a)
        b_cat = _is_cationic(res_b, name_b)
        b_ani = _is_anionic(res_b, name_b)
        if (a_cat and b_ani) or (a_ani and b_cat):
            return "salt-bridge"

    # ── 2. Halogen bond ───────────────────────────────────────────────────────
    # C–X···(N/O) geometry: halogen as donor, N/O as acceptor.
    if distance <= _HALOGEN_CUTOFF:
        if elem_a in _HALOGEN_DONORS and elem_b in _POLAR_ELEMENTS:
            return "halogen-bond"
        if elem_b in _HALOGEN_DONORS and elem_a in _POLAR_ELEMENTS:
            return "halogen-bond"

    # ── 3. H-bond ─────────────────────────────────────────────────────────────
    # N/O/S heavy-atom donor–acceptor pair within classical H-bond range.
    if elem_a in _POLAR_ELEMENTS and elem_b in _POLAR_ELEMENTS and distance <= _HBOND_CUTOFF:
        return "h-bond"

    # ── 4. Pi-cation ──────────────────────────────────────────────────────────
    # Aromatic ring atom (PHE/TYR/TRP/HIS) + cationic N (ARG/LYS/HIS).
    if distance <= _PI_CATION_CUTOFF:
        a_pi  = _is_aromatic_ring_atom(res_a, name_a)
        b_pi  = _is_aromatic_ring_atom(res_b, name_b)
        a_cat = _is_cationic(res_a, name_a)
        b_cat = _is_cationic(res_b, name_b)
        if (a_pi and b_cat) or (b_pi and a_cat):
            return "pi-cation"

    # ── 5. Aromatic / pi contact ──────────────────────────────────────────────
    # Ring atom of PHE/TYR/TRP/HIS within pi-stacking or pi-ligand range.
    if distance <= _AROMATIC_CUTOFF:
        a_pi = _is_aromatic_ring_atom(res_a, name_a)
        b_pi = _is_aromatic_ring_atom(res_b, name_b)
        if a_pi or b_pi:
            return "aromatic"

    # ── 6. Hydrophobic ────────────────────────────────────────────────────────
    # Carbon–carbon contact where at least one side is a non-polar residue.
    if elem_a == "C" and elem_b == "C" and distance <= _HYDROPHOBIC_CUTOFF:
        if res_a in _HYDROPHOBIC_RESIDUES or res_b in _HYDROPHOBIC_RESIDUES:
            return "hydrophobic"

    return "unclassified"


def classify_hbond_strength(
    atom_a: AtomRecord,
    atom_b: AtomRecord,
    distance: float,
) -> str | None:
    """
    Return h-bond strength tier for a polar heavy-atom contact, or None if not an h-bond.

    Tiers based on donor–acceptor distance (N/O/S heavy atoms only):
        strong   < 2.5 Å  — short, well-formed H-bond
        moderate 2.5–3.2 Å — typical H-bond range
        weak     3.2–3.5 Å — long-range / marginal H-bond
    """
    elem_a = atom_a.element.strip().upper()
    elem_b = atom_b.element.strip().upper()
    if elem_a not in _POLAR_ELEMENTS or elem_b not in _POLAR_ELEMENTS:
        return None
    if distance > _HBOND_CUTOFF:
        return None
    if distance < 2.5:
        return "strong"
    if distance < 3.2:
        return "moderate"
    return "weak"
