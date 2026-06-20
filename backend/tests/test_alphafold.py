import pytest

from app.integrations import alphafold
from app.integrations.alphafold import (
    AlphaFoldFetchError,
    fetch_alphafold_structure,
    fetch_prediction,
    normalize_uniprot_id,
)


def test_normalize_uniprot_id_uppercases_valid_accession():
    assert normalize_uniprot_id(" p69905 ") == "P69905"


@pytest.mark.parametrize("uniprot_id", ["", "P123", "P1234567890X", "P69-05", "P69 05"])
def test_normalize_uniprot_id_rejects_invalid_accession(uniprot_id):
    with pytest.raises(AlphaFoldFetchError, match="6 to 10 alphanumeric"):
        normalize_uniprot_id(uniprot_id)


def test_fetch_prediction_selects_latest_longest_record(monkeypatch):
    def fake_get_json(url: str):
        assert url.endswith("/P69905")
        return [
            {"entryId": "AF-P69905-F1", "latestVersion": 3, "uniprotStart": 1, "uniprotEnd": 120},
            {"entryId": "AF-P69905-F1", "latestVersion": 4, "uniprotStart": 1, "uniprotEnd": 110},
            {"entryId": "AF-P69905-F1", "latestVersion": 4, "uniprotStart": 1, "uniprotEnd": 142},
        ]

    monkeypatch.setattr(alphafold, "get_json", fake_get_json)

    prediction = fetch_prediction("P69905")

    assert prediction["latestVersion"] == 4
    assert prediction["uniprotEnd"] == 142


def test_fetch_alphafold_structure_returns_metadata_and_cif(monkeypatch):
    def fake_get_json(url: str):
        assert url.endswith("/P69905")
        return [
            {
                "entryId": "AF-P69905-F1",
                "latestVersion": 4,
                "uniprotDescription": "Hemoglobin subunit alpha",
                "organismScientificName": "Homo sapiens",
                "modelCreatedDate": "2022-06-01",
                "cifUrl": "https://alphafold.ebi.ac.uk/files/AF-P69905-F1-model_v4.cif",
            }
        ]

    def fake_get_bytes(url: str):
        assert url.endswith("AF-P69905-F1-model_v4.cif")
        return b"data_AF-P69905-F1\n#\n"

    monkeypatch.setattr(alphafold, "get_json", fake_get_json)
    monkeypatch.setattr(alphafold, "get_bytes", fake_get_bytes)

    structure = fetch_alphafold_structure("p69905")

    assert structure.uniprot_id == "P69905"
    assert structure.filename == "AF-P69905-F1-model_v4.cif"
    assert structure.content.startswith(b"data_")
    assert structure.metadata.source == "alphafold"
    assert structure.metadata.uniprot_id == "P69905"
    assert structure.metadata.title == "Hemoglobin subunit alpha"
    assert structure.metadata.organism == "Homo sapiens"
    assert structure.metadata.model_version == 4
    assert structure.metadata.alphafold_url == "https://alphafold.ebi.ac.uk/entry/P69905"
