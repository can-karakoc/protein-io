"""Tests for in-house Cα-lDDT (Phase 11)."""

from __future__ import annotations

import pytest

from app.lddt import LddtError, compute_lddt


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
