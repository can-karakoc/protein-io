from app.interaction_classifier import classify_interaction_class
from app.models import AtomRecord


def make_atom(
    residue_name: str,
    element: str,
    atom_name: str,
    residue_kind: str = "protein",
) -> AtomRecord:
    return AtomRecord(
        id=f"{residue_kind}:{residue_name}:{atom_name}",
        name=atom_name,
        element=element,
        x=0.0, y=0.0, z=0.0,
        chain_id="A",
        residue_id="A:1",
        residue_name=residue_name,
        residue_number="1",
        residue_kind=residue_kind,  # type: ignore[arg-type]
    )


# ── salt-bridge ───────────────────────────────────────────────────────────────

def test_salt_bridge_arg_asp():
    a = make_atom("ARG", "N", "NH1")
    b = make_atom("ASP", "O", "OD1")
    assert classify_interaction_class(a, b, 3.2) == "salt-bridge"

def test_salt_bridge_lys_glu():
    a = make_atom("LYS", "N", "NZ")
    b = make_atom("GLU", "O", "OE2")
    assert classify_interaction_class(a, b, 4.0) == "salt-bridge"

def test_salt_bridge_his_asp():
    a = make_atom("HIS", "N", "NE2")
    b = make_atom("ASP", "O", "OD2")
    assert classify_interaction_class(a, b, 3.8) == "salt-bridge"

def test_salt_bridge_beyond_cutoff():
    a = make_atom("ARG", "N", "NH2")
    b = make_atom("GLU", "O", "OE1")
    assert classify_interaction_class(a, b, 5.5) != "salt-bridge"

def test_same_charge_not_salt_bridge():
    a = make_atom("ARG", "N", "NH1")
    b = make_atom("LYS", "N", "NZ")
    assert classify_interaction_class(a, b, 3.5) != "salt-bridge"

def test_non_functional_group_atom_not_salt_bridge():
    # CZ of ARG is not in the charged atom set
    a = make_atom("ARG", "C", "CZ")
    b = make_atom("ASP", "O", "OD1")
    # h-bond wins (N/O pair) or unclassified — not salt-bridge
    assert classify_interaction_class(a, b, 3.2) != "salt-bridge"


# ── halogen bond ──────────────────────────────────────────────────────────────

def test_halogen_bond_cl_to_oxygen():
    a = make_atom("LIG", "CL", "CL1", residue_kind="ligand")
    b = make_atom("SER", "O", "OG")
    assert classify_interaction_class(a, b, 3.4) == "halogen-bond"

def test_halogen_bond_br_to_nitrogen():
    a = make_atom("LIG", "BR", "BR1", residue_kind="ligand")
    b = make_atom("ASN", "N", "ND2")
    assert classify_interaction_class(a, b, 3.8) == "halogen-bond"

