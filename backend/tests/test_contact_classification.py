from app.contact_classification import contact_categories, summarize_interactions, summarize_ligand_interactions
from app.models import AtomRecord, ContactRecord


def test_very_close_contact_threshold_is_strictly_below_two_angstrom():
    protein = make_atom("A", "1", "ALA", "protein")
    ligand = make_atom("B", "101", "ATP", "ligand")

    assert "very-close-contact" in contact_categories(protein, ligand, "protein-ligand", 1.999)
    assert "very-close-contact" not in contact_categories(protein, ligand, "protein-ligand", 2.0)


def test_summarize_interactions_counts_categories_and_top_items():
    contacts = [
        make_contact(
            "A",
            "1",
            "ALA",
            "A",
            "2",
            "GLY",
            1.7,
            "residue-residue",
            ["protein-protein", "intra-chain", "very-close-contact"],
        ),
        make_contact(
            "A",
            "1",
            "ALA",
            "B",
            "101",
            "ATP",
            2.8,
            "protein-ligand",
            ["protein-ligand"],
        ),
        make_contact(
            "B",
            "101",
            "ATP",
            "A",
            "3",
            "SER",
            3.8,
            "protein-ligand",
            ["protein-ligand"],
        ),
        make_contact(
            "B",
            "101",
            "ATP",
            "B",
            "201",
            "HOH",
            2.5,
            "ligand-water",
            ["ligand-water"],
        ),
    ]

    summary = summarize_interactions(contacts)

    assert summary.protein_protein_count == 1
    assert summary.protein_ligand_count == 2
    assert summary.ligand_water_count == 1
    assert summary.intra_chain_count == 1
    assert summary.very_close_contact_count == 1
    assert summary.top_contacting_residues[0].residue_name == "ALA"
    assert summary.top_contacting_residues[0].contact_count == 2
    assert summary.top_contacting_ligands[0].name == "ATP"
    assert summary.top_contacting_ligands[0].contact_count == 3
    assert summary.closest_contacts[0].distance_angstrom == 1.7
    assert summary.very_close_contacts[0].distance_angstrom == 1.7


def test_summarize_ligand_interactions_groups_contacts_by_ligand():
    contacts = [
        make_contact(
            "A",
            "1",
            "ALA",
            "B",
            "101",
            "ATP",
            1.8,
            "protein-ligand",
            ["protein-ligand", "very-close-contact"],
        ),
        make_contact(
            "A",
            "2",
            "GLY",
            "B",
            "101",
            "ATP",
            2.8,
            "protein-ligand",
            ["protein-ligand"],
        ),
        make_contact(
            "B",
            "101",
            "ATP",
            "B",
            "201",
            "HOH",
            3.5,
            "ligand-water",
            ["ligand-water"],
        ),
    ]

    ligand_summaries = summarize_ligand_interactions(contacts)

    assert len(ligand_summaries) == 1
    ligand = ligand_summaries[0]
    assert ligand.name == "ATP"
    assert ligand.chain_id == "B"
    assert ligand.residue_number == "101"
    assert ligand.contact_count == 3
    assert ligand.protein_contact_count == 2
    assert ligand.water_contact_count == 1
    assert ligand.very_close_contact_count == 1
    assert ligand.closest_distance_angstrom == 1.8
    assert ligand.closest_contact is not None
    assert ligand.closest_contact.residue_name_a == "ALA"
    assert [residue.residue_name for residue in ligand.contacting_residues] == ["ALA", "GLY"]
    assert ligand.distance_distribution.under_2_angstrom == 1
    assert ligand.distance_distribution.two_to_3_angstrom == 1
    assert ligand.distance_distribution.three_to_4_angstrom == 1


def make_contact(
    chain_a: str,
    residue_a: str,
    residue_name_a: str,
    chain_b: str,
    residue_b: str,
    residue_name_b: str,
    distance: float,
    contact_type: str,
    categories: list[str],
) -> ContactRecord:
    return ContactRecord(
        chain_a=chain_a,
        residue_a=residue_a,
        residue_name_a=residue_name_a,
        atom_a="CA",
        chain_b=chain_b,
        residue_b=residue_b,
        residue_name_b=residue_name_b,
        atom_b="CB",
        distance_angstrom=distance,
        contact_type=contact_type,  # type: ignore[arg-type]
        contact_categories=categories,  # type: ignore[arg-type]
    )


def make_atom(chain_id: str, residue_number: str, residue_name: str, residue_kind: str) -> AtomRecord:
    return AtomRecord(
        id=f"{chain_id}:{residue_number}:CA",
        name="CA",
        element="C",
        x=0,
        y=0,
        z=0,
        chain_id=chain_id,
        residue_id=f"{chain_id}:{residue_number}",
        residue_name=residue_name,
        residue_number=residue_number,
        residue_kind=residue_kind,  # type: ignore[arg-type]
    )
