from pathlib import Path

import pytest

from app.models import StructureData
from app.parser import (
    StructureParseError,
    detect_structure_format_from_filename,
    parse_pdb_content,
    parse_pdb_path,
)


SAMPLE_PDB = Path(__file__).parents[2] / "examples" / "sample.pdb"
SAMPLE_CIF = Path(__file__).parents[2] / "examples" / "sample.cif"


def test_parser_creates_structure_data():
    structure = parse_pdb_path(SAMPLE_PDB)

    assert isinstance(structure, StructureData)
    assert structure.structure_id == "sample"
    assert structure.atoms
    assert structure.residues
    assert structure.chains


def test_parser_counts_atoms_chains_and_residues():
    structure = parse_pdb_path(SAMPLE_PDB)

    assert structure.summary.atom_count == 17
    assert structure.summary.residue_count == 3
    assert structure.summary.chain_count == 2
    assert [(chain.id, chain.residue_count, chain.atom_count) for chain in structure.chains] == [
        ("A", 2, 13),
        ("B", 1, 4),
    ]


def test_mmcif_parser_counts_atoms_chains_and_residues():
    structure = parse_pdb_path(SAMPLE_CIF)

    assert isinstance(structure, StructureData)
    assert structure.structure_id == "sample"
    assert structure.summary.atom_count == 17
    assert structure.summary.residue_count == 3
    assert structure.summary.chain_count == 2
    assert [(chain.id, chain.residue_count, chain.atom_count) for chain in structure.chains] == [
        ("A", 2, 13),
        ("B", 1, 4),
    ]


def test_ligand_detection_works_for_sample():
    structure = parse_pdb_path(SAMPLE_PDB)

    assert structure.summary.ligand_count == 1
    assert len(structure.ligands) == 1
    assert structure.ligands[0].name == "ATP"
    assert structure.ligands[0].chain_id == "A"
    assert structure.ligands[0].residue_number == "101"


def test_mmcif_content_can_be_detected_without_filename():
    structure = parse_pdb_content(SAMPLE_CIF.read_text(), structure_id="sample-cif")

    assert structure.structure_id == "sample-cif"
    assert structure.summary.atom_count == 17
    assert structure.summary.ligand_count == 1


def test_structure_format_detection_from_filename():
    assert detect_structure_format_from_filename("sample.pdb") == "pdb"
    assert detect_structure_format_from_filename("sample.cif") == "mmcif"
    assert detect_structure_format_from_filename("sample.mmcif") == "mmcif"
    assert detect_structure_format_from_filename("sample.txt") is None


def test_protein_only_structure_does_not_warn_about_missing_ligands():
    structure = parse_pdb_content(
        b"""
ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00 20.00           N
ATOM      2  CA  ALA A   1       1.450   0.000   0.000  1.00 20.00           C
ATOM      3  C   ALA A   1       2.050   1.350   0.000  1.00 20.00           C
ATOM      4  O   ALA A   1       1.450   2.400   0.000  1.00 20.00           O
TER
END
""",
        structure_id="protein-only",
    )

    assert structure.summary.ligand_count == 0
    assert structure.ligands == []
    assert structure.warnings == []


def test_empty_file_returns_useful_error():
    with pytest.raises(StructureParseError, match="empty"):
        parse_pdb_content(b"", structure_id="empty")


def test_bad_file_returns_useful_error():
    with pytest.raises(StructureParseError, match="does not contain atoms"):
        parse_pdb_content(b"not a pdb\n", structure_id="bad")
