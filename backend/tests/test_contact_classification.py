from app.contact_classification import summarize_interactions
from app.models import ContactRecord


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
            ["protein-protein", "intra-chain", "possible-clash"],
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
    assert summary.protein_ligand_count == 1
    assert summary.ligand_water_count == 1
    assert summary.intra_chain_count == 1
    assert summary.possible_clash_count == 1
    assert summary.top_contacting_residues[0].residue_name == "ALA"
    assert summary.top_contacting_residues[0].contact_count == 2
    assert summary.top_contacting_ligands[0].name == "ATP"
    assert summary.closest_contacts[0].distance_angstrom == 1.7
    assert summary.possible_clashes[0].distance_angstrom == 1.7


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
