from pathlib import Path

from app.service import compare_pdb_contents


SAMPLE_PDB = Path(__file__).parents[2] / "examples" / "sample.pdb"
SAMPLE_CIF = Path(__file__).parents[2] / "examples" / "sample.cif"


def test_compare_pdb_contents_reports_count_deltas_and_contact_sets():
    comparison = compare_pdb_contents(
        SAMPLE_PDB.read_bytes(),
        SAMPLE_CIF.read_bytes(),
        filename_a="sample.pdb",
        filename_b="sample.cif",
        cutoff_angstrom=4.0,
    )

    assert comparison.delta.atom_count_delta == 0
    assert comparison.delta.residue_count_delta == 0
    assert comparison.delta.chain_count_delta == 0
    assert comparison.delta.ligand_count_delta == 0
    assert comparison.delta.contact_count_delta == 0
    assert comparison.contacts.shared_contact_count == comparison.structure_a.summary.contact_count
    assert comparison.contacts.gained_contact_count == 0
    assert comparison.contacts.lost_contact_count == 0
    assert comparison.contacts.shared_contacts
    assert comparison.warnings[0].startswith("Comparison uses residue-level contact identities")
