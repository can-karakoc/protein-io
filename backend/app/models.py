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
    hbond_strength: Literal["strong", "moderate", "weak"] | None = None
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
    contact_efficiency: float | None = None
    hbond_strength_breakdown: dict[str, int] = Field(default_factory=dict)


class LigandChemistry(BaseModel):
    """RDKit-derived cheminformatics for a bound ligand."""
    smiles: str | None = None
    formula: str | None = None
    molecular_weight: float | None = None
    logp: float | None = None
    h_bond_donors: int | None = None
    h_bond_acceptors: int | None = None
    tpsa: float | None = None
    rotatable_bonds: int | None = None
    ring_count: int | None = None
    qed: float | None = None
    lipinski_pass: bool | None = None
    lipinski_violations: int | None = None
    pains_alerts: int | None = None
    depiction_svg: str | None = None


class PoseValidityCheck(BaseModel):
    name: str
    passed: bool
    description: str


class LigandValidity(BaseModel):
    """Physical-validity + chemistry report for a single bound ligand."""
    name: str
    chain_id: str
    residue_number: str
    atom_count: int
    is_small_molecule: bool = False
    pb_valid: bool | None = None
    checks: list[PoseValidityCheck] = Field(default_factory=list)
    strain_energy: float | None = None
    chemistry: LigandChemistry | None = None
    note: str | None = None


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
    # Full N×N matrix retained transiently for interface-confidence computation;
    # excluded from API output (the downsampled PaeMatrix is exposed instead).
    matrix: list[list[float]] | None = Field(default=None, exclude=True, repr=False)


class PaeChainBlock(BaseModel):
    """Span of one chain along a (downsampled) PAE axis, for heatmap delineation."""
    chain_id: str
    start: int
    end: int


class PaeMatrix(BaseModel):
    """Downsampled PAE matrix for heatmap rendering."""
    size: int              # original residue/token dimension
    down_size: int         # rendered dimension (== size when small)
    values: list[list[float]]
    max_error: float
    chain_blocks: list[PaeChainBlock] = Field(default_factory=list)


class GlobalModelScores(BaseModel):
    """ptm / iptm and related global confidence scores from Boltz / Chai sidecars."""
    ptm: float | None = None
    iptm: float | None = None
    pde_mean: float | None = None
    chain_iptm: dict[str, float] = Field(default_factory=dict)
    chain_ptm: dict[str, float] = Field(default_factory=dict)


class StructureMetadata(BaseModel):
    source: Literal["upload", "rcsb", "alphafold", "boltz", "chai"] = "upload"
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


InterfaceConfidence = Literal["high", "moderate", "low"]


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
    # Interface-aware confidence (populated when a PAE sidecar is present and aligns).
    interface_pae: float | None = None      # mean PAE over interface-residue pairs (both directions)
    cross_pae_mean: float | None = None     # mean PAE over all A×B residue pairs (both directions)
    interface_confidence: InterfaceConfidence | None = None


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
    global_scores: GlobalModelScores | None = None
    confidence: ConfidenceSummary | None = None
    residue_confidences: list[ResidueConfidence] = Field(default_factory=list)
    pae: PaeSummary | None = None
    pae_matrix: PaeMatrix | None = None
    interaction_summary: InteractionSummary | None = None
    ligand_interactions: list[LigandInteractionSummary] = Field(default_factory=list)
    ligand_validity: list[LigandValidity] = Field(default_factory=list)
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


class TmAlignResult(BaseModel):
    """TM-align structural alignment scores."""
    tm_score_query: float
    tm_score_target: float
    rmsd: float
    query_length: int
    target_length: int


class LddtResult(BaseModel):
    """Cα-lDDT of structure A (model) relative to structure B (reference)."""
    lddt: float
    residue_count: int


class StructureComparisonResponse(BaseModel):
    structure_a: AnalysisResponse
    structure_b: AnalysisResponse
    delta: StructureComparisonDelta
    contacts: ContactComparisonSummary
    tm_align: TmAlignResult | None = None
    lddt: LddtResult | None = None
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


class BatchDesignEntry(BaseModel):
    filename: str
    analysis: AnalysisResponse | None = None
    error: str | None = None


class BatchAnalysisResponse(BaseModel):
    entries: list[BatchDesignEntry]
    total: int
    succeeded: int
    failed: int


class FoldseekHit(BaseModel):
    rank: int
    database: str
    target: str
    pdb_id: str | None = None
    chain: str | None = None
    uniprot_id: str | None = None
    title: str | None = None
    organism: str | None = None
    tmscore: float | None = None
    seq_identity: float | None = None
    evalue: float | None = None
    prob: float | None = None


class FoldseekSearchResult(BaseModel):
    hits: list[FoldseekHit]
    ticket_id: str
    database_counts: dict[str, int] = Field(default_factory=dict)
