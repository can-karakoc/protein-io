from app.interaction_classifier import classify_interaction_class
from app.models import AtomRecord


# ── helpers ───────────────────────────────────────────────────────────────────

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
        x=0.0,
        y=0.0,
        z=0.0,
        chain_id="A",
        residue_id=f"A:1",
        residue_name=residue_name,
        residue_number="1",
        residue_kind=residue_kind,  # type: ignore[arg-type]
    )


# ── polar ─────────────────────────────────────────────────────────────────────

def test_polar_nitrogen_nitrogen():
    a = make_atom("LYS", "N", "NZ")
    b = make_atom("ATP", "N", "N1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 3.0) == "polar"


def test_polar_oxygen_nitrogen():
    a = make_atom("SER", "O", "OG")
    b = make_atom("LIG", "N", "N2", residue_kind="ligand")
    assert classify_interaction_class(a, b, 3.2) == "polar"


def test_polar_sulfur_oxygen():
    a = make_atom("CYS", "S", "SG")
    b = make_atom("LIG", "O", "O1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 3.4) == "polar"


def test_polar_cutoff_exact_boundary():
    a = make_atom("SER", "O", "OG")
    b = make_atom("LIG", "O", "O1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 3.5) == "polar"
    assert classify_interaction_class(a, b, 3.6) != "polar"


def test_carbon_nitrogen_not_polar():
    a = make_atom("ALA", "C", "CB")
    b = make_atom("LIG", "N", "N1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 3.0) != "polar"


# ── ionic ─────────────────────────────────────────────────────────────────────

def test_ionic_arg_asp():
    a = make_atom("ARG", "C", "CZ")
    b = make_atom("ASP", "C", "CG")
    assert classify_interaction_class(a, b, 4.5) == "ionic"


def test_ionic_lys_glu():
    a = make_atom("LYS", "C", "CE")
    b = make_atom("GLU", "C", "CD")
    assert classify_interaction_class(a, b, 5.0) == "ionic"


def test_ionic_charged_residue_to_ligand():
    a = make_atom("ARG", "C", "CZ")
    b = make_atom("FMN", "C", "C1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 4.0) == "ionic"


def test_ionic_beyond_cutoff():
    a = make_atom("ARG", "C", "CZ")
    b = make_atom("ASP", "C", "CG")
    assert classify_interaction_class(a, b, 6.0) != "ionic"


def test_same_charge_not_ionic():
    # Two cationic residues — same polarity, should not trigger ionic rule
    a = make_atom("ARG", "C", "CZ")
    b = make_atom("LYS", "C", "NZ")
    # Both cationic, no ligand → no opposite charge, no cross-type → not ionic
    assert classify_interaction_class(a, b, 4.0) != "ionic"


# ── aromatic ──────────────────────────────────────────────────────────────────

def test_aromatic_phe_ring_atom():
    a = make_atom("PHE", "C", "CZ")  # CZ is in the ring
    b = make_atom("LIG", "C", "C1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 4.5) == "aromatic"


def test_aromatic_trp_indole():
    a = make_atom("TRP", "C", "NE1")
    b = make_atom("LIG", "C", "C2", residue_kind="ligand")
    assert classify_interaction_class(a, b, 5.0) == "aromatic"


def test_aromatic_trp_non_polar_atom():
    # TRP is aromatic but not charged — aromatic fires for its ring atom
    a = make_atom("TRP", "C", "CE3")
    b = make_atom("LIG", "C", "C1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 4.0) == "aromatic"


def test_his_charges_before_aromatic():
    # HIS is both aromatic and charged; ionic rule fires first for cross-type contacts
    a = make_atom("HIS", "N", "ND1")
    b = make_atom("LIG", "C", "C1", residue_kind="ligand")
    assert classify_interaction_class(a, b, 4.0) == "ionic"


def test_phe_non_ring_atom_not_aromatic():
    # CB is not a ring atom for PHE
    a = make_atom("PHE", "C", "CB")
    b = make_atom("LIG", "C", "C1", residue_kind="ligand")
    # Should fall through to hydrophobic (PHE is hydrophobic)
    assert classify_interaction_class(a, b, 4.0) == "hydrophobic"


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
