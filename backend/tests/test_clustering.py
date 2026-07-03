from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

SAMPLES = Path(__file__).parents[2] / "examples" / "batch_sample"


def _load(name: str) -> tuple[str, bytes]:
    return (name, (SAMPLES / name).read_bytes())


def test_cluster_groups_same_fold_together():
    """2HHB and 3HHB are both hemoglobin — same fold — so they must share a cluster,
    while crambin (1CRN) is a distinct small fold in its own cluster."""
    from app.clustering import cluster_by_fold

    files = [_load("2HHB.cif"), _load("3HHB.cif"), _load("1CRN.cif")]
    result = cluster_by_fold(files, tm_threshold=0.5)

    assignments = result["assignments"]
    assert assignments["2HHB.cif"] == assignments["3HHB.cif"]
    assert assignments["1CRN.cif"] != assignments["2HHB.cif"]
    # Every input got an assignment and the cluster ids are contiguous from 1.
    assert set(assignments.values()) == set(range(1, len(result["clusters"]) + 1))


def test_cluster_singletons_when_threshold_is_maximal():
    from app.clustering import cluster_by_fold

    files = [_load("1CRN.cif"), _load("1PPE.cif"), _load("1HSG.cif")]
    result = cluster_by_fold(files, tm_threshold=1.0)
    # Distinct folds at TM=1.0 → three singleton clusters.
    assert len(result["clusters"]) == 3
    assert all(c["size"] == 1 for c in result["clusters"])
    assert all(c["mean_tm"] == 1.0 for c in result["clusters"])


def test_cluster_skips_unparseable_files():
    from app.clustering import cluster_by_fold

    files = [_load("1CRN.cif"), ("junk.pdb", b"not a structure")]
    result = cluster_by_fold(files, tm_threshold=0.5)
    assert "junk.pdb" in result["skipped"]
    assert "1CRN.cif" in result["assignments"]


def test_cluster_raises_on_all_bad():
    from app.clustering import ClusterError, cluster_by_fold

    with pytest.raises(ClusterError):
        cluster_by_fold([("a.pdb", b"junk"), ("b.pdb", b"more junk")])


def test_cluster_endpoint():
    client = TestClient(app)
    files = [
        ("files", ("2HHB.cif", (SAMPLES / "2HHB.cif").read_bytes(), "chemical/x-cif")),
        ("files", ("3HHB.cif", (SAMPLES / "3HHB.cif").read_bytes(), "chemical/x-cif")),
        ("files", ("1CRN.cif", (SAMPLES / "1CRN.cif").read_bytes(), "chemical/x-cif")),
    ]
    response = client.post("/api/batch/cluster", files=files, data={"tm_threshold": "0.5"})
    assert response.status_code == 200
    body = response.json()
    assert body["assignments"]["2HHB.cif"] == body["assignments"]["3HHB.cif"]
    assert body["tm_threshold"] == 0.5
    # Representative + members are well-formed.
    for c in body["clusters"]:
        assert c["representative"] in c["members"]
        assert c["size"] == len(c["members"])


def test_cluster_endpoint_rejects_bad_threshold():
    client = TestClient(app)
    files = [("files", ("1CRN.cif", (SAMPLES / "1CRN.cif").read_bytes(), "chemical/x-cif"))]
    response = client.post("/api/batch/cluster", files=files, data={"tm_threshold": "1.5"})
    assert response.status_code == 400
