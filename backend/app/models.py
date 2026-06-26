from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


ContactType = Literal["residue-residue", "protein-ligand", "protein-water", "ligand-water"]
ContactCategory = Literal[
    "protein-protein",
    "protein-ligand",
    "protein-water",
    "ligand-water",
    "intra-chain",
    "inter-chain",
    "very-close-contact",
    "possible-clash",
]
ConfidenceCategory = Literal["very_high", "confident", "low", "very_low"]
ResidueKind = Literal["protein", "ligand", "water", "other"]
TrustLabel = Literal["high-confidence", "inspect-manually", "low-confidence", "possible-clash", "no-confidence-data"]
InteractionClass = Literal["h-bond", "salt-bridge", "aromatic", "pi-cation", "hydrophobic", "halogen-bond", "unclassified"]


class AtomRecord(BaseModel):
    id: str
    name: str
    element: str
    x: float
    y: float
    z: float
    b_factor: float | None = None
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
    contact_categories: list[ContactCategory] = Field(default_factory=list)
    interaction_class: InteractionClass = "unclassified"
    source_residue_confidence: ResidueConfidence | None = None
    target_residue_confidence: ResidueConfidence | None = None
    confidence_warning: bool = False
    trust_label: TrustLabel | None = None


class TopContactResidue(BaseModel):
    chain_id: str
    residue_number: str
    residue_name: str
    contact_count: int


class TopContactLigand(BaseModel):
    chain_id: str
    residue_number: str
    name: str
    contact_count: int


class DistanceDistribution(BaseModel):
    under_2_angstrom: int = 0
    two_to_3_angstrom: int = 0
    three_to_4_angstrom: int = 0
    over_4_angstrom: int = 0


class LigandInteractionSummary(BaseModel):
    chain_id: str
    residue_number: str
    name: str
    contact_count: int
    protein_contact_count: int = 0
    water_contact_count: int = 0
    possible_clash_count: int = 0
    closest_distance_angstrom: float | None = None
    closest_contact: ContactRecord | None = None
    contacting_residues: list[TopContactResidue] = Field(default_factory=list)
    distance_distribution: DistanceDistribution = Field(default_factory=DistanceDistribution)
    interaction_class_breakdown: dict[str, int] = Field(default_factory=dict)
    water_bridge_count: int = 0


class InteractionSummary(BaseModel):
    protein_protein_count: int = 0
    protein_ligand_count: int = 0
    protein_water_count: int = 0
    ligand_water_count: int = 0
    intra_chain_count: int = 0
    inter_chain_count: int = 0
    possible_clash_count: int = 0
    top_contacting_residues: list[TopContactResidue] = Field(default_factory=list)
    top_contacting_ligands: list[TopContactLigand] = Field(default_factory=list)
    closest_contacts: list[ContactRecord] = Field(default_factory=list)
    possible_clashes: list[ContactRecord] = Field(default_factory=list)


class StructureSummary(BaseModel):
    atom_count: int
    residue_count: int
    chain_count: int
    ligand_count: int
    contact_count: int = 0


class ResidueConfidence(BaseModel):
    chain_id: str
    residue_number: str
    residue_name: str
    plddt: float
    category: ConfidenceCategory


class ConfidenceSummary(BaseModel):
    source: Literal["plddt"] = "plddt"
    residue_count: int
    average_plddt: float
    very_high_count: int
    confident_count: int
    low_count: int
    very_low_count: int
    low_confidence_count: int


class PaeSummary(BaseModel):
    source: Literal["pae"] = "pae"
    residue_count: int
    max_predicted_aligned_error: float
    mean_predicted_aligned_error: float
    high_error_pair_count: int
    high_error_threshold: float


class StructureMetadata(BaseModel):
    source: Literal["upload", "rcsb", "alphafold"] = "upload"
    status: Literal["current", "removed"] | None = None
    pdb_id: str | None = None
    uniprot_id: str | None = None
    title: str | None = None
    method: str | None = None
    resolution_angstrom: float | None = None
    organism: str | None = None
    deposition_date: str | None = None
    rcsb_url: str | None = None
    alphafold_url: str | None = None
    model_url: str | None = None
    model_version: int | None = None
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


