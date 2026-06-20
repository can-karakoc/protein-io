import pytest

from app.integrations import rcsb
from app.integrations.rcsb import RcsbFetchError, fetch_metadata, normalize_pdb_id


def test_normalize_pdb_id_uppercases_valid_id():
    assert normalize_pdb_id(" 1abc ") == "1ABC"


@pytest.mark.parametrize("pdb_id", ["", "ABC", "ABCDE", "AB_C", "12 4"])
def test_normalize_pdb_id_rejects_invalid_id(pdb_id):
    with pytest.raises(RcsbFetchError, match="4 alphanumeric"):
        normalize_pdb_id(pdb_id)


def test_fetch_metadata_falls_back_to_removed_entry(monkeypatch):
    def fake_get_json(url: str):
        if url.endswith("/entry/1HHB"):
            raise RcsbFetchError("No RCSB entry was found for that PDB ID.")
        if url.endswith("/holdings/removed/1HHB"):
            return {
                "rcsb_repository_holdings_removed": {
                    "title": "THREE-DIMENSIONAL FOURIER SYNTHESIS OF HUMAN DEOXYHEMOGLOBIN",
                    "deposit_date": "1975-04-01T00:00:00.000+00:00",
                    "id_codes_replaced_by": ["2HHB", "3HHB", "4HHB"],
                }
            }
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(rcsb, "get_json", fake_get_json)

    metadata = fetch_metadata("1HHB")

    assert metadata.status == "removed"
    assert metadata.pdb_id == "1HHB"
    assert metadata.replaced_by == ["2HHB", "3HHB", "4HHB"]
    assert metadata.deposition_date == "1975-04-01"
