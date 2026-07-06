"""Integration tests — skipped unless a backend is reachable.

Run against a live backend:  PROTEINIO_API_URL=http://localhost:8000 pytest
"""

import os

import httpx
import pytest

from proteinio import Client

BASE = os.environ.get("PROTEINIO_API_URL", "http://localhost:8000")


def _backend_up() -> bool:
    try:
        return httpx.get(f"{BASE}/health", timeout=2.0).status_code == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _backend_up(), reason=f"no Protein I/O backend at {BASE}")


def test_health():
    assert Client(BASE).health()["status"] == "ok"


def test_versions():
    assert "gemmi" in Client(BASE).versions()


def test_analyze_pdb():
    a = Client(BASE).analyze_pdb("1crn")
    assert a["summary"]["chain_count"] >= 1
    assert isinstance(a["contacts"], list)
