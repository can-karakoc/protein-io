"""Tests for per-contact pLDDT confidence annotation."""
import pytest
from app.models import ContactRecord, ResidueConfidence
from app.service import annotate_contacts_with_confidence, build_confidence_lookup


def make_contact(chain_a="A", residue_a="10", chain_b="B", residue_b="20"):
    return ContactRecord(
        chain_a=chain_a, residue_a=residue_a, residue_name_a="ALA", atom_a="CA",
        chain_b=chain_b, residue_b=residue_b, residue_name_b="GLY", atom_b="CA",
        distance_angstrom=3.5, contact_type="residue-residue",
        contact_categories=["protein-protein", "inter-chain"],
    )


def make_confidence(chain_id, residue_number, category):
    plddt = {"very_high": 95.0, "confident": 80.0, "low": 60.0, "very_low": 30.0}[category]
    return ResidueConfidence(
        chain_id=chain_id, residue_number=residue_number,
        residue_name="ALA", plddt=plddt, category=category,
    )


def test_build_confidence_lookup_keys():
    rc = make_confidence("A", "10", "very_high")
    lookup = build_confidence_lookup([rc])
    assert ("A", "10") in lookup
    assert lookup[("A", "10")] is rc


def test_annotate_sets_source_and_target():
    contact = make_contact()
    lookup = build_confidence_lookup([
        make_confidence("A", "10", "very_high"),
        make_confidence("B", "20", "confident"),
    ])
    annotated = annotate_contacts_with_confidence([contact], lookup)
    assert len(annotated) == 1
    c = annotated[0]
    assert c.source_residue_confidence is not None
    assert c.source_residue_confidence.category == "very_high"
    assert c.target_residue_confidence is not None
    assert c.target_residue_confidence.category == "confident"
    assert c.confidence_warning is False


def test_confidence_warning_set_when_source_is_low():
    contact = make_contact()
    lookup = build_confidence_lookup([
        make_confidence("A", "10", "low"),
        make_confidence("B", "20", "very_high"),
    ])
    annotated = annotate_contacts_with_confidence([contact], lookup)
    assert annotated[0].confidence_warning is True


def test_confidence_warning_set_when_target_is_very_low():
    contact = make_contact()
    lookup = build_confidence_lookup([
        make_confidence("A", "10", "very_high"),
        make_confidence("B", "20", "very_low"),
    ])
    annotated = annotate_contacts_with_confidence([contact], lookup)
    assert annotated[0].confidence_warning is True


def test_no_warning_when_no_confidence_data():
    contact = make_contact()
    annotated = annotate_contacts_with_confidence([contact], {})
    c = annotated[0]
    assert c.source_residue_confidence is None
    assert c.target_residue_confidence is None
    assert c.confidence_warning is False


def test_annotate_preserves_all_other_fields():
    contact = make_contact()
    annotated = annotate_contacts_with_confidence([contact], {})
    c = annotated[0]
    assert c.chain_a == "A"
    assert c.residue_a == "10"
    assert c.distance_angstrom == 3.5
    assert c.contact_type == "residue-residue"


def test_original_contacts_not_mutated():
    contact = make_contact()
    lookup = build_confidence_lookup([make_confidence("A", "10", "low")])
    annotate_contacts_with_confidence([contact], lookup)
    # Original contact must be unchanged (model_copy creates new object)
    assert contact.confidence_warning is False
    assert contact.source_residue_confidence is None
