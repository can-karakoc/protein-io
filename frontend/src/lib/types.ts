export type ContactType = "residue-residue" | "protein-ligand";

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
};

export type StructureSummary = {
  atom_count: number;
  residue_count: number;
  chain_count: number;
  ligand_count: number;
  contact_count: number;
};

export type AnalysisResponse = {
  version: string;
  summary: StructureSummary;
  chains: ChainSummary[];
  ligands: LigandSummary[];
  contacts: ContactRecord[];
  warnings: string[];
};
