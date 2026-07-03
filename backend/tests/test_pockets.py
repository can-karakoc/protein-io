"""Tests for in-house LIGSITE-style pocket detection (Phase 12)."""

from __future__ import annotations

import math

from app.pockets import detect_pockets


class _Atom:
    def __init__(self, x: float, y: float, z: float, i: int):
        self.name = "CA"
        self.element = "C"
        self.residue_kind = "protein"
        self.chain_id = "A"
        self.residue_number = str(i)
        self.residue_name = "ALA"
        self.x, self.y, self.z = x, y, z


def _hollow_sphere(radius: float, n: int) -> list[_Atom]:
    # Dense points on a sphere → sealed shell with an enclosed interior cavity.
    atoms = []
    for i in range(n):
        phi = math.acos(1 - 2 * (i + 0.5) / n)
        theta = math.pi * (1 + 5 ** 0.5) * i
        x = radius * math.sin(phi) * math.cos(theta)
        y = radius * math.sin(phi) * math.sin(theta)
        z = radius * math.cos(phi)
        atoms.append(_Atom(x, y, z, i + 1))
    return atoms


def test_too_few_atoms_returns_empty():
    atoms = [_Atom(i * 1.5, 0, 0, i) for i in range(10)]
    assert detect_pockets(atoms) == []


def test_enclosed_cavity_is_detected():
    pockets = detect_pockets(_hollow_sphere(6.0, 700))
    assert len(pockets) >= 1
    top = pockets[0]
    # cavity is centred at the origin
    assert all(abs(c) < 2.0 for c in top["center"])
    assert top["volume_angstrom3"] > 100.0
    assert 0.0 <= top["druggability"] <= 1.0


def test_open_structure_has_no_large_pocket():
    # A flat slab of atoms — convex, no enclosed cavity.
    atoms = []
    idx = 1
    for i in range(12):
        for j in range(12):
            atoms.append(_Atom(i * 2.0, j * 2.0, 0.0, idx))
            idx += 1
    assert detect_pockets(atoms) == []
