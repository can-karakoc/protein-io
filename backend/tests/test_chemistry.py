"""Tests for the physical-validity / cheminformatics layer (Phase 9).

Network is avoided by monkeypatching the CCD SMILES lookup; bond perception is
exercised through the hydrogen-present and template paths deterministically.
"""

from __future__ import annotations

import pytest

from app.integrations import chemistry
from app.integrations.chemistry import analyze_ligand_validity


# ── fixtures ──────────────────────────────────────────────────────────────────

def _aspirin_pdb(with_hydrogens: bool, resname: str = "LIG") -> str:
    """Generate an aspirin ligand PDB block (deterministic 3D coords) + protein anchor."""
    from rdkit import Chem
    from rdkit.Chem import AllChem

    mol = Chem.AddHs(Chem.MolFromSmiles("CC(=O)Oc1ccccc1C(=O)O"))
    AllChem.EmbedMolecule(mol, randomSeed=1)
    AllChem.MMFFOptimizeMolecule(mol)
    conf = mol.GetConformer()

    lines = [
        "ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00 20.00           N",
        "ATOM      2  CA  ALA A   1       1.450   0.000   0.000  1.00 20.00           C",
        "ATOM      3  C   ALA A   1       2.050   1.350   0.000  1.00 20.00           C",
        "ATOM      4  O   ALA A   1       1.450   2.400   0.000  1.00 20.00           O",
    ]
    serial = 5
    for atom in mol.GetAtoms():
        if not with_hydrogens and atom.GetAtomicNum() <= 1:
            continue
        p = conf.GetAtomPosition(atom.GetIdx())
        el = atom.GetSymbol()
        name = f"{el}{atom.GetIdx()}"[:4]
        lines.append(
            f"HETATM{serial:>5} {name:<4} {resname:<3} A 301    "
            f"{p.x:>8.3f}{p.y:>8.3f}{p.z:>8.3f}  1.00  0.00          {el:>2}"
        )
        serial += 1
    return "\n".join(["HEADER    ASPIRIN TEST", *lines, "END", ""])


_ION_PDB = "\n".join([
    "HEADER    ION TEST",
    "ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00 20.00           N",
    "ATOM      2  CA  ALA A   1       1.450   0.000   0.000  1.00 20.00           C",
    "HETATM    3 ZN    ZN A 301       5.000   5.000   5.000  1.00 20.00          ZN",
    "END",
    "",
])

_PROTEIN_ONLY_PDB = "\n".join([
    "HEADER    PROTEIN ONLY",
    "ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00 20.00           N",
    "ATOM      2  CA  ALA A   1       1.450   0.000   0.000  1.00 20.00           C",
    "ATOM      3  C   ALA A   1       2.050   1.350   0.000  1.00 20.00           C",
    "END",
    "",
])


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Default: CCD lookup returns nothing, so tests never hit the network."""
    monkeypatch.setattr(chemistry, "_ccd_smiles", lambda comp_id: None)


# ── tests ─────────────────────────────────────────────────────────────────────

def test_protein_only_has_no_ligand_validity():
    assert analyze_ligand_validity(_PROTEIN_ONLY_PDB.encode(), "p.pdb") == []


def test_ion_is_flagged_not_analyzed():
    results = analyze_ligand_validity(_ION_PDB.encode(), "ion.pdb")
    assert len(results) == 1
    zinc = results[0]
    assert zinc["name"] == "ZN"
    assert zinc["is_small_molecule"] is False
    assert zinc["chemistry"] is None
    assert zinc["pb_valid"] is None
    assert zinc["note"] is not None


def test_ligand_with_hydrogens_is_perceived_and_valid():
    pdb = _aspirin_pdb(with_hydrogens=True)
    results = analyze_ligand_validity(pdb.encode(), "aspirin.pdb")
    assert len(results) == 1
    lig = results[0]
    assert lig["is_small_molecule"] is True
    chem = lig["chemistry"]
    assert chem is not None
    assert chem["formula"] == "C9H8O4"
    assert chem["molecular_weight"] == pytest.approx(180.16, abs=0.5)
    assert chem["lipinski_pass"] is True
    assert chem["depiction_svg"] and "<svg" in chem["depiction_svg"]
    assert lig["pb_valid"] is True
    assert any(c["name"] == "bond_lengths" for c in lig["checks"])


def test_ccd_template_path_recovers_heavy_atom_only_ligand(monkeypatch):
    # No hydrogens in the file; correct chemistry must come from the CCD template.
    monkeypatch.setattr(chemistry, "_ccd_smiles", lambda comp_id: "CC(=O)Oc1ccccc1C(=O)O")
    pdb = _aspirin_pdb(with_hydrogens=False, resname="AIN")
    results = analyze_ligand_validity(pdb.encode(), "aspirin_noh.pdb")
    assert len(results) == 1
    chem = results[0]["chemistry"]
    assert chem is not None
    assert chem["molecular_weight"] == pytest.approx(180.16, abs=0.5)
    assert chem["ring_count"] == 1


def test_service_include_validity_flag(monkeypatch):
    from app.service import analyze_pdb_content_with_timing

    monkeypatch.setattr(chemistry, "_ccd_smiles", lambda comp_id: None)
    pdb = _aspirin_pdb(with_hydrogens=True).encode()

    off = analyze_pdb_content_with_timing(pdb, filename="a.pdb", include_validity=False)
    assert off.response.ligand_validity == []

    on = analyze_pdb_content_with_timing(pdb, filename="a.pdb", include_validity=True)
    assert len(on.response.ligand_validity) == 1
    assert on.response.ligand_validity[0].is_small_molecule is True
