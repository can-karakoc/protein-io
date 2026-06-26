import type { StructureComparisonResponse } from "@/lib/types";

export function labelFromInput(input: { mode: string; pdbId: string; uniprotId: string; fileName: string | null }): string {
  if (input.mode === "rcsb") return input.pdbId.toUpperCase() || "Structure A";
  if (input.mode === "alphafold") return input.uniprotId.toUpperCase() || "Structure A";
  return input.fileName ?? "Uploaded file";
}

export type CompareSessionEntry = {
  comparison: StructureComparisonResponse;
  cutoff: number;
  labelA: string;
  labelB: string;
  savedAt: string;
};

// Module-level — survives tab switches for the lifetime of the JS session.
let _entry: CompareSessionEntry | null = null;

export function setCompareSession(entry: CompareSessionEntry | null) {
  _entry = entry;
}

export function getCompareSession(): CompareSessionEntry | null {
  return _entry;
}
