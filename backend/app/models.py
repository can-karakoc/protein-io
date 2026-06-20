from typing import Literal

from pydantic import BaseModel, Field


ContactType = Literal["residue-residue", "protein-ligand"]
ResidueKind = Literal["protein", "ligand", "water", "other"]


class AtomRecord(BaseModel):
    id: str
    name: str
    element: str
    x: float
    y: float
    z: float
    chain_id: str
    residue_id: str
    residue_name: str
    residue_number: str
    residue_kind: ResidueKind


class ResidueRecord(BaseModel):
    id: str
    name: str
    chain_id: str
    residue_number: str
    kind: ResidueKind
    atom_ids: list[str]


class ChainSummary(BaseModel):
    id: str
    residue_count: int
    atom_count: int


class LigandSummary(BaseModel):
    name: str
    chain_id: str
    residue_number: str
    atom_count: int


class ContactRecord(BaseModel):
    chain_a: str
    residue_a: str
    residue_name_a: str
    atom_a: str
    chain_b: str
    residue_b: str
    residue_name_b: str
    atom_b: str
    distance_angstrom: float
    contact_type: ContactType


class StructureSummary(BaseModel):
    atom_count: int
    residue_count: int
    chain_count: int
    ligand_count: int
    contact_count: int = 0


class StructureMetadata(BaseModel):
    source: Literal["upload", "rcsb"] = "upload"
    status: Literal["current", "removed"] | None = None
    pdb_id: str | None = None
    title: str | None = None
    method: str | None = None
    resolution_angstrom: float | None = None
    organism: str | None = None
    deposition_date: str | None = None
    rcsb_url: str | None = None
    entity_count: int | None = None
    chain_count: int | None = None
    replaced_by: list[str] = Field(default_factory=list)


class StructureData(BaseModel):
    structure_id: str
    atoms: list[AtomRecord]
    residues: list[ResidueRecord]
    chains: list[ChainSummary]
    ligands: list[LigandSummary]
    warnings: list[str] = Field(default_factory=list)

    @property
    def summary(self) -> StructureSummary:
        protein_residue_count = sum(1 for residue in self.residues if residue.kind == "protein")
        return StructureSummary(
            atom_count=len(self.atoms),
            residue_count=protein_residue_count,
            chain_count=len(self.chains),
            ligand_count=len(self.ligands),
        )


class AnalysisResponse(BaseModel):
    version: str = "0.1.0"
    summary: StructureSummary
    metadata: StructureMetadata | None = None
    chains: list[ChainSummary]
    ligands: list[LigandSummary]
    contacts: list[ContactRecord]
    warnings: list[str] = Field(default_factory=list)


class RcsbAnalysisResponse(BaseModel):
    filename: str
    structure_format: Literal["cif"] = "cif"
    structure_text: str
    analysis: AnalysisResponse
