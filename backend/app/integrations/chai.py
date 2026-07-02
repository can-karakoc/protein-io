"""Parse Chai-1 scores NPZ sidecars.

Chai-1 outputs scores.model_idx_N.npz containing:
  plddt  – ndarray (N,), per-residue confidence 0-100
  pae    – ndarray (N, N), predicted aligned error in Å
  pde    – ndarray (N,), per-residue distance error
  ptm    – scalar float
  iptm   – scalar float (multimers)
"""

from __future__ import annotations

import io
import json
import statistics

import numpy as np

from app.models import GlobalModelScores, PaeSummary
from app.pae import DEFAULT_HIGH_ERROR_THRESHOLD, PaeParseError, analyze_pae_json, validate_pae_matrix


class ChaiParseError(ValueError):
    """Raised when a Chai scores NPZ cannot be parsed."""


def parse_chai_scores(
    content: bytes,
    high_error_threshold: float = DEFAULT_HIGH_ERROR_THRESHOLD,
) -> tuple[PaeSummary | None, GlobalModelScores | None, list[str]]:
    """Return (pae_summary, global_scores, warnings) from a Chai .npz file."""
    if not content:
        raise ChaiParseError("Chai scores file is empty.")

    try:
        data = np.load(io.BytesIO(content), allow_pickle=False)
    except Exception as exc:
        raise ChaiParseError(f"Could not read Chai .npz file: {exc}") from exc

    warnings: list[str] = []
    global_scores = _extract_global_scores(data)
    pae_summary = _extract_pae(data, high_error_threshold, warnings)

    return pae_summary, global_scores, warnings


def _extract_global_scores(data: np.lib.npyio.NpzFile) -> GlobalModelScores | None:
    ptm = _scalar_or_none(data, "ptm")
    iptm = _scalar_or_none(data, "iptm")

    pde_mean: float | None = None
    if "pde" in data:
        try:
            pde_mean = round(float(np.mean(data["pde"])), 3)
        except Exception:
            pass

    if ptm is None and iptm is None:
        return None

    return GlobalModelScores(ptm=ptm, iptm=iptm, pde_mean=pde_mean)


def _extract_pae(
    data: np.lib.npyio.NpzFile,
    high_error_threshold: float,
    warnings: list[str],
) -> PaeSummary | None:
    if "pae" not in data:
        return None

    try:
        matrix = data["pae"].tolist()
    except Exception:
        return None

    try:
        validate_pae_matrix(matrix)
    except PaeParseError:
        return None

    pae_summary, pae_warnings = analyze_pae_json(
        json.dumps({"pae": matrix}),
        high_error_threshold=high_error_threshold,
    )
    warnings.extend(pae_warnings)
    return pae_summary


def _scalar_or_none(data: np.lib.npyio.NpzFile, key: str) -> float | None:
    if key not in data:
        return None
    try:
        return round(float(data[key]), 4)
    except Exception:
        return None
