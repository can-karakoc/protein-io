"""Binding-pocket detection from protein geometry (Phase 12).

In-house LIGSITE-style grid method (Hendlich 1997) — no external binary. A grid is
laid over the protein; free grid points that are enclosed by protein along enough of
7 scan directions (3 axes + 4 body diagonals) are pocket points. Connected pocket
points are clustered into pockets and reported by volume, with a simple druggability
proxy (volume × mean enclosure) and the lining residues.

Gated to the interactive analysis path (heavier); fail-soft.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage

PROBE_PLUS_VDW = 2.2      # Å — a grid point within this of a heavy atom is "protein"
SPACING = 1.2             # Å grid spacing
PADDING = 5.0             # Å box padding around the protein
SCAN_STEPS = 6            # ray-march length (~7 Å) — pockets are locally enclosed
MIN_ENCLOSURE = 6         # of 7 directions must be enclosed (concave, not surface)
SURFACE_SHELL = 5.0       # Å — only keep pocket voxels within this of the protein
MIN_POCKET_VOL = 100.0    # Å³ — ignore smaller cavities
MAX_GRID_VOXELS = 6_000_000
MAX_POCKETS = 6
LINING_CUTOFF = 4.0       # Å from pocket points to count a residue as lining

_DIRECTIONS = [
    (1, 0, 0), (0, 1, 0), (0, 0, 1),
    (1, 1, 1), (1, 1, -1), (1, -1, 1), (-1, 1, 1),
]


class PocketError(Exception):
    pass


def detect_pockets(atoms: list) -> list[dict]:
    """Return a list of pocket dicts (largest first). `atoms` are AtomRecord-like."""
    heavy = [a for a in atoms if a.residue_kind == "protein" and _element(a) != "H"]
    if len(heavy) < 20:
        return []
    coords = np.array([[a.x, a.y, a.z] for a in heavy], dtype=np.float64)

    origin = coords.min(axis=0) - PADDING
    dims = np.ceil((coords.max(axis=0) + PADDING - origin) / SPACING).astype(int) + 1
    if int(np.prod(dims)) > MAX_GRID_VOXELS:
        raise PocketError(f"Grid too large ({int(np.prod(dims))} voxels).")

    protein = _mark_protein(coords, origin, dims)
    free = ~protein

    enclosure = np.zeros(dims, dtype=np.int8)
    for d in _DIRECTIONS:
        fwd = np.zeros(dims, dtype=bool)
        bwd = np.zeros(dims, dtype=bool)
        for k in range(1, SCAN_STEPS + 1):
            fwd |= _shift(protein, (k * d[0], k * d[1], k * d[2]))
            bwd |= _shift(protein, (-k * d[0], -k * d[1], -k * d[2]))
        enclosure += (fwd & bwd).astype(np.int8)

    # Restrict to a shell near the protein so bulk solvent (which can be enclosed by a
    # small compact protein) is excluded — real pockets hug the surface.
    shell = ndimage.binary_dilation(protein, iterations=int(round(SURFACE_SHELL / SPACING)))
    pocket_mask = free & (enclosure >= MIN_ENCLOSURE) & shell
    if not pocket_mask.any():
        return []

    labels, n = ndimage.label(pocket_mask, structure=np.ones((3, 3, 3)))
    voxel_vol = SPACING ** 3
    min_voxels = MIN_POCKET_VOL / voxel_vol

    tree = _KDTree(coords)
    pockets: list[dict] = []
    for label_id in range(1, n + 1):
        idx = np.argwhere(labels == label_id)
        if len(idx) < min_voxels:
            continue
        centre = origin + (idx.mean(axis=0) + 0.5) * SPACING
        mean_encl = float(enclosure[labels == label_id].mean())
        volume = round(len(idx) * voxel_vol, 1)
        lining = _lining_residues(idx, origin, tree, heavy)
        pockets.append({
            "volume_angstrom3": volume,
            "druggability": round(min(1.0, (volume / 1000.0) * (mean_encl / 7.0)), 3),
            "mean_enclosure": round(mean_encl, 2),
            "center": [round(float(c), 2) for c in centre],
            "lining_residues": lining,
        })

    pockets.sort(key=lambda p: p["volume_angstrom3"], reverse=True)
    for i, p in enumerate(pockets[:MAX_POCKETS], start=1):
        p["rank"] = i
    return pockets[:MAX_POCKETS]


# ── internals ─────────────────────────────────────────────────────────────────


def _element(a) -> str:
    el = getattr(a, "element", "") or ""
    return el.strip().upper()[:2]


def _mark_protein(coords: np.ndarray, origin: np.ndarray, dims: np.ndarray) -> np.ndarray:
    grid = np.zeros(tuple(dims), dtype=bool)
    r = int(np.ceil(PROBE_PLUS_VDW / SPACING))
    offs = np.array([(i, j, k) for i in range(-r, r + 1) for j in range(-r, r + 1) for k in range(-r, r + 1)])
    keep = (offs * SPACING) ** 2
    keep = keep.sum(axis=1) <= PROBE_PLUS_VDW ** 2
    offs = offs[keep]
    base = np.round((coords - origin) / SPACING).astype(int)
    for centre in base:
        pts = centre + offs
        ok = np.all((pts >= 0) & (pts < dims), axis=1)
        pts = pts[ok]
        grid[pts[:, 0], pts[:, 1], pts[:, 2]] = True
    return grid


def _shift(arr: np.ndarray, off: tuple[int, int, int]) -> np.ndarray:
    """result[p] = arr[p + off], zero-filled outside bounds."""
    res = np.zeros_like(arr)
    src, dst = [], []
    for o, size in zip(off, arr.shape):
        if o >= 0:
            src.append(slice(o, size)); dst.append(slice(0, size - o))
        else:
            src.append(slice(0, size + o)); dst.append(slice(-o, size))
    res[tuple(dst)] = arr[tuple(src)]
    return res


def _lining_residues(voxels: np.ndarray, origin: np.ndarray, tree, heavy: list) -> list[dict]:
    """Residues lining the pocket, ranked by how many pocket voxels they contact."""
    pts = origin + (voxels + 0.5) * SPACING
    counts: dict[tuple[str, str], list] = {}
    for hit in tree.tree.query_ball_point(pts, LINING_CUTOFF):
        for atom_idx in hit:
            a = heavy[atom_idx]
            key = (a.chain_id, a.residue_number)
            if key not in counts:
                counts[key] = [0, {"chain_id": a.chain_id, "residue_number": a.residue_number, "residue_name": a.residue_name}]
            counts[key][0] += 1
    ranked = sorted(counts.values(), key=lambda x: -x[0])
    return [rec for _, rec in ranked]


class _KDTree:
    def __init__(self, coords: np.ndarray):
        from scipy.spatial import cKDTree
        self.tree = cKDTree(coords)
