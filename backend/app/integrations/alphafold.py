from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.models import StructureMetadata


UNIPROT_ACCESSION_PATTERN = re.compile(r"^[A-Za-z0-9]{6,10}$")
ALPHAFOLD_API = "https://alphafold.ebi.ac.uk/api/prediction"
ALPHAFOLD_ENTRY_URL = "https://alphafold.ebi.ac.uk/entry"
DEFAULT_TIMEOUT_SECONDS = 20


class AlphaFoldFetchError(ValueError):
    """Raised when an AlphaFold DB structure or metadata request cannot be completed."""


@dataclass(frozen=True)
class AlphaFoldStructure:
    uniprot_id: str
    filename: str
    content: bytes
    metadata: StructureMetadata


def normalize_uniprot_id(uniprot_id: str) -> str:
    normalized = uniprot_id.strip().upper()
    if not UNIPROT_ACCESSION_PATTERN.fullmatch(normalized):
        raise AlphaFoldFetchError("UniProt accession must be 6 to 10 alphanumeric characters.")
    return normalized


def fetch_alphafold_structure(uniprot_id: str) -> AlphaFoldStructure:
    normalized_id = normalize_uniprot_id(uniprot_id)
    prediction = fetch_prediction(normalized_id)
    cif_url = prediction.get("cifUrl")
    if not cif_url:
        raise AlphaFoldFetchError("AlphaFold DB did not provide an mmCIF model for that UniProt accession.")

    content = get_bytes(str(cif_url))
    metadata = metadata_from_prediction(normalized_id, prediction)
    filename = filename_from_prediction(normalized_id, prediction)
    return AlphaFoldStructure(
        uniprot_id=normalized_id,
        filename=filename,
        content=content,
        metadata=metadata,
    )


def fetch_prediction(uniprot_id: str) -> dict[str, Any]:
    records = get_json(f"{ALPHAFOLD_API}/{uniprot_id}")
    if not isinstance(records, list) or not records:
        raise AlphaFoldFetchError("No AlphaFold DB prediction was found for that UniProt accession.")

    return max(records, key=prediction_sort_key)


def prediction_sort_key(record: dict[str, Any]) -> tuple[int, int]:
    latest_version = int(record.get("latestVersion") or 0)
    residue_span = int(record.get("uniprotEnd") or 0) - int(record.get("uniprotStart") or 0)
    return latest_version, residue_span


def metadata_from_prediction(uniprot_id: str, prediction: dict[str, Any]) -> StructureMetadata:
    description = prediction.get("uniprotDescription") or prediction.get("entryId")
    return StructureMetadata(
        source="alphafold",
        status="current",
        uniprot_id=uniprot_id,
        title=str(description) if description else f"AlphaFold model for {uniprot_id}",
        method="AlphaFold DB predicted model",
        organism=prediction.get("organismScientificName"),
        deposition_date=prediction.get("modelCreatedDate"),
        alphafold_url=f"{ALPHAFOLD_ENTRY_URL}/{uniprot_id}",
        model_url=prediction.get("cifUrl"),
        model_version=int(prediction["latestVersion"]) if prediction.get("latestVersion") is not None else None,
        entity_count=1,
        chain_count=1,
    )


def filename_from_prediction(uniprot_id: str, prediction: dict[str, Any]) -> str:
    entry_id = str(prediction.get("entryId") or f"AF-{uniprot_id}-F1")
    version = prediction.get("latestVersion")
    if version is None:
        return f"{entry_id}.cif"
    return f"{entry_id}-model_v{version}.cif"


def get_json(url: str) -> Any:
    return json.loads(get_bytes(url).decode("utf-8"))


def get_bytes(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "protein-interaction-explorer/0.1"})
    try:
        with urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
            return response.read()
    except HTTPError as exc:
        if exc.code == 404:
            raise AlphaFoldFetchError("No AlphaFold DB prediction was found for that UniProt accession.") from exc
        raise AlphaFoldFetchError(f"AlphaFold DB request failed with status {exc.code}.") from exc
    except URLError as exc:
        raise AlphaFoldFetchError("Could not reach AlphaFold DB. Please try again later.") from exc
    except TimeoutError as exc:
        raise AlphaFoldFetchError("AlphaFold DB request timed out. Please try again later.") from exc
