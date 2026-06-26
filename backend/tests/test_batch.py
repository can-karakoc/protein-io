import asyncio
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

SAMPLE_PDB = Path(__file__).parents[2] / "examples" / "sample.pdb"
SAMPLE_CIF = Path(__file__).parents[2] / "examples" / "sample.cif"


# ── unit tests for batch_analyze ──────────────────────────────────────────────

def test_batch_analyze_returns_one_entry_per_file():
    from app.batch import batch_analyze

    pdb_bytes = SAMPLE_PDB.read_bytes()
    result = asyncio.run(batch_analyze([
        ("a.pdb", pdb_bytes),
        ("b.pdb", pdb_bytes),
    ]))
    assert result.total == 2
    assert result.succeeded == 2
    assert result.failed == 0
    assert len(result.entries) == 2
    assert all(e.error is None for e in result.entries)
    assert all(e.analysis is not None for e in result.entries)


def test_batch_analyze_reports_error_per_bad_file():
    from app.batch import batch_analyze

    pdb_bytes = SAMPLE_PDB.read_bytes()
    result = asyncio.run(batch_analyze([
        ("good.pdb", pdb_bytes),
        ("bad.pdb", b"not a valid structure"),
    ]))
    assert result.total == 2
    assert result.succeeded == 1
    assert result.failed == 1
    assert result.entries[0].error is None
    assert result.entries[0].analysis is not None
    assert result.entries[1].error is not None
    assert result.entries[1].analysis is None


def test_batch_analyze_empty_list():
    from app.batch import batch_analyze

    result = asyncio.run(batch_analyze([]))
    assert result.total == 0
    assert result.succeeded == 0
    assert result.failed == 0


def test_batch_analyze_mixed_formats():
    from app.batch import batch_analyze

    result = asyncio.run(batch_analyze([
        ("a.pdb", SAMPLE_PDB.read_bytes()),
        ("b.cif", SAMPLE_CIF.read_bytes()),
    ]))
    assert result.total == 2
    assert result.succeeded == 2
    assert result.failed == 0


# ── HTTP endpoint tests ───────────────────────────────────────────────────────

def test_batch_endpoint_returns_valid_response():
    client = TestClient(app)
    pdb_bytes = SAMPLE_PDB.read_bytes()

    response = client.post(
        "/api/batch/analyze",
        files=[
            ("files", ("a.pdb", pdb_bytes, "chemical/x-pdb")),
            ("files", ("b.pdb", pdb_bytes, "chemical/x-pdb")),
        ],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["succeeded"] == 2
    assert body["failed"] == 0
    assert len(body["entries"]) == 2
    for entry in body["entries"]:
        assert entry["error"] is None
        assert entry["analysis"] is not None


def test_batch_endpoint_rejects_over_50_files():
    client = TestClient(app)
    pdb_bytes = SAMPLE_PDB.read_bytes()

    files = [("files", (f"f{i}.pdb", pdb_bytes, "chemical/x-pdb")) for i in range(51)]
    response = client.post("/api/batch/analyze", files=files)

    assert response.status_code == 400
    assert "50" in response.json()["detail"]


def test_batch_endpoint_handles_bad_file_gracefully():
    client = TestClient(app)

    response = client.post(
        "/api/batch/analyze",
        files=[
            ("files", ("good.pdb", SAMPLE_PDB.read_bytes(), "chemical/x-pdb")),
            ("files", ("bad.pdb", b"garbage", "chemical/x-pdb")),
        ],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["succeeded"] == 1
    assert body["failed"] == 1
    assert body["entries"][1]["error"] is not None
