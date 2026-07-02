"""ChEMBL target context (Phase 12).

Given a UniProt accession, look up the ChEMBL target and summarise its known
bioactivity: how many potent measurements exist and the most potent compounds. This
answers "is this a validated drug target, and what's the SAR landscape?" — instant
medchem context for a loaded structure.

Read-only public REST API (like the RCSB / UniProt / Foldseek integrations).
"""

from __future__ import annotations

import logging

import httpx

from app.models import ChemblActivity, ChemblTargetSummary

logger = logging.getLogger(__name__)

CHEMBL_API = "https://www.ebi.ac.uk/chembl/api/data"
TIMEOUT = 12.0
MAX_COMPOUNDS = 8


class ChemblError(Exception):
    pass


async def fetch_chembl_summary(uniprot_id: str) -> ChemblTargetSummary | None:
    """Return a bioactivity summary for the target, or None if not in ChEMBL."""
    headers = {"User-Agent": "protein-interaction-explorer/0.1"}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=headers) as client:
            target = await _find_target(client, uniprot_id)
            if target is None:
                return None
            target_chembl_id, pref_name = target
            top_compounds, total = await _top_activities(client, target_chembl_id)
            return ChemblTargetSummary(
                target_chembl_id=target_chembl_id,
                pref_name=pref_name,
                uniprot_id=uniprot_id.upper(),
                bioactivity_count=total,
                top_compounds=top_compounds,
            )
    except httpx.HTTPError as exc:
        raise ChemblError(f"ChEMBL request failed: {exc}") from exc


async def _find_target(client: httpx.AsyncClient, uniprot_id: str) -> tuple[str, str | None] | None:
    url = f"{CHEMBL_API}/target.json?target_components__accession={uniprot_id}&limit=20"
    resp = await client.get(url)
    resp.raise_for_status()
    targets = resp.json().get("targets", [])
    if not targets:
        return None
    # Prefer a single-protein target over families/complexes.
    single = [t for t in targets if t.get("target_type") == "SINGLE PROTEIN"]
    chosen = (single or targets)[0]
    tcid = chosen.get("target_chembl_id")
    if not tcid:
        return None
    return tcid, chosen.get("pref_name")


async def _top_activities(client: httpx.AsyncClient, target_chembl_id: str) -> tuple[list[ChemblActivity], int]:
    url = (
        f"{CHEMBL_API}/activity.json?target_chembl_id={target_chembl_id}"
        "&pchembl_value__isnull=false&order_by=-pchembl_value&limit=50"
    )
    resp = await client.get(url)
    resp.raise_for_status()
    data = resp.json()
    total = int(data.get("page_meta", {}).get("total_count", 0) or 0)

    compounds: list[ChemblActivity] = []
    seen: set[str] = set()
    for act in data.get("activities", []):
        mol = act.get("molecule_chembl_id")
        if not mol or mol in seen:
            continue  # one row per compound (the most potent, since ordered desc)
        seen.add(mol)
        compounds.append(
            ChemblActivity(
                molecule_chembl_id=mol,
                pchembl_value=_to_float(act.get("pchembl_value")),
                standard_type=act.get("standard_type"),
                standard_value=_to_float(act.get("standard_value")),
                standard_units=act.get("standard_units"),
            )
        )
        if len(compounds) >= MAX_COMPOUNDS:
            break
    return compounds, total


def _to_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 3)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
