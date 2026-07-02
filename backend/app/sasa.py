"""Solvent-accessible surface area (SASA) and interface buried surface area (Phase 11).

In-house Shrake-Rupley SASA (no external dependency — the freesasa wheel doesn't
build on Python 3.13/arm64). For a chain pair, the buried surface area on binding is

    ΔSASA = SASA(A alone) + SASA(B alone) − SASA(A+B complex)

which counts area buried on *both* partners (a typical protein–protein interface buries
~1500–2000 Å²). This is the dSASA used by binder-design filters such as BindCraft.
"""

from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree

import gemmi

from app.parser import parse_gemmi_structure

PROBE_RADIUS = 1.4
N_SPHERE_POINTS = 128
MAX_SUBSET_ATOMS = 12000  # guard against pathological runtimes

# Bondi van der Waals radii (Å) for common elements.
_VDW: dict[str, float] = {
    "H": 1.20, "C": 1.70, "N": 1.55, "O": 1.52, "S": 1.80, "P": 1.80,
    "SE": 1.90, "F": 1.47, "CL": 1.75, "BR": 1.85, "I": 1.98,
    "ZN": 1.39, "MG": 1.73, "NA": 2.27, "K": 2.75, "CA": 2.31, "FE": 1.63, "MN": 1.61,
}
_DEFAULT_VDW = 1.70


class SasaError(Exception):
    pass


def _fibonacci_sphere(n: int) -> np.ndarray:
    i = np.arange(n) + 0.5
    phi = np.arccos(1.0 - 2.0 * i / n)
    theta = np.pi * (1.0 + 5.0 ** 0.5) * i
    return np.stack(
        [np.sin(phi) * np.cos(theta), np.sin(phi) * np.sin(theta), np.cos(phi)], axis=1
    )


_SPHERE = _fibonacci_sphere(N_SPHERE_POINTS)


def compute_interface_bsa(content: bytes, chain_pairs: list[tuple[str, str]]) -> dict[tuple[str, str], float]:
    """Return {(chain_a, chain_b): buried surface area Å²} for each requested pair."""
    try:
        structure = parse_gemmi_structure(content.decode("utf-8", errors="replace"), "sasa")
    except Exception as exc:
        raise SasaError(f"Parse error: {exc}") from exc

    cache: dict[frozenset[str], float] = {}

    def subset_sasa(chains: frozenset[str]) -> float:
        if chains not in cache:
            coords, radii = _atoms_for_chains(structure, chains)
            cache[chains] = _shrake_rupley(coords, radii)
        return cache[chains]

    out: dict[tuple[str, str], float] = {}
    for a, b in chain_pairs:
        sa = subset_sasa(frozenset([a]))
        sb = subset_sasa(frozenset([b]))
        sab = subset_sasa(frozenset([a, b]))
        out[(a, b)] = round(max(sa + sb - sab, 0.0), 1)
    return out


# ── internals ─────────────────────────────────────────────────────────────────


def _atoms_for_chains(structure: gemmi.Structure, chains: frozenset[str]) -> tuple[np.ndarray, np.ndarray]:
    coords: list[list[float]] = []
    radii: list[float] = []
    model = structure[0]
    for chain in model:
        if chain.name not in chains:
            continue
        for residue in chain:
            if residue.is_water():
                continue
            for atom in residue:
                if atom.element.atomic_number <= 1:  # heavy atoms only
                    continue
                coords.append([atom.pos.x, atom.pos.y, atom.pos.z])
                radii.append(_VDW.get(atom.element.name.upper(), _DEFAULT_VDW))
    if not coords:
        return np.empty((0, 3)), np.empty((0,))
    return np.asarray(coords, dtype=np.float64), np.asarray(radii, dtype=np.float64)


def _shrake_rupley(coords: np.ndarray, radii: np.ndarray) -> float:
    n = len(coords)
    if n == 0:
        return 0.0
    if n > MAX_SUBSET_ATOMS:
        raise SasaError(f"Subset too large for SASA ({n} atoms).")

    r = radii + PROBE_RADIUS
    tree = cKDTree(coords)
    max_r = float(r.max())
    total = 0.0
    for i in range(n):
        neighbors = [j for j in tree.query_ball_point(coords[i], r[i] + max_r) if j != i]
        surface = coords[i] + r[i] * _SPHERE  # (P, 3)
        if neighbors:
            nb = coords[neighbors]
            nr = r[neighbors]
            d2 = ((surface[:, None, :] - nb[None, :, :]) ** 2).sum(axis=-1)  # (P, K)
            accessible = int((~(d2 < nr[None, :] ** 2).any(axis=1)).sum())
        else:
            accessible = N_SPHERE_POINTS
        total += (accessible / N_SPHERE_POINTS) * 4.0 * np.pi * r[i] ** 2
    return total
