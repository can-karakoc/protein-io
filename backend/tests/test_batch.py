import asyncio
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

SAMPLE_PDB = Path(__file__).parents[2] / "examples" / "sample.pdb"
SAMPLE_CIF = Path(__file__).parents[2] / "examples" / "sample.cif"
BATCH_SAMPLE = Path(__file__).parents[2] / "examples" / "batch_sample"


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


# ── Phase 13: sidecars, validity, clustering ──────────────────────────────────

def test_batch_pairs_confidence_sidecar_by_stem():
    """A confidence sidecar named like the structure populates ipTM per design."""
    from app.batch import batch_analyze
    from app.models import GlobalModelScores

    sidecar = (None, GlobalModelScores(ptm=0.85, iptm=0.72), [])
    result = asyncio.run(batch_analyze(
        [("design_1.pdb", SAMPLE_PDB.read_bytes())],
        sidecars={"design_1": sidecar},
    ))
    assert result.succeeded == 1
    gs = result.entries[0].analysis.global_scores
    assert gs is not None
    assert gs.iptm == 0.72
    assert gs.ptm == 0.85


def test_batch_without_sidecar_has_no_global_scores():
    from app.batch import batch_analyze

    result = asyncio.run(batch_analyze([("design_1.pdb", SAMPLE_PDB.read_bytes())]))
    assert result.entries[0].analysis.global_scores is None


def test_batch_include_validity_runs_pockets():
    """include_validity=True turns on the heavier pass (pockets populated for a real fold)."""
    from app.batch import batch_analyze

    hsg = (BATCH_SAMPLE / "1HSG.cif").read_bytes()
    off = asyncio.run(batch_analyze([("1HSG.cif", hsg)], include_validity=False))
    on = asyncio.run(batch_analyze([("1HSG.cif", hsg)], include_validity=True))
    assert off.entries[0].analysis.pockets == []
    assert len(on.entries[0].analysis.pockets) >= 1


def test_batch_endpoint_accepts_sidecar_and_validity_flags():
    client = TestClient(app)
    boltz_json = json.dumps({"ptm": 0.9, "iptm": 0.6}).encode()
    response = client.post(
        "/api/batch/analyze",
        files=[
            ("files", ("d1.pdb", SAMPLE_PDB.read_bytes(), "chemical/x-pdb")),
            ("sidecar_files", ("d1_confidence.json", boltz_json, "application/json")),
        ],
        data={"include_validity": "true"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["succeeded"] == 1
    assert body["entries"][0]["analysis"]["global_scores"]["iptm"] == 0.6


def test_batch_endpoint_ignores_unparseable_sidecar():
    client = TestClient(app)
    response = client.post(
        "/api/batch/analyze",
        files=[
            ("files", ("d1.pdb", SAMPLE_PDB.read_bytes(), "chemical/x-pdb")),
            ("sidecar_files", ("d1.json", b"not json at all", "application/json")),
        ],
    )
    # Bad sidecar must not fail the run.
    assert response.status_code == 200
    assert response.json()["succeeded"] == 1


# ── Phase 16: batch natural-language query ─────────────────────────────────────

def test_batch_context_is_compact_one_line_per_structure():
    from app.batch import batch_analyze
    from app.chat import _batch_context

    result = asyncio.run(batch_analyze([
        ("designA.pdb", SAMPLE_PDB.read_bytes()),
        ("designB.pdb", SAMPLE_PDB.read_bytes()),
    ]))
    ctx = _batch_context(result.entries)
    lines = ctx.splitlines()
    assert len(lines) == 2
    assert all(ln.startswith("- design") for ln in lines)
    assert all("chains=" in ln and "residues=" in ln and "contacts=" in ln for ln in lines)


def test_batch_query_empty_question_is_400(monkeypatch):
    monkeypatch.setenv("CHAT_ENABLED", "true")
    client = TestClient(app)
    body = {"batch": {"entries": [], "total": 0, "succeeded": 0, "failed": 0}, "question": "   "}
    assert client.post("/api/batch/query", json=body).status_code == 400


def test_batch_query_disabled_returns_403(monkeypatch):
    monkeypatch.setenv("CHAT_ENABLED", "false")
    client = TestClient(app)
    body = {"batch": {"entries": [], "total": 0, "succeeded": 0, "failed": 0}, "question": "rank them"}
    assert client.post("/api/batch/query", json=body).status_code == 403
