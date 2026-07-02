export type ContactType = "residue-residue" | "protein-ligand" | "protein-water" | "ligand-water";
export type ContactCategory =
  | "protein-protein"
  | "protein-ligand"
  | "protein-water"
  | "ligand-water"
  | "intra-chain"
  | "inter-chain"
  | "very-close-contact";
export type ConfidenceCategory = "very_high" | "confident" | "low" | "very_low";

export type ChainSummary = {
  id: string;
  residue_count: number;
  atom_count: number;
};

export type LigandSummary = {
  name: string;
  chain_id: string;
  residue_number: string;
  atom_count: number;
};

export type HbondStrength = "strong" | "moderate" | "weak";

export type ContactRecord = {
  chain_a: string;
  residue_a: string;
  residue_name_a: string;
  atom_a: string;
  chain_b: string;
  residue_b: string;
  residue_name_b: string;
  atom_b: string;
  distance_angstrom: number;
  contact_type: ContactType;
  contact_categories: ContactCategory[];
  interaction_class?: "h-bond" | "salt-bridge" | "aromatic" | "pi-cation" | "hydrophobic" | "halogen-bond" | "unclassified" | null;
  hbond_strength?: HbondStrength | null;
  source_residue_confidence?: ResidueConfidence | null;
  target_residue_confidence?: ResidueConfidence | null;
  confidence_warning?: boolean;
  trust_label?: "high-confidence" | "inspect-manually" | "low-confidence" | "possible-clash" | "no-confidence-data" | null;
};

export type ViewerSelection =
  | {
      kind: "chain";
      chainId: string;
      label: string;
    }
  | {
      kind: "interface";
      chainA: string;
      chainB: string;
      label: string;
    }
  | {
      kind: "ligand";
      chainId: string;
      residueName: string;
      residueNumber: string;
      label: string;
    }
  | {
      kind: "contact";
      contact: ContactRecord;
      label: string;
    };

export type StructureSummary = {
  atom_count: number;
  residue_count: number;
  chain_count: number;
  ligand_count: number;
  contact_count: number;
};

export type GlobalModelScores = {
  ptm: number | null;
  iptm: number | null;
  pde_mean: number | null;
  chain_iptm: Record<string, number>;
  chain_ptm: Record<string, number>;
};

export type StructureMetadata = {
  source: "upload" | "rcsb" | "alphafold" | "boltz" | "chai";
  status: "current" | "removed" | null;
  pdb_id: string | null;
  uniprot_id: string | null;
  title: string | null;
  method: string | null;
  resolution_angstrom: number | null;
  organism: string | null;
  deposition_date: string | null;
  rcsb_url: string | null;
  alphafold_url: string | null;
  model_url: string | null;
  model_version: number | null;
  entity_count: number | null;
  chain_count: number | null;
  replaced_by: string[];
};

export type ResidueConfidence = {
  chain_id: string;
  residue_number: string;
  residue_name: string;
  plddt: number;
  category: ConfidenceCategory;
};

export type ConfidenceSummary = {
  source: "plddt";
  residue_count: number;
  average_plddt: number;
  very_high_count: number;
  confident_count: number;
  low_count: number;
  very_low_count: number;
  low_confidence_count: number;
};

export type PaeSummary = {
  source: "pae";
  residue_count: number;
  max_predicted_aligned_error: number;
  mean_predicted_aligned_error: number;
  high_error_pair_count: number;
  high_error_threshold: number;
};

export type TopContactResidue = {
  chain_id: string;
  residue_number: string;
  residue_name: string;
  contact_count: number;
};

export type TopContactLigand = {
  chain_id: string;
  residue_number: string;
  name: string;
  contact_count: number;
};

export type DistanceDistribution = {
  under_2_angstrom: number;
  two_to_3_angstrom: number;
  three_to_4_angstrom: number;
  over_4_angstrom: number;
};

