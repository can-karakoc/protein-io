from app.confidence import analyze_plddt_confidence, confidence_category
from app.models import StructureMetadata
from app.parser import parse_pdb_content
from app.service import analyze_pdb_content, analyze_pdb_content_with_timing


ALPHAFOLD_STYLE_PDB = b"""
ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00 95.00           N
ATOM      2  CA  ALA A   1       1.450   0.000   0.000  1.00 95.00           C
ATOM      3  N   GLY A   2       4.000   0.000   0.000  1.00 72.00           N
ATOM      4  CA  GLY A   2       5.450   0.000   0.000  1.00 72.00           C
ATOM      5  N   SER A   3       8.000   0.000   0.000  1.00 61.00           N
ATOM      6  CA  SER A   3       9.450   0.000   0.000  1.00 61.00           C
ATOM      7  N   THR A   4      12.000   0.000   0.000  1.00 42.00           N
ATOM      8  CA  THR A   4      13.450   0.000   0.000  1.00 42.00           C
TER
END
"""


def test_confidence_category_thresholds():
    assert confidence_category(95) == "very_high"
    assert confidence_category(70) == "confident"
    assert confidence_category(50) == "low"
    assert confidence_category(49.9) == "very_low"


def test_plddt_confidence_detects_alphafold_style_filename():
    structure = parse_pdb_content(ALPHAFOLD_STYLE_PDB, structure_id="AF-P69905-F1-model_v4")

    summary, residues, warnings = analyze_plddt_confidence(structure)

    assert summary is not None
    assert summary.residue_count == 4
    assert summary.average_plddt == 67.5
    assert summary.very_high_count == 1
    assert summary.confident_count == 1
    assert summary.low_count == 1
    assert summary.very_low_count == 1
    assert summary.low_confidence_count == 2
    assert [residue.category for residue in residues] == ["very_high", "confident", "low", "very_low"]
    assert warnings


def test_non_predicted_filename_does_not_treat_b_factors_as_plddt():
    structure = parse_pdb_content(ALPHAFOLD_STYLE_PDB, structure_id="experimental-like")

    summary, residues, warnings = analyze_plddt_confidence(structure)

    assert summary is None
    assert residues == []
    assert warnings == []


def test_analysis_response_includes_confidence_for_alphafold_upload():
    response = analyze_pdb_content(ALPHAFOLD_STYLE_PDB, filename="AF-P69905-F1-model_v4.pdb")

    assert response.confidence is not None
    assert response.confidence.low_confidence_count == 2
    assert len(response.residue_confidences) == 4
    assert "low or very low predicted confidence" in response.warnings[0]


def test_force_predicted_via_alphafold_metadata_source():
    """Files with custom (non-AlphaFold) names should still get pLDDT scoring
    when metadata.source is 'alphafold'."""
    metadata = StructureMetadata(source="alphafold")
    result = analyze_pdb_content_with_timing(
        ALPHAFOLD_STYLE_PDB,
        filename="my_design.pdb",
        metadata=metadata,
    )

    assert result.response.confidence is not None
    assert result.response.confidence.residue_count == 4
    assert len(result.response.residue_confidences) == 4
