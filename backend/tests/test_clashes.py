"""Proper VDW clash detection — peptide bonds must NOT count as clashes."""

from pathlib import Path
from types import SimpleNamespace

from app.clashes import detect_clashes
from app.models import AtomRecord
from app.parser import parse_pdb_content

SAMPLES = Path(__file__).parents[2] / "examples" / "batch_sample"


def atom(id_, name, el, x, y, z, resid, resnum, chain="A", kind="protein", resname="ALA"):
    return AtomRecord(
        id=id_, name=name, element=el, x=x, y=y, z=z,
        chain_id=chain, residue_id=resid, residue_name=resname, residue_number=resnum, residue_kind=kind,
    )


def struct(atoms):
    return SimpleNamespace(atoms=atoms)


def test_peptide_bond_is_not_a_clash():
    # C(i)–N(i+1) peptide bond at ~1.33 Å is a bond, not a clash.
    atoms = [
        atom("1", "C", "C", 0.0, 0.0, 0.0, "A1", "1"),
        atom("2", "N", "N", 1.33, 0.0, 0.0, "A2", "2"),
    ]
    assert detect_clashes(struct(atoms)) == []


def test_angle_pair_is_not_a_clash():
    # O(i)···N(i+1): both bonded to C(i) → 1-3 angle pair, excluded even though close.
    atoms = [
        atom("1", "C", "C", 0.0, 0.0, 0.0, "A1", "1"),
        atom("2", "O", "O", 1.23, 0.0, 0.0, "A1", "1"),       # C=O bond
        atom("3", "N", "N", -0.6, 1.2, 0.0, "A2", "2"),       # peptide C–N bond
    ]
    # O and N are ~2.2 Å apart (an angle pair via C) — must not be a clash.
    assert detect_clashes(struct(atoms)) == []


def test_real_steric_clash_is_detected():
    # Two carbons from different, non-bonded residues at 2.0 Å (VDW sum 3.4 → overlap 1.4).
    atoms = [
        atom("1", "CB", "C", 0.0, 0.0, 0.0, "A5", "5"),
        atom("2", "CB", "C", 2.0, 0.0, 0.0, "A40", "40"),
    ]
    clashes = detect_clashes(struct(atoms))
    assert len(clashes) == 1
    assert "possible-clash" in clashes[0].contact_categories


def test_real_structure_has_few_clashes():
    # Well-refined crystal structures should score ~no clashes — the naive <2 Å metric
    # reported ~one per residue (crambin ~46, haemoglobin ~574).
    crn = parse_pdb_content((SAMPLES / "1CRN.cif").read_bytes(), structure_id="t")
    assert len(detect_clashes(crn)) == 0

    hb = parse_pdb_content((SAMPLES / "2HHB.cif").read_bytes(), structure_id="t")
    clashes = detect_clashes(hb)
    assert len(clashes) < hb.summary.residue_count / 20  # ~4, nowhere near ~574
