from app.trust_score import assign_trust_label
from app.models import ContactRecord, ResidueConfidence


def make_contact(src_cat=None, tgt_cat=None, categories=None):
    src = ResidueConfidence(chain_id="A", residue_number="1", residue_name="ALA", plddt=80.0, category=src_cat) if src_cat else None
    tgt = ResidueConfidence(chain_id="A", residue_number="2", residue_name="GLY", plddt=80.0, category=tgt_cat) if tgt_cat else None
    return ContactRecord(
        chain_a="A", residue_a="1", residue_name_a="ALA", atom_a="CA",
        chain_b="A", residue_b="2", residue_name_b="GLY", atom_b="CA",
        distance_angstrom=3.5, contact_type="residue-residue",
        contact_categories=categories or ["protein-protein", "intra-chain"],
        source_residue_confidence=src, target_residue_confidence=tgt,
    )


def test_possible_clash_overrides_confidence():
    c = make_contact(src_cat="very_high", tgt_cat="very_high", categories=["protein-protein", "possible-clash"])
    assert assign_trust_label(c) == "possible-clash"


def test_both_very_high_is_high_confidence():
    c = make_contact(src_cat="very_high", tgt_cat="very_high")
    assert assign_trust_label(c) == "high-confidence"


def test_one_low_is_low_confidence():
    c = make_contact(src_cat="very_high", tgt_cat="low")
    assert assign_trust_label(c) == "low-confidence"


def test_very_low_is_low_confidence():
    c = make_contact(src_cat="confident", tgt_cat="very_low")
    assert assign_trust_label(c) == "low-confidence"


def test_no_confidence_data():
    c = make_contact()
    assert assign_trust_label(c) == "no-confidence-data"


def test_mixed_confident_is_inspect_manually():
    c = make_contact(src_cat="very_high", tgt_cat="confident")
    assert assign_trust_label(c) == "inspect-manually"


def test_one_side_none_other_very_high():
    """When only one side has confidence and it is very_high, result is inspect-manually (not high-confidence)."""
    c = make_contact(src_cat="very_high", tgt_cat=None)
    assert assign_trust_label(c) == "inspect-manually"
