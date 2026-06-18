from importlib import reload
from pathlib import Path

from fastapi.testclient import TestClient

import app.main as main_module
from app.main import app


SAMPLE_PDB = Path(__file__).parents[2] / "examples" / "sample.pdb"
SAMPLE_CIF = Path(__file__).parents[2] / "examples" / "sample.cif"


def test_health_endpoint():
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analyze_endpoint_returns_clean_response_shape():
    client = TestClient(app)

    with SAMPLE_PDB.open("rb") as handle:
        response = client.post(
            "/analyze",
            files={"file": ("sample.pdb", handle, "chemical/x-pdb")},
            data={"cutoff_angstrom": "4.0"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["version"] == "0.1.0"
    assert data["summary"]["atom_count"] == 17
    assert data["summary"]["chain_count"] == 2
    assert data["summary"]["ligand_count"] == 1
    assert data["summary"]["contact_count"] == len(data["contacts"])
    assert data["chains"]
    assert data["ligands"]
    assert data["contacts"]
    assert isinstance(data["warnings"], list)
    assert "parse_ms=" in response.headers["X-ProteinIO-Timing"]
    assert "contacts_ms=" in response.headers["X-ProteinIO-Timing"]
    assert "response_ms=" in response.headers["X-ProteinIO-Timing"]


def test_analyze_endpoint_accepts_mmcif_upload():
    client = TestClient(app)

    with SAMPLE_CIF.open("rb") as handle:
        response = client.post(
            "/analyze",
            files={"file": ("sample.cif", handle, "chemical/x-mmcif")},
            data={"cutoff_angstrom": "4.0"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["atom_count"] == 17
    assert data["summary"]["chain_count"] == 2
    assert data["summary"]["ligand_count"] == 1
    assert data["summary"]["contact_count"] == len(data["contacts"])


def test_analyze_endpoint_rejects_bad_upload():
    client = TestClient(app)

    response = client.post(
        "/analyze",
        files={"file": ("bad.pdb", b"not a pdb\n", "chemical/x-pdb")},
    )

    assert response.status_code == 400
    assert "does not contain atoms" in response.json()["detail"]


def test_allowed_origins_default_to_local_frontend(monkeypatch):
    monkeypatch.delenv("FRONTEND_ORIGIN", raising=False)
    reload(main_module)

    assert main_module.get_allowed_origins() == ["http://localhost:3000"]


def test_allowed_origins_support_comma_separated_values(monkeypatch):
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://app.vercel.app, https://preview.vercel.app")
    reload(main_module)

    assert main_module.get_allowed_origins() == [
        "http://localhost:3000",
        "https://app.vercel.app",
        "https://preview.vercel.app",
    ]


def test_allowed_origins_always_include_local_frontend(monkeypatch):
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://app.vercel.app")
    reload(main_module)

    assert main_module.get_allowed_origins() == ["http://localhost:3000", "https://app.vercel.app"]
