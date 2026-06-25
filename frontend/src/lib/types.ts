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
  source_residue_confidence?: ResidueConfidence | null;
  target_residue_confidence?: ResidueConfidence | null;
  confidence_warning?: boolean;
};

export type ViewerSelection =
  | {
      kind: "chain";
      chainId: string;
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

export type StructureMetadata = {
  source: "upload" | "rcsb" | "alphafold";
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
  very_close_contact_count: number;
  closest_distance_angstrom: number | null;
  closest_contact: ContactRecord | null;
  contacting_residues: TopContactResidue[];
  distance_distribution: DistanceDistribution;
};

export type InteractionSummary = {
  protein_protein_count: number;
  protein_ligand_count: number;
  protein_water_count: number;
  ligand_water_count: number;
  intra_chain_count: number;
  inter_chain_count: number;
  very_close_contact_count: number;
  top_contacting_residues: TopContactResidue[];
  top_contacting_ligands: TopContactLigand[];
  closest_contacts: ContactRecord[];
  very_close_contacts: ContactRecord[];
};

export type AnalysisResponse = {
  version: string;
  summary: StructureSummary;
  metadata: StructureMetadata | null;
  confidence: ConfidenceSummary | null;
  residue_confidences: ResidueConfidence[];
  pae: PaeSummary | null;
  interaction_summary: InteractionSummary | null;
  ligand_interactions: LigandInteractionSummary[];
  chains: ChainSummary[];
  ligands: LigandSummary[];
  contacts: ContactRecord[];
  warnings: string[];
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
