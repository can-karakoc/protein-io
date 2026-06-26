"""Tests for water bridge detection."""
from app.contacts import find_water_bridges, WATER_BRIDGE_CUTOFF
from app.models import AtomRecord, StructureData, ChainSummary, LigandSummary, ResidueRecord


def make_atom(
    id: str,
    x: float,
    y: float,
    z: float,
    residue_kind: str,
    residue_name: str = "ALA",
    chain_id: str = "A",
    residue_id: str | None = None,
    residue_number: str = "1",
    element: str = "O",
) -> AtomRecord:
    return AtomRecord(
        id=id,
        name="CA",
        element=element,
        x=x,
        y=y,
        z=z,
        chain_id=chain_id,
        residue_id=residue_id or f"{chain_id}:{residue_kind}:{residue_number}:",
        residue_name=residue_name,
        residue_number=residue_number,
        residue_kind=residue_kind,  # type: ignore[arg-type]
    )


def make_structure(atoms: list[AtomRecord]) -> StructureData:
    return StructureData(
        structure_id="test",
        atoms=atoms,
        residues=[],
        chains=[],
        ligands=[],
    )


def test_basic_water_bridge():
    """Water at origin bridges protein (x=-3) and ligand (x=+3) — both within 3.5Å."""
    protein = make_atom("p1", -3.0, 0.0, 0.0, "protein", "ALA", residue_number="10")
    water   = make_atom("w1",  0.0, 0.0, 0.0, "water",   "HOH", residue_number="100")
    ligand  = make_atom("l1",  3.0, 0.0, 0.0, "ligand",  "LIG", chain_id="B", residue_number="200")

    bridges = find_water_bridges(make_structure([protein, water, ligand]))

    assert len(bridges) == 1
    b = bridges[0]
    assert b.protein_residue_name == "ALA"
    assert b.ligand_residue_name == "LIG"
    assert b.dist_to_protein == 3.0
    assert b.dist_to_ligand == 3.0


def test_no_bridge_when_water_too_far_from_ligand():
    """Water close to protein but 5Å from ligand — no bridge."""
    protein = make_atom("p1", -2.0, 0.0, 0.0, "protein", "ALA", residue_number="10")
    water   = make_atom("w1",  0.0, 0.0, 0.0, "water",   "HOH", residue_number="100")
    ligand  = make_atom("l1",  5.0, 0.0, 0.0, "ligand",  "LIG", chain_id="B", residue_number="200")

    bridges = find_water_bridges(make_structure([protein, water, ligand]))
    assert len(bridges) == 0


def test_no_bridge_when_water_too_far_from_protein():
    """Water close to ligand but 5Å from protein — no bridge."""
    protein = make_atom("p1", -5.0, 0.0, 0.0, "protein", "ALA", residue_number="10")
    water   = make_atom("w1",  0.0, 0.0, 0.0, "water",   "HOH", residue_number="100")
    ligand  = make_atom("l1",  2.0, 0.0, 0.0, "ligand",  "LIG", chain_id="B", residue_number="200")

    bridges = find_water_bridges(make_structure([protein, water, ligand]))
    assert len(bridges) == 0


def test_two_waters_two_bridges():
    """Two independent bridging waters → two bridge records."""
    protein  = make_atom("p1",  0.0, 0.0, 0.0, "protein", "GLY", residue_number="1")
    water1   = make_atom("w1",  3.0, 0.0, 0.0, "water",   "HOH", residue_number="101")
    water2   = make_atom("w2",  3.0, 1.0, 0.0, "water",   "HOH", residue_number="102")
    ligand   = make_atom("l1",  6.0, 0.0, 0.0, "ligand",  "LIG", chain_id="B", residue_number="200")

    bridges = find_water_bridges(make_structure([protein, water1, water2, ligand]))
    assert len(bridges) == 2


def test_empty_when_no_ligand():
    """No ligand atoms → no bridges."""
    protein = make_atom("p1", 0.0, 0.0, 0.0, "protein", "ALA", residue_number="1")
    water   = make_atom("w1", 2.0, 0.0, 0.0, "water",   "HOH", residue_number="100")

    bridges = find_water_bridges(make_structure([protein, water]))
    assert bridges == []


def test_empty_when_no_water():
    """No water atoms → no bridges."""
    protein = make_atom("p1", 0.0, 0.0, 0.0, "protein", "ALA", residue_number="1")
    ligand  = make_atom("l1", 2.0, 0.0, 0.0, "ligand",  "LIG", chain_id="B", residue_number="200")

    bridges = find_water_bridges(make_structure([protein, ligand]))
    assert bridges == []


def test_boundary_exactly_at_cutoff():
    """Distance exactly equal to WATER_BRIDGE_CUTOFF is included."""
    protein = make_atom("p1", -WATER_BRIDGE_CUTOFF, 0.0, 0.0, "protein", "ALA", residue_number="1")
    water   = make_atom("w1",  0.0,                 0.0, 0.0, "water",   "HOH", residue_number="100")
    ligand  = make_atom("l1",  WATER_BRIDGE_CUTOFF, 0.0, 0.0, "ligand",  "LIG", chain_id="B", residue_number="200")

    bridges = find_water_bridges(make_structure([protein, water, ligand]))
    assert len(bridges) == 1


def test_closest_protein_atom_selected():
    """When two protein atoms are within range, the closer one is reported."""
    protein_far   = make_atom("p1", -3.4, 0.0, 0.0, "protein", "ALA", residue_id="A:protein:1:", residue_number="1")
    protein_close = make_atom("p2", -2.0, 0.0, 0.0, "protein", "GLY", residue_id="A:protein:2:", residue_number="2")
    water         = make_atom("w1",  0.0, 0.0, 0.0, "water",   "HOH", residue_number="100")
    ligand        = make_atom("l1",  3.0, 0.0, 0.0, "ligand",  "LIG", chain_id="B", residue_number="200")

    bridges = find_water_bridges(make_structure([protein_far, protein_close, water, ligand]))
    assert len(bridges) == 1
    assert bridges[0].protein_residue_name == "GLY"
    assert bridges[0].dist_to_protein == 2.0
