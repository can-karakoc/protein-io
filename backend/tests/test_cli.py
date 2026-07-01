import json
import subprocess
import sys
from pathlib import Path

SAMPLE_PDB = Path(__file__).parents[2] / "examples" / "sample.pdb"
SAMPLE_CIF = Path(__file__).parents[2] / "examples" / "sample.cif"


def _run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "app.cli", *args],
        capture_output=True,
        text=True,
    )


# ── analyze ───────────────────────────────────────────────────────────────────

def test_analyze_json_output():
    r = _run("analyze", str(SAMPLE_PDB))
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert "summary" in data
    assert data["summary"]["chain_count"] >= 1


def test_analyze_summary_output():
    r = _run("analyze", str(SAMPLE_PDB), "--summary")
    assert r.returncode == 0
    assert "Chains" in r.stdout
    assert "Residues" in r.stdout


def test_analyze_custom_cutoff():
    r = _run("analyze", str(SAMPLE_PDB), "--cutoff", "3.0")
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert data["summary"]["chain_count"] >= 1


def test_analyze_missing_file():
    r = _run("analyze", "/no/such/file.pdb")
    assert r.returncode == 1
    assert "not found" in r.stderr


def test_analyze_bad_extension(tmp_path):
    bad = tmp_path / "file.xyz"
    bad.write_text("data")
    r = _run("analyze", str(bad))
    assert r.returncode == 1
    assert "unsupported" in r.stderr


def test_analyze_cif_file():
    r = _run("analyze", str(SAMPLE_CIF))
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert data["summary"]["chain_count"] >= 1


# ── compare ───────────────────────────────────────────────────────────────────

def test_compare_json_output():
    r = _run("compare", str(SAMPLE_PDB), str(SAMPLE_CIF))
    assert r.returncode == 0
    data = json.loads(r.stdout)
    # Response nests contact diff under `contacts` key
    assert "contacts" in data or "shared_contacts" in data
    assert "structure_a" in data
    assert "structure_b" in data


def test_compare_summary_output():
    r = _run("compare", str(SAMPLE_PDB), str(SAMPLE_CIF), "--summary")
    assert r.returncode == 0
    assert "Compare:" in r.stdout
    assert "Shared" in r.stdout


def test_compare_missing_file():
    r = _run("compare", str(SAMPLE_PDB), "/no/such/file.pdb")
    assert r.returncode == 1
    assert "not found" in r.stderr


# ── batch ─────────────────────────────────────────────────────────────────────

def test_batch_json_output():
    r = _run("batch", str(SAMPLE_PDB), str(SAMPLE_CIF))
    assert r.returncode == 0
    data = json.loads(r.stdout)
    assert data["total"] == 2
    assert data["succeeded"] == 2
    assert data["failed"] == 0
    assert len(data["entries"]) == 2


def test_batch_summary_output():
    r = _run("batch", str(SAMPLE_PDB), str(SAMPLE_CIF), "--summary")
    assert r.returncode == 0
    assert "FILE" in r.stdout
    assert "SCORE" in r.stdout
    assert "sample.pdb" in r.stdout


def test_batch_directory_input():
    examples_dir = SAMPLE_PDB.parent
    r = _run("batch", str(examples_dir), "--summary")
    assert r.returncode == 0
    assert "sample" in r.stdout


def test_batch_csv_export(tmp_path):
    out = tmp_path / "results.csv"
    r = _run("batch", str(SAMPLE_PDB), str(SAMPLE_CIF), "--output", str(out))
    assert r.returncode == 0
    assert out.exists()
    lines = out.read_text().splitlines()
    # header + 2 data rows
    assert len(lines) == 3
    assert "Rank,File,Score" in lines[0]


def test_batch_ranks_entries():
    r = _run("batch", str(SAMPLE_PDB), str(SAMPLE_CIF))
    assert r.returncode == 0
    data = json.loads(r.stdout)
    ranks = [e["rank"] for e in data["entries"] if e["rank"] is not None]
    assert 1 in ranks


def test_batch_no_files(tmp_path):
    # Empty directory — no structure files
    r = _run("batch", str(tmp_path))
    assert r.returncode == 1
    assert "no structure files" in r.stderr


def test_batch_bad_file_does_not_crash(tmp_path):
    bad = tmp_path / "garbage.pdb"
    bad.write_text("not a pdb file at all")
    r = _run("batch", str(SAMPLE_PDB), str(bad))
    assert r.returncode == 2   # partial failure → exit 2
    data = json.loads(r.stdout)
    assert data["succeeded"] == 1
    assert data["failed"] == 1


def test_help_shows_commands():
    r = _run("--help")
    assert r.returncode == 0
    assert "analyze" in r.stdout
    assert "compare" in r.stdout
    assert "batch" in r.stdout
