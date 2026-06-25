from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.models import UniProtAnnotations, UniProtFeature


UNIPROT_API = "https://rest.uniprot.org/uniprotkb"
DEFAULT_TIMEOUT_SECONDS = 10

_DOMAIN_TYPE = "domain"
_ACTIVE_SITE_TYPE = "active site"
_BINDING_SITE_TYPE = "binding site"


def fetch_uniprot_annotations(uniprot_id: str) -> UniProtAnnotations | None:
    """Fetch UniProt annotations for a given accession. Returns None on any failure."""
    try:
        data = _get_json(f"{UNIPROT_API}/{uniprot_id}.json")
        return _parse_annotations(data)
    except Exception:
        return None


def _parse_annotations(data: dict) -> UniProtAnnotations:
    protein_name = _extract_protein_name(data)
    gene_names = _extract_gene_names(data)
    function = _extract_function(data)
    domains, active_sites, binding_sites = _extract_features(data)
    return UniProtAnnotations(
        protein_name=protein_name,
        gene_names=gene_names,
        function=function,
        domains=domains,
        active_sites=active_sites,
        binding_sites=binding_sites,
    )


def _extract_protein_name(data: dict) -> str | None:
    rec_name = data.get("proteinDescription", {}).get("recommendedName", {})
    return rec_name.get("fullName", {}).get("value") or None


def _extract_gene_names(data: dict) -> list[str]:
    names = []
    for gene in data.get("genes", []):
        value = gene.get("geneName", {}).get("value")
        if value:
            names.append(value)
    return names


def _extract_function(data: dict) -> str | None:
    for comment in data.get("comments", []):
        if comment.get("commentType") == "FUNCTION":
            texts = comment.get("texts", [])
            if texts:
                return texts[0].get("value") or None
    return None


def _extract_features(
    data: dict,
) -> tuple[list[UniProtFeature], list[UniProtFeature], list[UniProtFeature]]:
    domains: list[UniProtFeature] = []
    active_sites: list[UniProtFeature] = []
    binding_sites: list[UniProtFeature] = []

    for feature in data.get("features", []):
        feature_type = (feature.get("type") or "").lower()
        location = feature.get("location", {})
        start = location.get("start", {}).get("value")
        end = location.get("end", {}).get("value")
        description = (
            feature.get("description")
            or feature.get("ligand", {}).get("name")
            or None
        )
        record = UniProtFeature(description=description, start=start, end=end)

        if feature_type == _DOMAIN_TYPE:
            domains.append(record)
        elif feature_type == _ACTIVE_SITE_TYPE:
            active_sites.append(record)
        elif feature_type == _BINDING_SITE_TYPE:
            binding_sites.append(record)

    return domains, active_sites, binding_sites


def _get_json(url: str) -> dict:
    request = Request(url, headers={"User-Agent": "protein-interaction-explorer/0.1"})
    try:
        with urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code == 404:
            raise ValueError(f"UniProt entry not found: {url}") from exc
        raise ValueError(f"UniProt request failed with status {exc.code}") from exc
    except (URLError, TimeoutError) as exc:
        raise ValueError("Could not reach UniProt REST API") from exc
