"""Secondary-structure assignment from Cα geometry (Phase 12).

In-house P-SEA (Labesse et al. 1997): assigns helix / sheet / coil from Cα-only
distances and angles — no hydrogen bonds, no DSSP binary. Robust to missing side
chains and works on predicted models. Deliberately labelled a *geometric* estimate.

Per residue i (within a chain) it uses three Cα distances d(i,i+2/3/4) and two angles
(the Cα valence angle θ and the Cα torsion τ), matched against helix/sheet reference
values, then filters by minimum segment length (helix ≥5, strand ≥3).
"""

from __future__ import annotations

import numpy as np

# P-SEA reference geometry (distances Å, angles degrees) with tolerances.
_HELIX = {
    "d2": (5.5, 0.5), "d3": (5.3, 0.5), "d4": (6.4, 0.6),
    "theta": (89.0, 12.0), "tau": (50.0, 20.0),
}
_SHEET = {
    "d2": (6.7, 0.6), "d3": (9.9, 0.9), "d4": (12.4, 1.1),
    "theta": (124.0, 14.0), "tau": (-170.0, 45.0),
}
_MIN_HELIX = 5
_MIN_STRAND = 3


def compute_secondary_structure(atoms: list) -> dict:
    """Return {chains: [{chain_id, residues:[{residue_number, ss}]}], summary}.

    `atoms` is a list of AtomRecord-like objects (name, chain_id, residue_number,
    residue_kind, x, y, z).
    """
    chains = _ca_by_chain(atoms)
    chain_out: list[dict] = []
    counts = {"helix": 0, "sheet": 0, "coil": 0}

    for chain_id, residues in chains.items():
        if len(residues) < 4:
            ss = ["coil"] * len(residues)
        else:
            coords = np.array([r[1] for r in residues], dtype=np.float64)
            ss = _psea(coords)
        for (resnum, _), label in zip(residues, ss):
            counts[label] += 1
        chain_out.append({
            "chain_id": chain_id,
            "residues": [{"residue_number": resnum, "ss": label} for (resnum, _), label in zip(residues, ss)],
        })

    total = sum(counts.values())
    return {
        "chains": chain_out,
        "summary": {
            "residue_count": total,
            "helix_count": counts["helix"],
            "sheet_count": counts["sheet"],
            "coil_count": counts["coil"],
        },
    }


# ── internals ─────────────────────────────────────────────────────────────────


def _ca_by_chain(atoms: list) -> dict[str, list[tuple[str, tuple[float, float, float]]]]:
    out: dict[str, list[tuple[str, tuple[float, float, float]]]] = {}
    for a in atoms:
        if a.name != "CA" or a.residue_kind != "protein":
            continue
        out.setdefault(a.chain_id, []).append((a.residue_number, (a.x, a.y, a.z)))
    return out


def _in(value: float, ref_tol: tuple[float, float]) -> bool:
    ref, tol = ref_tol
    return abs(value - ref) <= tol


def _angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    v1, v2 = a - b, c - b
    cos = float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9))
    return float(np.degrees(np.arccos(np.clip(cos, -1.0, 1.0))))


def _dihedral(p0: np.ndarray, p1: np.ndarray, p2: np.ndarray, p3: np.ndarray) -> float:
    b0, b1, b2 = p0 - p1, p2 - p1, p3 - p2
    b1n = b1 / (np.linalg.norm(b1) + 1e-9)
    v = b0 - np.dot(b0, b1n) * b1n
    w = b2 - np.dot(b2, b1n) * b1n
    x = float(np.dot(v, w))
    y = float(np.dot(np.cross(b1n, v), w))
    return float(np.degrees(np.arctan2(y, x)))


def _psea(ca: np.ndarray) -> list[str]:
    n = len(ca)
    raw = ["coil"] * n

    def dist(i: int, j: int) -> float:
        return float(np.linalg.norm(ca[i] - ca[j]))

    for i in range(n):
        d2 = dist(i, i + 2) if i + 2 < n else None
        d3 = dist(i, i + 3) if i + 3 < n else None
        d4 = dist(i, i + 4) if i + 4 < n else None
        theta = _angle(ca[i - 1], ca[i], ca[i + 1]) if 0 < i < n - 1 else None
        tau = _dihedral(ca[i - 1], ca[i], ca[i + 1], ca[i + 2]) if 0 < i < n - 2 else None

        def matches(ref: dict) -> bool:
            dist_ok = (
                d2 is not None and d3 is not None and d4 is not None
                and _in(d2, ref["d2"]) and _in(d3, ref["d3"]) and _in(d4, ref["d4"])
            )
            angle_ok = (
                theta is not None and tau is not None
                and _in(theta, ref["theta"]) and _in(tau, ref["tau"])
            )
            return dist_ok or angle_ok

        if matches(_HELIX):
            raw[i] = "helix"
        elif matches(_SHEET):
            raw[i] = "sheet"

    return _filter_segments(raw)


def _filter_segments(raw: list[str]) -> list[str]:
    """Drop helix runs < 5 and strand runs < 3 (P-SEA smoothing)."""
    out = list(raw)
    i = 0
    n = len(out)
    while i < n:
        if out[i] in ("helix", "sheet"):
            j = i
            while j < n and out[j] == out[i]:
                j += 1
            length = j - i
            min_len = _MIN_HELIX if out[i] == "helix" else _MIN_STRAND
            if length < min_len:
                for k in range(i, j):
                    out[k] = "coil"
            i = j
        else:
            i += 1
    return out
