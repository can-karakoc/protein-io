"""Tests for interface-aware confidence from the PAE matrix (Phase 10)."""

from __future__ import annotations

from app.interface_confidence import enrich_interface_confidence
from app.models import (
    ChainPairSummary,
    InterfaceAnalysis,
    InterfaceResidue,
    PaeSummary,
    ResidueRecord,
    StructureData,
)


def _residue(chain: str, num: str) -> ResidueRecord:
    return ResidueRecord(
        id=f"{chain}:{num}", name="ALA", chain_id=chain, residue_number=num, kind="protein", atom_ids=[]
    )


def _structure() -> StructureData:
    # Residue order (== PAE order): A:1, A:2, B:1, B:2  → indices 0,1,2,3
    residues = [_residue("A", "1"), _residue("A", "2"), _residue("B", "1"), _residue("B", "2")]
    return StructureData(structure_id="t", atoms=[], residues=residues, chains=[], ligands=[], warnings=[])


def _interface(plddt_a: float | None = 90.0, plddt_b: float | None = 85.0) -> InterfaceAnalysis:
    cp = ChainPairSummary(
        chain_a="A", chain_b="B", contact_count=1,
        mean_plddt_a=plddt_a, mean_plddt_b=plddt_b,
        interface_residue_count_a=1, interface_residue_count_b=1,
        interface_residues_a=[InterfaceResidue(chain_id="A", residue_number="1", residue_name="ALA", contact_count=1, plddt=plddt_a)],
        interface_residues_b=[InterfaceResidue(chain_id="B", residue_number="1", residue_name="ALA", contact_count=1, plddt=plddt_b)],
    )
    return InterfaceAnalysis(chain_pairs=[cp], inter_chain_contact_count=1, intra_chain_contact_count=0)


def _pae(matrix: list[list[float]]) -> PaeSummary:
    return PaeSummary(
        residue_count=len(matrix), max_predicted_aligned_error=max(v for row in matrix for v in row),
        mean_predicted_aligned_error=1.0, high_error_pair_count=0, high_error_threshold=15.0, matrix=matrix,
    )


def test_high_confidence_interface():
    # Low cross-PAE between the interface residues (A:1 idx0, B:1 idx2) → high confidence.
    m = [[1.0] * 4 for _ in range(4)]
    m[0][2] = m[2][0] = 3.0  # interface pair
    ia, pae_matrix = enrich_interface_confidence(_interface(), _pae(m), _structure())

    cp = ia.chain_pairs[0]
    assert cp.interface_pae == 3.0
    assert cp.interface_confidence == "high"
    assert cp.cross_pae_mean is not None
    assert pae_matrix is not None
    assert pae_matrix.size == 4
    assert [b.chain_id for b in pae_matrix.chain_blocks] == ["A", "B"]


def test_low_confidence_when_interface_pae_high():
    m = [[20.0] * 4 for _ in range(4)]
    ia, _ = enrich_interface_confidence(_interface(), _pae(m), _structure())
    cp = ia.chain_pairs[0]
    assert cp.interface_pae == 20.0
    assert cp.interface_confidence == "low"


def test_moderate_confidence():
    m = [[8.0] * 4 for _ in range(4)]
    ia, _ = enrich_interface_confidence(_interface(plddt_a=60.0, plddt_b=60.0), _pae(m), _structure())
    assert ia.chain_pairs[0].interface_confidence == "moderate"


def test_unaligned_matrix_skips_metrics_but_keeps_heatmap():
    # 5×5 matrix but only 4 protein residues → cannot align.
    m = [[2.0] * 5 for _ in range(5)]
    ia, pae_matrix = enrich_interface_confidence(_interface(), _pae(m), _structure())
    assert ia.chain_pairs[0].interface_pae is None
    assert pae_matrix is not None
    assert pae_matrix.size == 5
    assert pae_matrix.chain_blocks == []  # no alignment → no chain delineation


def test_downsample_large_matrix():
    n = 200
    m = [[float((i + j) % 30) for j in range(n)] for i in range(n)]
    _, pae_matrix = enrich_interface_confidence(None, _pae(m), _structure())
    assert pae_matrix is not None
    assert pae_matrix.size == 200
    assert pae_matrix.down_size == 80
    assert len(pae_matrix.values) == 80
    assert len(pae_matrix.values[0]) == 80


def test_no_pae_returns_none():
    ia, pae_matrix = enrich_interface_confidence(_interface(), None, _structure())
    assert pae_matrix is None
    assert ia.chain_pairs[0].interface_pae is None