export type LigandInteractionSummary = {
  chain_id: string;
  residue_number: string;
  name: string;
  contact_count: number;
  protein_contact_count: number;
  water_contact_count: number;
  possible_clash_count: number;
  closest_distance_angstrom: number | null;
  closest_contact: ContactRecord | null;
  contacting_residues: TopContactResidue[];
  distance_distribution: DistanceDistribution;
  interaction_class_breakdown?: Record<string, number>;
  water_bridge_count?: number;
  contact_efficiency?: number | null;
  hbond_strength_breakdown?: Record<string, number>;
};

export type InteractionSummary = {
  protein_protein_count: number;
  protein_ligand_count: number;
  protein_water_count: number;
  ligand_water_count: number;
  intra_chain_count: number;
  inter_chain_count: number;
  possible_clash_count: number;
  top_contacting_residues: TopContactResidue[];
  top_contacting_ligands: TopContactLigand[];
  closest_contacts: ContactRecord[];
  possible_clashes: ContactRecord[];
};

export type InterfaceResidue = {
  chain_id: string;
  residue_number: string;
  residue_name: string;
  contact_count: number;
  plddt: number | null;
};

export type ChainPairSummary = {
  chain_a: string;
  chain_b: string;
  contact_count: number;
  mean_plddt_a: number | null;
  mean_plddt_b: number | null;
  interface_residue_count_a: number;
  interface_residue_count_b: number;
  interface_residues_a: InterfaceResidue[];
  interface_residues_b: InterfaceResidue[];
};

export type InterfaceAnalysis = {
  chain_pairs: ChainPairSummary[];
  inter_chain_contact_count: number;
  intra_chain_contact_count: number;
};

export type UniProtFeature = {
  description: string | null;
  start: number | null;
  end: number | null;
};

export type UniProtAnnotations = {
  protein_name: string | null;
  gene_names: string[];
  function: string | null;
  domains: UniProtFeature[];
  active_sites: UniProtFeature[];
  binding_sites: UniProtFeature[];
  variants: UniProtFeature[];
};

export type AnalysisResponse = {
  version: string;
  summary: StructureSummary;
  metadata: StructureMetadata | null;
  global_scores: GlobalModelScores | null;
  confidence: ConfidenceSummary | null;
  residue_confidences: ResidueConfidence[];
  pae: PaeSummary | null;
  interaction_summary: InteractionSummary | null;
  ligand_interactions: LigandInteractionSummary[];
  chains: ChainSummary[];
  ligands: LigandSummary[];
  contacts: ContactRecord[];
  water_bridges?: WaterBridgeRecord[];
  warnings: string[];
  interface_analysis?: InterfaceAnalysis | null;
  uniprot_annotations?: UniProtAnnotations | null;
};

export type WaterBridgeRecord = {
  water_chain: string;
  water_residue: string;
  water_residue_number: string;
  protein_chain: string;
  protein_residue: string;
  protein_residue_name: string;
  protein_atom: string;
  dist_to_protein: number;
  ligand_chain: string;
  ligand_residue: string;
  ligand_residue_number: string;
  ligand_residue_name: string;
  ligand_atom: string;
  dist_to_ligand: number;
};

export type StructureComparisonDelta = {
  atom_count_delta: number;
  residue_count_delta: number;
  chain_count_delta: number;
  ligand_count_delta: number;
  contact_count_delta: number;
};

export type ContactDifference = {
  label: string;
  contact_type: ContactType;
  contact_categories: ContactCategory[];
  distance_a_angstrom: number | null;
  distance_b_angstrom: number | null;
};

export type ContactComparisonSummary = {
  shared_contact_count: number;
  gained_contact_count: number;
  lost_contact_count: number;
  shared_contacts: ContactDifference[];
  gained_contacts: ContactDifference[];
  lost_contacts: ContactDifference[];
};

export type StructureComparisonResponse = {
  structure_a: AnalysisResponse;
  structure_b: AnalysisResponse;
  delta: StructureComparisonDelta;
  contacts: ContactComparisonSummary;
  warnings: string[];
};

export type RcsbAnalysisResponse = {
  filename: string;
  structure_format: "cif";
  structure_text: string;
  analysis: AnalysisResponse;
};

export type AlphaFoldAnalysisResponse = RcsbAnalysisResponse;
