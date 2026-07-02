"""Tests for in-house Cα-lDDT (Phase 11)."""

from __future__ import annotations

import pytest

from app.lddt import LddtError, compute_lddt, compute_lddt_pli


def _pdb(coords: list[tuple[float, float, float]], chain: str = "A") -> bytes:
    lines = ["HEADER    LDDT TEST"]
    for i, (x, y, z) in enumerate(coords, start=1):
        lines.append(
            f"ATOM  {i:>5}  CA  ALA {chain}{i:>4}    "
            f"{x:>8.3f}{y:>8.3f}{z:>8.3f}  1.00 20.00           C"
        )
    lines += ["END", ""]
    return "\n".join(lines).encode()


_CHAIN = [(3.8 * i, 0.0, 0.0) for i in range(8)]


def test_identical_structures_score_one():
    pdb = _pdb(_CHAIN)
    out = compute_lddt(pdb, pdb)
    assert out["lddt"] == 1.0
    assert out["residue_count"] == 8


def test_perturbed_structure_scores_below_one():
    ref = _pdb(_CHAIN)
    perturbed = list(_CHAIN)
    perturbed[3] = (perturbed[3][0], perturbed[3][1] + 3.0, perturbed[3][2])  # bump one residue
    model = _pdb(perturbed)
    out = compute_lddt(model, ref)
    assert 0.0 < out["lddt"] < 1.0


def test_no_matching_residues_raises():
    ref = _pdb(_CHAIN, chain="A")
    model = _pdb(_CHAIN, chain="Z")  # different chain id → no matches
    with pytest.raises(LddtError):
        compute_lddt(model, ref)


def test_too_few_residues_raises():
    small = _pdb([(0.0, 0.0, 0.0), (3.8, 0.0, 0.0)])
    with pytest.raises(LddtError):
        compute_lddt(small, small)


def _complex_pdb(lig_dx: float = 0.0) -> bytes:
    prot = [
        ("ATOM", "A", 1, "ALA", "N",  "N", 0.0, 0.0, 0.0),
        ("ATOM", "A", 1, "ALA", "CA", "C", 1.5, 0.0, 0.0),
        ("ATOM", "A", 1, "ALA", "C",  "C", 2.5, 1.0, 0.0),
        ("ATOM", "A", 1, "ALA", "O",  "O", 2.5, 2.0, 0.0),
        ("ATOM", "A", 1, "ALA", "CB", "C", 1.5, -1.5, 0.0),
    ]
    lig = [
        ("HETATM", "A", 500, "LIG", "C1", "C", 3.0 + lig_dx, 0.0, 0.0),
        ("HETATM", "A", 500, "LIG", "C2", "C", 4.5, 0.0, 0.0),
    ]
    lines = ["HEADER    PLI TEST"]
    for i, (rec, chain, resnum, resname, aname, el, x, y, z) in enumerate(prot + lig, start=1):
        lines.append(
            f"{rec:<6}{i:>5} {aname:<4} {resname:<3} {chain}{resnum:>4}    "
            f"{x:>8.3f}{y:>8.3f}{z:>8.3f}  1.00 20.00           {el:>2}"
        )
    lines += ["END", ""]
    return "\n".join(lines).encode()


def test_lddt_pli_identical_is_one():
    pdb = _complex_pdb()
    out = compute_lddt_pli(pdb, pdb)
    assert out["lddt_pli"] == 1.0
    assert out["ligand_atom_count"] == 2
    assert out["contact_count"] > 0


def test_lddt_pli_perturbed_below_one():
    ref = _complex_pdb()
    model = _complex_pdb(lig_dx=2.0)  # shift the ligand
    out = compute_lddt_pli(model, ref)
    assert 0.0 <= out["lddt_pli"] < 1.0


def test_lddt_pli_no_ligand_raises():
    protein_only = _pdb(_CHAIN)
    with pytest.raises(LddtError):
        compute_lddt_pli(protein_only, protein_only)
