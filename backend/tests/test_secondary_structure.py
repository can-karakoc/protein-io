"""Tests for in-house P-SEA secondary-structure assignment (Phase 12)."""

from __future__ import annotations

import math

from app.secondary_structure import compute_secondary_structure


class _CA:
    def __init__(self, resnum: int, x: float, y: float, z: float, chain: str = "A"):
        self.name = "CA"
        self.residue_kind = "protein"
        self.chain_id = chain
        self.residue_number = str(resnum)
        self.x, self.y, self.z = x, y, z


def _ideal_helix(n: int) -> list[_CA]:
    # Ideal α-helix: 2.3 Å radius, 100°/residue, 1.5 Å rise.
    atoms = []
    for i in range(n):
        t = math.radians(100.0 * i)
        atoms.append(_CA(i + 1, 2.3 * math.cos(t), 2.3 * math.sin(t), 1.5 * i))
    return atoms


def test_ideal_helix_is_mostly_helix():
    r = compute_secondary_structure(_ideal_helix(20))
    s = r["summary"]
    assert s["helix_count"] > s["sheet_count"]
    assert s["helix_count"] >= 12  # the bulk is called helix


def test_short_chain_is_coil():
    r = compute_secondary_structure(_ideal_helix(3))
    assert r["summary"]["helix_count"] == 0
    assert r["summary"]["coil_count"] == 3


def test_no_ca_atoms_returns_empty():
    r = compute_secondary_structure([])
    assert r["summary"]["residue_count"] == 0
    assert r["chains"] == []


def test_per_residue_labels_align():
    atoms = _ideal_helix(10)
    r = compute_secondary_structure(atoms)
    chain = r["chains"][0]
    assert chain["chain_id"] == "A"
    assert len(chain["residues"]) == 10
    assert {res["ss"] for res in chain["residues"]} <= {"helix", "sheet", "coil"}
