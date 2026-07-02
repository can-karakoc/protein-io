"""Parse Boltz-1 confidence JSON sidecars.

Boltz outputs a confidence_model_N.json with:
  plddt       – list[float], one per residue token
  pae         – list[list[float]], N×N matrix
  ptm         – float
  iptm        – float (multimers only)
  pde         – list[float], per-residue distance error
  chain_iptm  – dict[str, float]
  chain_ptm   – dict[str, float]

The PAE matrix is forwarded to the existing pae.analyze_pae_json pipeline.
ptm/iptm are surfaced as GlobalModelScores.
"""

from __future__ import annotations

import json
import statistics

from app.models import GlobalModelScores, PaeSummary
from app.pae import DEFAULT_HIGH_ERROR_THRESHOLD, PaeParseError, analyze_pae_json, validate_pae_matrix


class BoltzParseError(ValueError):
    """Raised when a Boltz confidence JSON cannot be parsed."""


def parse_boltz_confidence(
    content: bytes | str,
    high_error_threshold: float = DEFAULT_HIGH_ERROR_THRESHOLD,
) -> tuple[PaeSummary | None, GlobalModelScores | None, list[str]]:
    """Return (pae_summary, global_scores, warnings) from a Boltz confidence JSON."""
    data = _load_json(content)
    warnings: list[str] = []

    global_scores = _extract_global_scores(data)
    pae_summary = _extract_pae(data, high_error_threshold, warnings)

    return pae_summary, global_scores, warnings


def _load_json(content: bytes | str) -> dict:
    """Parse JSON content, normalising AlphaFold's array-wrapped format to a plain dict."""
    if isinstance(content, bytes):
        if not content.strip():
            raise BoltzParseError("Confidence sidecar file is empty.")
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise BoltzParseError("Confidence sidecar file must be UTF-8.") from exc
    else:
        if not content.strip():
            raise BoltzParseError("Confidence sidecar file is empty.")
        text = content

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise BoltzParseError(f"Confidence sidecar is not valid JSON: {exc}") from exc

    # AlphaFold PAE format: [{"predicted_aligned_error": [...], ...}]
    # Normalise to a plain dict so the rest of the parsing is uniform.
    if isinstance(data, list):
        if not data or not isinstance(data[0], dict):
            raise BoltzParseError("Unrecognised confidence sidecar format.")
        inner = dict(data[0])
        # Remap AlphaFold key so _extract_pae can find it
        if "predicted_aligned_error" in inner and "pae" not in inner:
            inner["pae"] = inner["predicted_aligned_error"]
        return inner

    if not isinstance(data, dict):
        raise BoltzParseError("Confidence sidecar JSON must be a JSON object or array.")
    return data


def _extract_global_scores(data: dict) -> GlobalModelScores | None:
    ptm = _float_or_none(data.get("ptm"))
    iptm = _float_or_none(data.get("iptm"))

    pde_list = data.get("pde")
    pde_mean: float | None = None
    if isinstance(pde_list, list) and pde_list:
        try:
            pde_mean = round(statistics.mean(float(v) for v in pde_list), 3)
        except (TypeError, ValueError):
            pass

    chain_iptm = _str_float_dict(data.get("chain_iptm"))
    chain_ptm = _str_float_dict(data.get("chain_ptm"))

    if ptm is None and iptm is None and not chain_iptm and not chain_ptm:
        return None

    return GlobalModelScores(
        ptm=ptm,
        iptm=iptm,
        pde_mean=pde_mean,
        chain_iptm=chain_iptm,
        chain_ptm=chain_ptm,
    )


def _extract_pae(
    data: dict,
    high_error_threshold: float,
    warnings: list[str],
) -> PaeSummary | None:
    matrix = data.get("pae")
    if not isinstance(matrix, list):
        return None
    try:
        validate_pae_matrix(matrix)
    except PaeParseError:
        return None

    # Reuse existing PAE summary logic
    pae_summary, pae_warnings = analyze_pae_json(
        json.dumps({"pae": matrix}),
        high_error_threshold=high_error_threshold,
    )
    warnings.extend(pae_warnings)
    return pae_summary


def _float_or_none(value: object) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 4)
    except (TypeError, ValueError):
        return None


def _str_float_dict(value: object) -> dict[str, float]:
    if not isinstance(value, dict):
        return {}
    result: dict[str, float] = {}
    for k, v in value.items():
        try:
            result[str(k)] = round(float(v), 4)
        except (TypeError, ValueError):
            pass
    return result
