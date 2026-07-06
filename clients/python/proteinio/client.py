"""A small, dependency-light client for the Protein I/O structure-review API.

Point it at a backend you run yourself (local `uvicorn`, Docker, or your own host) —
Protein I/O is local-first, so there is no hosted public endpoint to depend on.

    from proteinio import Client
    pio = Client("http://localhost:8000")
    result = pio.analyze_pdb("1hsg")
    print(result["summary"]["contact_count"])
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx

DEFAULT_BASE_URL = os.environ.get("PROTEINIO_API_URL", "http://localhost:8000")


class ProteinIOError(RuntimeError):
    """Raised when the API returns an error response."""


class Client:
    def __init__(self, base_url: str = DEFAULT_BASE_URL, *, timeout: float = 120.0) -> None:
        self.base_url = base_url.rstrip("/")
        self._http = httpx.Client(base_url=self.base_url, timeout=timeout)

    # ── context manager / cleanup ─────────────────────────────────────────────
    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "Client":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _json(self, resp: httpx.Response) -> Any:
        if resp.status_code >= 400:
            detail = None
            try:
                detail = resp.json().get("detail")
            except Exception:
                detail = resp.text
            raise ProteinIOError(f"{resp.status_code} {resp.request.method} {resp.request.url}: {detail}")
        return resp.json()

    # ── meta ──────────────────────────────────────────────────────────────────
    def health(self) -> dict:
        """Liveness check — {'status': 'ok'} when the backend is up."""
        return self._json(self._http.get("/health"))

    def versions(self) -> dict:
        """Installed versions of the tools behind the analysis (for provenance)."""
        return self._json(self._http.get("/api/versions"))

    # ── analyze by identifier ──────────────────────────────────────────────────
    def analyze_pdb(self, pdb_id: str, *, cutoff: float = 4.0) -> dict:
        """Fetch a PDB entry from RCSB and analyze it. Returns the analysis object."""
        r = self._json(self._http.get(f"/api/rcsb/{pdb_id}/analyze", params={"cutoff_angstrom": cutoff}))
        return r["analysis"]

    def analyze_alphafold(self, uniprot: str, *, cutoff: float = 4.0) -> dict:
        """Fetch an AlphaFold DB model by UniProt accession and analyze it."""
        r = self._json(self._http.get(f"/api/alphafold/{uniprot}/analyze", params={"cutoff_angstrom": cutoff}))
        return r["analysis"]

    # ── analyze a local file ────────────────────────────────────────────────────
    def analyze_file(self, path: str | os.PathLike, *, cutoff: float = 4.0, confidence: str | os.PathLike | None = None) -> dict:
        """Upload a .pdb/.cif and analyze it. `confidence` is an optional PAE/Boltz/Chai sidecar."""
        files: list[tuple[str, tuple[str, bytes, str]]] = [("file", (Path(path).name, Path(path).read_bytes(), "application/octet-stream"))]
        if confidence is not None:
            files.append(("confidence_file", (Path(confidence).name, Path(confidence).read_bytes(), "application/octet-stream")))
        return self._json(self._http.post("/api/analyze", files=files, data={"cutoff_angstrom": str(cutoff)}))

    def compare(self, path_a: str | os.PathLike, path_b: str | os.PathLike, *, cutoff: float = 4.0) -> dict:
        """Compare two structures (delta, shared/gained/lost contacts, TM-align, lDDT, DockQ)."""
        files = [
            ("file_a", (Path(path_a).name, Path(path_a).read_bytes(), "application/octet-stream")),
            ("file_b", (Path(path_b).name, Path(path_b).read_bytes(), "application/octet-stream")),
        ]
        return self._json(self._http.post("/api/compare", files=files, data={"cutoff_angstrom": str(cutoff)}))

    # ── batch ────────────────────────────────────────────────────────────────────
    def batch_analyze(self, paths: list[str | os.PathLike], *, cutoff: float = 4.0, include_validity: bool = False) -> dict:
        """Analyze a campaign of designs; returns per-file entries + a ranked summary."""
        files = [("files", (Path(p).name, Path(p).read_bytes(), "application/octet-stream")) for p in paths]
        return self._json(self._http.post(
            "/api/batch/analyze", files=files,
            data={"cutoff_angstrom": str(cutoff), "include_validity": str(include_validity).lower()},
        ))

    def batch_cluster(self, paths: list[str | os.PathLike], *, tm_threshold: float = 0.5) -> dict:
        """Cluster a set of designs by fold (in-house all-vs-all TM-align)."""
        files = [("files", (Path(p).name, Path(p).read_bytes(), "application/octet-stream")) for p in paths]
        return self._json(self._http.post("/api/batch/cluster", files=files, data={"tm_threshold": str(tm_threshold)}))

    # ── context ──────────────────────────────────────────────────────────────────
    def chembl(self, uniprot: str) -> dict | None:
        """Known-binder / bioactivity summary from ChEMBL by UniProt accession (None if absent)."""
        resp = self._http.get(f"/api/chembl/{uniprot}/summary")
        if resp.status_code == 404:
            return None
        return self._json(resp)
