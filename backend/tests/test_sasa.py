"""Tests for in-house Shrake-Rupley SASA + interface BSA (Phase 11)."""

from __future__ import annotations

import math

import numpy as np

from app.sasa import PROBE_RADIUS, _shrake_rupley, compute_interface_bsa


def _pdb(atoms: list[tuple[str, int, str, float, float, float]]) -> bytes:
    lines = ["HEADER    SASA TEST"]
    for i, (chain, resnum, el, x, y, z) in enumerate(atoms, start=1):
        lines.append(
            f"ATOM  {i:>5}  {el:<3} ALA {chain}{resnum:>4}    "
            f"{x:>8.3f}{y:>8.3f}{z:>8.3f}  1.00 20.00           {el:>2}"
        )
    lines += ["END", ""]
    return "\n".join(lines).encode()


def test_single_atom_sasa_is_full_sphere():
    # One carbon (vdw 1.70) + probe 1.4 → area = 4πr²
    area = _shrake_rupley(np.array([[0.0, 0.0, 0.0]]), np.array([1.70]))
    expected = 4.0 * math.pi * (1.70 + PROBE_RADIUS) ** 2
    assert abs(area - expected) < 0.5


def test_far_apart_chains_have_no_buried_area():
    atoms = [
        ("A", 1, "C", 0.0, 0.0, 0.0),
        ("B", 1, "C", 100.0, 0.0, 0.0),
    ]
    bsa = compute_interface_bsa(_pdb(atoms), [("A", "B")])
    assert bsa[("A", "B")] == 0.0


def test_touching_chains_bury_area():
    atoms = [
        ("A", 1, "C", 0.0, 0.0, 0.0),
        ("B", 1, "C", 2.0, 0.0, 0.0),  # overlapping solvent shells
    ]
    bsa = compute_interface_bsa(_pdb(atoms), [("A", "B")])
    assert bsa[("A", "B")] > 50.0