class InterfaceResidue(BaseModel):
    chain_id: str
    residue_number: str
    residue_name: str
    contact_count: int
    plddt: float | None = None


class ChainPairSummary(BaseModel):
    chain_a: str
    chain_b: str
    contact_count: int
    mean_plddt_a: float | None = None
    mean_plddt_b: float | None = None
    interface_residue_count_a: int = 0
    interface_residue_count_b: int = 0
    interface_residues_a: list[InterfaceResidue] = Field(default_factory=list)
    interface_residues_b: list[InterfaceResidue] = Field(default_factory=list)


class WaterBridgeRecord(BaseModel):
    water_chain: str
    water_residue: str
    water_residue_number: str
    protein_chain: str
    protein_residue: str
    protein_residue_name: str
    protein_atom: str
    dist_to_protein: float
    ligand_chain: str
    ligand_residue: str
    ligand_residue_number: str
    ligand_residue_name: str
    ligand_atom: str
    dist_to_ligand: float


class InterfaceAnalysis(BaseModel):
    chain_pairs: list[ChainPairSummary] = Field(default_factory=list)
    inter_chain_contact_count: int = 0
    intra_chain_contact_count: int = 0


class AnalysisResponse(BaseModel):
    version: str = "0.1.0"
    summary: StructureSummary
    metadata: StructureMetadata | None = None
    confidence: ConfidenceSummary | None = None
    residue_confidences: list[ResidueConfidence] = Field(default_factory=list)
    pae: PaeSummary | None = None
    interaction_summary: InteractionSummary | None = None
    ligand_interactions: list[LigandInteractionSummary] = Field(default_factory=list)
    chains: list[ChainSummary]
    ligands: list[LigandSummary]
    contacts: list[ContactRecord]
    water_bridges: list[WaterBridgeRecord] = Field(default_factory=list)
    interface_analysis: InterfaceAnalysis | None = None
    uniprot_annotations: UniProtAnnotations | None = None
    warnings: list[str] = Field(default_factory=list)


class UniProtFeature(BaseModel):
    description: str | None = None
    start: int | None = None
    end: int | None = None


class UniProtAnnotations(BaseModel):
    protein_name: str | None = None
    gene_names: list[str] = Field(default_factory=list)
    function: str | None = None
    domains: list[UniProtFeature] = Field(default_factory=list)
    active_sites: list[UniProtFeature] = Field(default_factory=list)
    binding_sites: list[UniProtFeature] = Field(default_factory=list)
    variants: list[UniProtFeature] = Field(default_factory=list)


class StructureComparisonDelta(BaseModel):
    atom_count_delta: int
    residue_count_delta: int
    chain_count_delta: int
    ligand_count_delta: int
    contact_count_delta: int


class ContactDifference(BaseModel):
    label: str
    contact_type: ContactType
    contact_categories: list[ContactCategory] = Field(default_factory=list)
    distance_a_angstrom: float | None = None
    distance_b_angstrom: float | None = None


class ContactComparisonSummary(BaseModel):
    shared_contact_count: int
    gained_contact_count: int
    lost_contact_count: int
    shared_contacts: list[ContactDifference] = Field(default_factory=list)
    gained_contacts: list[ContactDifference] = Field(default_factory=list)
    lost_contacts: list[ContactDifference] = Field(default_factory=list)


class StructureComparisonResponse(BaseModel):
    structure_a: AnalysisResponse
    structure_b: AnalysisResponse
    delta: StructureComparisonDelta
    contacts: ContactComparisonSummary
    warnings: list[str] = Field(default_factory=list)


class FetchedStructureAnalysisResponse(BaseModel):
    filename: str
    structure_format: Literal["cif"] = "cif"
    structure_text: str
    analysis: AnalysisResponse


class RcsbAnalysisResponse(FetchedStructureAnalysisResponse):
    pass


class AlphaFoldAnalysisResponse(FetchedStructureAnalysisResponse):
    pass
