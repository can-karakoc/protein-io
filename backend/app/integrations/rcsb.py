from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.models import StructureMetadata


PDB_ID_PATTERN = re.compile(r"^[A-Za-z0-9]{4}$")
RCSB_DATA_API = "https://data.rcsb.org/rest/v1/core"
RCSB_FILES_API = "https://files.rcsb.org/download"
DEFAULT_TIMEOUT_SECONDS = 15


class RcsbFetchError(ValueError):
    """Raised when an RCSB structure or metadata request cannot be completed."""


@dataclass(frozen=True)
class RcsbStructure:
    pdb_id: str
    filename: str
    content: bytes
    metadata: StructureMetadata


def normalize_pdb_id(pdb_id: str) -> str:
    normalized = pdb_id.strip().upper()
    if not PDB_ID_PATTERN.fullmatch(normalized):
        raise RcsbFetchError("PDB ID must be exactly 4 alphanumeric characters.")
    return normalized


def fetch_rcsb_structure(pdb_id: str) -> RcsbStructure:
    normalized_id = normalize_pdb_id(pdb_id)
    content = fetch_structure_cif(normalized_id)
    metadata = fetch_metadata(normalized_id)
    return RcsbStructure(
        pdb_id=normalized_id,
        filename=f"{normalized_id}.cif",
        content=content,
        metadata=metadata,
    )


def fetch_structure_cif(pdb_id: str) -> bytes:
    return get_bytes(f"{RCSB_FILES_API}/{pdb_id}.cif")


def fetch_metadata(pdb_id: str) -> StructureMetadata:
    try:
        entry = get_json(f"{RCSB_DATA_API}/entry/{pdb_id}")
    except RcsbFetchError:
        return fetch_removed_metadata(pdb_id)

    entity_ids = entry.get("rcsb_entry_container_identifiers", {}).get("polymer_entity_ids") or []
    organisms = sorted(
        {
            organism
            for entity_id in entity_ids
            for organism in fetch_entity_organisms(pdb_id, str(entity_id))
            if organism
        }
    )

    return StructureMetadata(
        source="rcsb",
        status="current",
        pdb_id=pdb_id,
        title=entry.get("struct", {}).get("title"),
        method=first_experimental_method(entry),
        resolution_angstrom=first_resolution(entry),
        organism=", ".join(organisms) if organisms else None,
        deposition_date=entry.get("rcsb_accession_info", {}).get("deposit_date"),
        rcsb_url=f"https://www.rcsb.org/structure/{pdb_id}",
        entity_count=len(entity_ids) or None,
        chain_count=len(entry.get("rcsb_entry_container_identifiers", {}).get("auth_asym_ids") or []) or None,
    )


def fetch_removed_metadata(pdb_id: str) -> StructureMetadata:
    removed = get_json(f"https://data.rcsb.org/rest/v1/holdings/removed/{pdb_id}")
    details = removed.get("rcsb_repository_holdings_removed", {})
    replacement_ids = details.get("id_codes_replaced_by") or []

    return StructureMetadata(
        source="rcsb",
        status="removed",
        pdb_id=pdb_id,
        title=details.get("title"),
        deposition_date=date_only(details.get("deposit_date")),
        rcsb_url=f"https://www.rcsb.org/structure/{pdb_id}",
        replaced_by=[str(replacement_id).upper() for replacement_id in replacement_ids],
    )


def fetch_entity_organisms(pdb_id: str, entity_id: str) -> list[str]:
    try:
        entity = get_json(f"{RCSB_DATA_API}/polymer_entity/{pdb_id}/{entity_id}")
    except RcsbFetchError:
        return []

    return [
        source.get("scientific_name")
        for source in entity.get("rcsb_entity_source_organism", []) or []
        if source.get("scientific_name")
    ]


def first_experimental_method(entry: dict[str, Any]) -> str | None:
    methods = [item.get("method") for item in entry.get("exptl", []) if item.get("method")]
    return ", ".join(methods) if methods else None


def first_resolution(entry: dict[str, Any]) -> float | None:
    resolutions = entry.get("rcsb_entry_info", {}).get("resolution_combined") or []
    if not resolutions:
        return None
    return float(resolutions[0])


def date_only(value: str | None) -> str | None:
    if not value:
        return None
    return value.split("T", maxsplit=1)[0]


def get_json(url: str) -> dict[str, Any]:
    return json.loads(get_bytes(url).decode("utf-8"))


def get_bytes(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "protein-interaction-explorer/0.1"})
    try:
        with urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
            return response.read()
    except HTTPError as exc:
        if exc.code == 404:
            raise RcsbFetchError("No RCSB entry was found for that PDB ID.") from exc
        raise RcsbFetchError(f"RCSB request failed with status {exc.code}.") from exc
    except URLError as exc:
        raise RcsbFetchError("Could not reach RCSB. Please try again later.") from exc
    except TimeoutError as exc:
        raise RcsbFetchError("RCSB request timed out. Please try again later.") from exc
