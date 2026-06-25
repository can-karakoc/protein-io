from app.interfaces import analyze_interfaces
from app.models import ContactRecord, ResidueConfidence


def make_inter_chain_contact(ca, ra, cb, rb, distance=3.5):
    return ContactRecord(
        chain_a=ca, residue_a=ra, residue_name_a="ALA", atom_a="CA",
        chain_b=cb, residue_b=rb, residue_name_b="GLY", atom_b="CA",
        distance_angstrom=distance, contact_type="residue-residue",
        contact_categories=["protein-protein", "inter-chain"],
    )


def make_intra_chain_contact(c, ra, rb):
    return ContactRecord(
        chain_a=c, residue_a=ra, residue_name_a="ALA", atom_a="CA",
        chain_b=c, residue_b=rb, residue_name_b="GLY", atom_b="CA",
        distance_angstrom=3.8, contact_type="residue-residue",
        contact_categories=["protein-protein", "intra-chain"],
    )


def test_inter_chain_contact_counted():
    contacts = [make_inter_chain_contact("A", "10", "B", "20")]
    result = analyze_interfaces(contacts, [])
    assert result.inter_chain_contact_count == 1
    assert len(result.chain_pairs) == 1
    assert result.chain_pairs[0].chain_a == "A"
    assert result.chain_pairs[0].chain_b == "B"


def test_intra_chain_contact_counted():
    contacts = [make_intra_chain_contact("A", "10", "11")]
    result = analyze_interfaces(contacts, [])
    assert result.intra_chain_contact_count == 1
    assert len(result.chain_pairs) == 0


def test_chain_pairs_sorted_by_contact_count():
    contacts = [
        make_inter_chain_contact("A", "1", "C", "1"),
        make_inter_chain_contact("A", "2", "B", "1"),
        make_inter_chain_contact("A", "3", "B", "2"),
    ]
    result = analyze_interfaces(contacts, [])
    assert result.chain_pairs[0].contact_count == 2  # A-B pair has 2
    assert result.chain_pairs[1].contact_count == 1  # A-C pair has 1


def test_interface_mean_plddt_computed():
    contacts = [make_inter_chain_contact("A", "1", "B", "2")]
    confidences = [
        ResidueConfidence(chain_id="A", residue_number="1", residue_name="ALA", plddt=90.0, category="very_high"),
        ResidueConfidence(chain_id="B", residue_number="2", residue_name="GLY", plddt=60.0, category="low"),
    ]
    result = analyze_interfaces(contacts, confidences)
    assert result.chain_pairs[0].mean_plddt_a == 90.0
    assert result.chain_pairs[0].mean_plddt_b == 60.0


def test_no_plddt_data_gives_none():
    contacts = [make_inter_chain_contact("A", "1", "B", "2")]
    result = analyze_interfaces(contacts, [])
    assert result.chain_pairs[0].mean_plddt_a is None
    assert result.chain_pairs[0].mean_plddt_b is None


def test_interface_residue_counts():
    contacts = [
        make_inter_chain_contact("A", "1", "B", "10"),
        make_inter_chain_contact("A", "2", "B", "10"),  # same B residue, different A
    ]
    result = analyze_interfaces(contacts, [])
    pair = result.chain_pairs[0]
    assert pair.interface_residue_count_a == 2
    assert pair.interface_residue_count_b == 1  # residue 10 seen twice but counted once


def test_residue_attribution_with_reversed_chain_order():
    """Contact stored as B→A should still attribute residues to the correct chain."""
    contacts = [make_inter_chain_contact("B", "20", "A", "10")]
    result = analyze_interfaces(contacts, [])
    pair = result.chain_pairs[0]
    assert pair.chain_a == "A"
    assert pair.chain_b == "B"
    assert pair.interface_residue_count_a == 1
    assert pair.interface_residue_count_b == 1
