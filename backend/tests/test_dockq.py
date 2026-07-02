"""Tests for in-house DockQ (Phase 11)."""

from __future__ import annotations

import pytest

from app.dockq import DockQError, compute_dockq

_BB_OFFSETS = {"N": (-0.5, 0.2, 0.0), "CA": (0.0, 0.0, 0.0), "C": (0.5, 0.3, 0.0), "O": (0.6, 1.0, 0.0)}


def _pdb(shift_b: tuple[float, float, float] = (0.0, 0.0, 0.0), two_chains: bool = True) -> bytes:
    lines = ["HEADER    DOCKQ TEST"]
    serial = 1

    def add(chain: str, resnum: int, cx: float, cy: float, cz: float) -> None:
        nonlocal serial
        for name, (ox, oy, oz) in _BB_OFFSETS.items():
            el = name[0]
            lines.append(
                f"ATOM  {serial:>5} {name:<4} ALA {chain}{resnum:>4}    "
                f"{cx + ox:>8.3f}{cy + oy:>8.3f}{cz + oz:>8.3f}  1.00 20.00           {el:>2}"
            )
            serial += 1

    for i in range(1, 6):
        add("A", i, 3.8 * i, 0.0, 0.0)
    if two_chains:
        for i in range(1, 6):
            add("B", i, 3.8 * i + shift_b[0], 4.0 + shift_b[1], shift_b[2])
    lines += ["END", ""]
    return "\n".join(lines).encode()


def test_identical_complex_is_perfect():
    pdb = _pdb()
    out = compute_dockq(pdb, pdb)
    assert out["dockq"] == 1.0
    assert out["fnat"] == 1.0
    assert out["irmsd"] == 0.0
    assert out["lrmsd"] == 0.0
    assert out["quality"] == "high"
    assert {out["chain_a"], out["chain_b"]} == {"A", "B"}


def test_displaced_ligand_chain_lowers_dockq():
    ref = _pdb()
    model = _pdb(shift_b=(0.0, 3.0, 0.0))  # push chain B away from the interface
    out = compute_dockq(model, ref)
    assert out["dockq"] < 1.0
    assert out["fnat"] < 1.0
    assert out["lrmsd"] > 0.0


def test_single_chain_raises():
    one = _pdb(two_chains=False)
    with pytest.raises(DockQError):
        compute_dockq(one, one)
