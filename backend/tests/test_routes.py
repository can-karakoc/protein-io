from importlib import reload
from pathlib import Path

from fastapi.testclient import TestClient

import app.main as main_module
import app.service as service_module
from app.integrations.rcsb import RcsbFetchError, RcsbStructure
from app.main import app
from app.models import StructureMetadata


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


def test_rcsb_analyze_endpoint_returns_metadata(monkeypatch):
    client = TestClient(app)

    def fake_fetch_rcsb_structure(pdb_id: str) -> RcsbStructure:
        return RcsbStructure(
            pdb_id=pdb_id,
            filename=f"{pdb_id}.cif",
            content=SAMPLE_CIF.read_bytes(),
            metadata=StructureMetadata(
                source="rcsb",
                pdb_id=pdb_id,
                title="Sample kinase structure",
                method="X-RAY DIFFRACTION",
                resolution_angstrom=2.1,
                organism="Homo sapiens",
                deposition_date="2026-01-01",
                rcsb_url=f"https://www.rcsb.org/structure/{pdb_id}",
                entity_count=1,
                chain_count=2,
            ),
        )

    monkeypatch.setattr(service_module, "fetch_rcsb_structure", fake_fetch_rcsb_structure)

    response = client.get("/api/rcsb/1abc/analyze?cutoff_angstrom=4.0")

    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "1abc.cif"
    assert data["structure_format"] == "cif"
    assert data["structure_text"].lstrip().startswith("data_")
    assert data["analysis"]["summary"]["atom_count"] == 17
    assert data["analysis"]["metadata"]["source"] == "rcsb"
    assert data["analysis"]["metadata"]["pdb_id"] == "1abc"
    assert data["analysis"]["metadata"]["title"] == "Sample kinase structure"
    assert "fetch_ms=" in response.headers["X-ProteinIO-Timing"]


def test_rcsb_analyze_endpoint_rejects_invalid_id(monkeypatch):
    client = TestClient(app)

    def fake_fetch_rcsb_structure(pdb_id: str) -> RcsbStructure:
        raise RcsbFetchError("PDB ID must be exactly 4 alphanumeric characters.")

    monkeypatch.setattr(service_module, "fetch_rcsb_structure", fake_fetch_rcsb_structure)

    response = client.get("/api/rcsb/bad-id/analyze")

    assert response.status_code == 400
    assert "4 alphanumeric" in response.json()["detail"]


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
