from app.integrations.uniprot import _parse_annotations, fetch_uniprot_annotations
from app.models import UniProtAnnotations


# ---------------------------------------------------------------------------
# _parse_annotations — unit tests against fixture dicts
# ---------------------------------------------------------------------------

def _make_feature(feature_type: str, description: str | None, start: int, end: int) -> dict:
    return {
        "type": feature_type,
        "description": description,
        "location": {"start": {"value": start}, "end": {"value": end}},
    }


def test_parse_extracts_protein_name():
    data = {
        "proteinDescription": {
            "recommendedName": {
                "fullName": {"value": "Hemoglobin subunit alpha"}
            }
        }
    }
    result = _parse_annotations(data)
    assert result.protein_name == "Hemoglobin subunit alpha"


def test_parse_protein_name_missing_returns_none():
    result = _parse_annotations({})
    assert result.protein_name is None


def test_parse_extracts_gene_names():
    data = {
        "genes": [
            {"geneName": {"value": "HBA1"}},
            {"geneName": {"value": "HBA2"}},
        ]
    }
    result = _parse_annotations(data)
    assert result.gene_names == ["HBA1", "HBA2"]


def test_parse_gene_names_missing_skipped():
    data = {"genes": [{"synonyms": [{"value": "irrelevant"}]}]}
    result = _parse_annotations(data)
    assert result.gene_names == []


def test_parse_extracts_function():
    data = {
        "comments": [
            {"commentType": "FUNCTION", "texts": [{"value": "Carries oxygen."}]},
        ]
    }
    result = _parse_annotations(data)
    assert result.function == "Carries oxygen."


def test_parse_function_missing_returns_none():
    result = _parse_annotations({"comments": [{"commentType": "SUBUNIT", "texts": [{"value": "Homodimer."}]}]})
    assert result.function is None


def test_parse_extracts_domains():
    data = {"features": [_make_feature("Domain", "Globin", 2, 141)]}
    result = _parse_annotations(data)
    assert len(result.domains) == 1
    assert result.domains[0].description == "Globin"
    assert result.domains[0].start == 2
    assert result.domains[0].end == 141


def test_parse_extracts_active_sites():
    data = {"features": [_make_feature("Active site", "Proton donor", 87, 87)]}
    result = _parse_annotations(data)
    assert len(result.active_sites) == 1
    assert result.active_sites[0].description == "Proton donor"
    assert result.active_sites[0].start == 87


def test_parse_extracts_binding_sites():
    data = {"features": [_make_feature("Binding site", "Heme; via nitrogen", 58, 58)]}
    result = _parse_annotations(data)
    assert len(result.binding_sites) == 1
    assert result.binding_sites[0].description == "Heme; via nitrogen"


def test_parse_binding_site_uses_ligand_name_as_fallback():
    feature = {
        "type": "Binding site",
        "location": {"start": {"value": 40}, "end": {"value": 40}},
        "ligand": {"name": "iron"},
    }
    result = _parse_annotations({"features": [feature]})
    assert result.binding_sites[0].description == "iron"


def test_parse_unknown_feature_types_ignored():
    data = {"features": [_make_feature("Region", "Some region", 1, 50)]}
    result = _parse_annotations(data)
    assert result.domains == []
    assert result.active_sites == []
    assert result.binding_sites == []


def test_parse_multiple_feature_types():
    data = {
        "features": [
            _make_feature("Domain", "Globin", 2, 141),
            _make_feature("Active site", "Proximal histidine", 87, 87),
            _make_feature("Binding site", "Heme", 58, 58),
            _make_feature("Domain", "Hinge", 150, 160),
        ]
    }
    result = _parse_annotations(data)
    assert len(result.domains) == 2
    assert len(result.active_sites) == 1
    assert len(result.binding_sites) == 1


def test_parse_empty_data_returns_empty_annotations():
    result = _parse_annotations({})
    assert isinstance(result, UniProtAnnotations)
    assert result.protein_name is None
    assert result.gene_names == []
    assert result.function is None
    assert result.domains == []
    assert result.active_sites == []
    assert result.binding_sites == []


# ---------------------------------------------------------------------------
# fetch_uniprot_annotations — fail-soft
# ---------------------------------------------------------------------------

def test_fetch_returns_none_on_network_failure(monkeypatch):
    def raise_error(url: str) -> dict:
        raise ValueError("network down")

    monkeypatch.setattr("app.integrations.uniprot._get_json", raise_error)
    result = fetch_uniprot_annotations("P12345")
    assert result is None
