from pathlib import Path

from app.contacts import calculate_contacts, is_hydrogen_atom
from app.models import AtomRecord, ChainSummary, ContactRecord, ResidueRecord, StructureData
from app.parser import parse_pdb_path


SAMPLE_PDB = Path(__file__).parents[2] / "examples" / "sample.pdb"
SAMPLE_CIF = Path(__file__).parents[2] / "examples" / "sample.cif"


def test_contact_finder_respects_cutoff_and_returns_typed_records():
    contacts, warnings = calculate_contacts(parse_pdb_path(SAMPLE_PDB), cutoff_angstrom=4.0)

    assert warnings == []
    assert contacts
    assert all(isinstance(contact, ContactRecord) for contact in contacts)
    assert all(contact.distance_angstrom <= 4.0 for contact in contacts)
    assert {contact.contact_type for contact in contacts} == {"protein-ligand", "residue-residue"}


def test_mmcif_contact_finder_returns_typed_records():
    contacts, warnings = calculate_contacts(parse_pdb_path(SAMPLE_CIF), cutoff_angstrom=4.0)

    assert warnings == []
    assert contacts
    assert all(isinstance(contact, ContactRecord) for contact in contacts)
    assert {contact.contact_type for contact in contacts} == {"protein-ligand", "residue-residue"}


def test_contact_finder_avoids_self_contacts():
    contacts, _ = calculate_contacts(parse_pdb_path(SAMPLE_PDB), cutoff_angstrom=4.0)

    assert contacts
    assert not any(
        contact.chain_a == contact.chain_b and contact.residue_a == contact.residue_b for contact in contacts
    )


def test_hydrogen_atoms_are_ignored_in_contacts():
    structure = parse_pdb_path(SAMPLE_PDB)
    contacts, _ = calculate_contacts(structure, cutoff_angstrom=4.0)

    assert not any(contact.atom_a.startswith("H") or contact.atom_b.startswith("H") for contact in contacts)

    hydrogen_atoms = [atom for atom in structure.atoms if atom.name.startswith("H")]
    assert hydrogen_atoms
    assert all(is_hydrogen_atom(atom) for atom in hydrogen_atoms)


def test_contact_results_can_be_capped():
    contacts, warnings = calculate_contacts(parse_pdb_path(SAMPLE_PDB), cutoff_angstrom=4.0, max_contacts=1)

    assert len(contacts) == 1
    assert warnings


def test_neighbor_search_finds_contacts_at_cutoff_boundary():
    structure = StructureData(
        structure_id="grid-test",
        atoms=[
            make_atom("A:protein:1::CA", "CA", 0.1, 0.0, 0.0, "A", "A:protein:1:", "ALA", "1"),
            make_atom("A:protein:2::CA", "CA", 4.0, 0.0, 0.0, "A", "A:protein:2:", "GLY", "2"),
            make_atom("A:protein:3::CA", "CA", 20.0, 0.0, 0.0, "A", "A:protein:3:", "SER", "3"),
        ],
        residues=[
            ResidueRecord(id="A:protein:1:", name="ALA", chain_id="A", residue_number="1", kind="protein", atom_ids=[]),
            ResidueRecord(id="A:protein:2:", name="GLY", chain_id="A", residue_number="2", kind="protein", atom_ids=[]),
            ResidueRecord(id="A:protein:3:", name="SER", chain_id="A", residue_number="3", kind="protein", atom_ids=[]),
        ],
        chains=[ChainSummary(id="A", residue_count=3, atom_count=3)],
        ligands=[],
    )

    contacts, warnings = calculate_contacts(structure, cutoff_angstrom=4.0)

    assert warnings == []
    assert len(contacts) == 1
    assert contacts[0].residue_a == "1"
    assert contacts[0].residue_b == "2"


def make_atom(
    atom_id: str,
    name: str,
    x: float,
    y: float,
    z: float,
    chain_id: str,
    residue_id: str,
    residue_name: str,
    residue_number: str,
) -> AtomRecord:
    return AtomRecord(
        id=atom_id,
        name=name,
        element="C",
        x=x,
        y=y,
        z=z,
        chain_id=chain_id,
        residue_id=residue_id,
        residue_name=residue_name,
        residue_number=residue_number,
        residue_kind="protein",
    )
