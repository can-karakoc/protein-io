from __future__ import annotations

import json
from typing import Any

from app.models import PaeSummary


DEFAULT_HIGH_ERROR_THRESHOLD = 15.0


class PaeParseError(ValueError):
    """Raised when a PAE JSON sidecar cannot be parsed into a square matrix."""


def analyze_pae_json(
    content: bytes | str,
    high_error_threshold: float = DEFAULT_HIGH_ERROR_THRESHOLD,
) -> tuple[PaeSummary, list[str]]:
    matrix, declared_max_error = extract_pae_matrix(load_pae_json(content))
    validate_pae_matrix(matrix)

    values = [float(value) for row in matrix for value in row]
    observed_max_error = max(values)
    max_error = round(float(declared_max_error if declared_max_error is not None else observed_max_error), 2)
    mean_error = round(sum(values) / len(values), 2)
    high_error_pair_count = sum(1 for value in values if value >= high_error_threshold)

    warnings = []
    if high_error_pair_count:
        warnings.append(
            (
                f"PAE sidecar contains {high_error_pair_count} residue pairs with predicted aligned error "
                f"at or above {high_error_threshold:.1f} A."
            )
        )

    return (
        PaeSummary(
            residue_count=len(matrix),
            max_predicted_aligned_error=max_error,
            mean_predicted_aligned_error=mean_error,
            high_error_pair_count=high_error_pair_count,
            high_error_threshold=high_error_threshold,
        ),
        warnings,
    )


def load_pae_json(content: bytes | str) -> Any:
    if isinstance(content, bytes):
        if not content or not content.strip():
            raise PaeParseError("The PAE JSON sidecar is empty.")
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise PaeParseError("The PAE JSON sidecar must be UTF-8 text.") from exc
    else:
        if not content or not content.strip():
            raise PaeParseError("The PAE JSON sidecar is empty.")
        text = content

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise PaeParseError("The PAE sidecar must be valid JSON.") from exc


def extract_pae_matrix(payload: Any) -> tuple[list[list[float]], float | None]:
    record = payload[0] if isinstance(payload, list) and payload and isinstance(payload[0], dict) else payload
    if isinstance(record, dict):
        matrix = record.get("predicted_aligned_error") or record.get("pae")
        max_error = record.get("max_predicted_aligned_error") or record.get("max_pae")
    else:
        matrix = record
        max_error = None

    if not isinstance(matrix, list):
        raise PaeParseError("The PAE JSON sidecar must contain a predicted_aligned_error matrix.")

    return matrix, float(max_error) if max_error is not None else None


def validate_pae_matrix(matrix: list[list[float]]) -> None:
    if not matrix:
        raise PaeParseError("The PAE matrix is empty.")

    row_count = len(matrix)
    for row in matrix:
        if not isinstance(row, list) or len(row) != row_count:
            raise PaeParseError("The PAE matrix must be square.")
        for value in row:
            if not isinstance(value, int | float):
                raise PaeParseError("The PAE matrix must contain only numeric values.")
            if value < 0:
                raise PaeParseError("The PAE matrix cannot contain negative values.")