def test_halogen_bond_reversed_order():
    a = make_atom("LEU", "O", "O")
    b = make_atom("LIG", "CL", "CL1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 3.5) == "halogen-bond"

def test_halogen_bond_beyond_cutoff():
    a = make_atom("LIG", "CL", "CL1", residue_kind="ligand")
    b = make_atom("SER", "O", "OG")
    assert classify_interaction_class(a, b, 4.5) != "halogen-bond"

def test_fluorine_not_halogen_bond():
    # F is too electronegative to be a halogen-bond donor
    a = make_atom("LIG", "F", "F1", residue_kind="ligand")
    b = make_atom("SER", "O", "OG")
    # Falls through to h-bond (F treated as polar) or unclassified
    assert classify_interaction_class(a, b, 3.0) != "halogen-bond"


# ── h-bond ────────────────────────────────────────────────────────────────────

def test_hbond_nitrogen_nitrogen():
    a = make_atom("LYS", "N", "NZ")
    b = make_atom("ATP", "N", "N1", residue_kind="ligand")
    # NZ is the cationic atom — but distance 3.0 hits h-bond before salt-bridge
    # because the ligand has no anionic functional group atom in our tables
    assert classify_interaction_class(a, b, 3.0) == "h-bond"

def test_hbond_oxygen_nitrogen():
    a = make_atom("SER", "O", "OG")
    b = make_atom("LIG", "N", "N2", residue_kind="ligand")
    assert classify_interaction_class(a, b, 3.2) == "h-bond"

def test_hbond_sulfur_oxygen():
    a = make_atom("CYS", "S", "SG")
    b = make_atom("LIG", "O", "O1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 3.4) == "h-bond"

def test_hbond_exact_boundary():
    a = make_atom("SER", "O", "OG")
    b = make_atom("LIG", "O", "O1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 3.5) == "h-bond"
    assert classify_interaction_class(a, b, 3.6) != "h-bond"

def test_carbon_nitrogen_not_hbond():
    a = make_atom("ALA", "C", "CB")
    b = make_atom("LIG", "N", "N1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 3.0) != "h-bond"


# ── pi-cation ─────────────────────────────────────────────────────────────────

def test_pi_cation_phe_arg():
    a = make_atom("PHE", "C", "CZ")   # ring atom
    b = make_atom("ARG", "N", "NH2")  # cationic N
    assert classify_interaction_class(a, b, 5.5) == "pi-cation"

def test_pi_cation_trp_lys():
    a = make_atom("TRP", "C", "CE3")  # ring atom
    b = make_atom("LYS", "N", "NZ")   # cationic N
    assert classify_interaction_class(a, b, 6.0) == "pi-cation"

def test_pi_cation_beyond_cutoff():
    a = make_atom("PHE", "C", "CZ")
    b = make_atom("ARG", "N", "NH1")
    assert classify_interaction_class(a, b, 7.0) != "pi-cation"

def test_pi_cation_not_if_not_cationic_atom():
    # PHE CZ + LYS CB (not cationic functional group)
    a = make_atom("PHE", "C", "CZ")
    b = make_atom("LYS", "C", "CB")
    assert classify_interaction_class(a, b, 5.0) != "pi-cation"


# ── aromatic ──────────────────────────────────────────────────────────────────

def test_aromatic_phe_ring_atom_to_ligand():
    a = make_atom("PHE", "C", "CZ")
    b = make_atom("LIG", "C", "C1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 4.5) == "aromatic"

def test_aromatic_trp_indole():
    a = make_atom("TRP", "N", "NE1")
    b = make_atom("LIG", "C", "C2", residue_kind="ligand")
    assert classify_interaction_class(a, b, 5.0) == "aromatic"

def test_aromatic_his_ring_atom():
    # HIS ND1 + ligand C — ND1 is aromatic; pi-cation requires cationic atom on OTHER side
    # ligand C is not a cationic protein N → falls to aromatic
    a = make_atom("HIS", "N", "ND1")
    b = make_atom("LIG", "C", "C1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 4.0) == "aromatic"

def test_phe_non_ring_atom_not_aromatic():
    a = make_atom("PHE", "C", "CB")   # CB is not a ring atom
    b = make_atom("LIG", "C", "C1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 4.0) == "hydrophobic"

def test_aromatic_beyond_cutoff():
    a = make_atom("PHE", "C", "CZ")
    b = make_atom("LIG", "C", "C1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 5.6) != "aromatic"


# ── hydrophobic ───────────────────────────────────────────────────────────────

def test_hydrophobic_leu_carbon():
    a = make_atom("LEU", "C", "CD1")
    b = make_atom("LIG", "C", "C3", residue_kind="ligand")
    assert classify_interaction_class(a, b, 4.0) == "hydrophobic"

def test_hydrophobic_val_ala():
    a = make_atom("VAL", "C", "CG1")
    b = make_atom("ALA", "C", "CB")
    assert classify_interaction_class(a, b, 4.0) == "hydrophobic"

def test_hydrophobic_beyond_cutoff():
    a = make_atom("LEU", "C", "CD1")
    b = make_atom("LIG", "C", "C3", residue_kind="ligand")
    assert classify_interaction_class(a, b, 4.6) == "unclassified"

def test_hydrophobic_non_carbon_not_hydrophobic():
    a = make_atom("LEU", "N", "N")
    b = make_atom("LIG", "C", "C1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 4.0) != "hydrophobic"


# ── unclassified ──────────────────────────────────────────────────────────────

def test_unclassified_long_range_carbon():
    a = make_atom("GLY", "C", "CA")
    b = make_atom("LIG", "C", "C1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 4.8) == "unclassified"

def test_unclassified_non_hydrophobic_residue():
    a = make_atom("GLY", "C", "CA")
    b = make_atom("SER", "C", "CB")
    assert classify_interaction_class(a, b, 3.8) == "unclassified"


# ── hbond_strength ────────────────────────────────────────────────────────────

from app.interaction_classifier import classify_hbond_strength

def test_hbond_strength_strong():
    a = make_atom("ASN", "N", "ND2")
    b = make_atom("GLU", "O", "OE1")
    assert classify_hbond_strength(a, b, 2.3) == "strong"

def test_hbond_strength_moderate():
    a = make_atom("ASN", "N", "ND2")
    b = make_atom("GLU", "O", "OE1")
    assert classify_hbond_strength(a, b, 2.8) == "moderate"

def test_hbond_strength_weak():
    a = make_atom("ASN", "N", "ND2")
    b = make_atom("GLU", "O", "OE1")
    assert classify_hbond_strength(a, b, 3.4) == "weak"

def test_hbond_strength_none_beyond_cutoff():
    a = make_atom("ASN", "N", "ND2")
    b = make_atom("GLU", "O", "OE1")
    assert classify_hbond_strength(a, b, 3.6) is None

def test_hbond_strength_none_for_non_polar():
    a = make_atom("ALA", "C", "CA")
    b = make_atom("GLU", "O", "OE1")
    assert classify_hbond_strength(a, b, 2.0) is None

def test_hbond_strength_boundary_strong_moderate():
    # exactly 2.5 → moderate (not strong, boundary is exclusive)
    a = make_atom("SER", "O", "OG")
    b = make_atom("ASP", "O", "OD1")
    assert classify_hbond_strength(a, b, 2.5) == "moderate"

def test_hbond_strength_boundary_moderate_weak():
    # exactly 3.2 → weak (not moderate)
    a = make_atom("SER", "O", "OG")
    b = make_atom("ASP", "O", "OD1")
    assert classify_hbond_strength(a, b, 3.2) == "weak"
