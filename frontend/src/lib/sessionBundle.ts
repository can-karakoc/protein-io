// File-based session export/import. A bundle is a self-contained JSON snapshot of the
// loaded structures + their computed analyses — no backend, no account. Share it, or
// reopen it later to restore the workspace exactly (analyses included, so nothing
// re-fetches or recomputes).

import type { StructureEntry } from "./workspaceStore";

const FORMAT = "protein-io-session";
const VERSION = 1;

// The fields worth persisting per structure (drops transient UI state).
export type BundledStructure = Omit<StructureEntry, "id" | "savedAt" | "isAnalyzing" | "error">;

export type SessionBundle = {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  app: string;
  structures: BundledStructure[];
};

export function buildSessionBundle(structures: StructureEntry[]): string {
  const bundle: SessionBundle = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    app: "Protein I/O",
    structures: structures.map((s) => ({
      name: s.name,
      source: s.source,
      pdbId: s.pdbId,
      uniprotId: s.uniprotId,
      structureText: s.structureText,
      structureFormat: s.structureFormat,
      cutoff: s.cutoff,
      analysis: s.analysis,
      foldseekResult: s.foldseekResult,
    })),
  };
  return JSON.stringify(bundle);
}

export function parseSessionBundle(text: string): BundledStructure[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not a valid session file (invalid JSON).");
  }
  const b = data as Partial<SessionBundle>;
  if (!b || b.format !== FORMAT) {
    throw new Error("Not a Protein I/O session file.");
  }
  if (typeof b.version !== "number" || b.version > VERSION) {
    throw new Error(`Session was saved by a newer version (v${b.version}); update to open it.`);
  }
  if (!Array.isArray(b.structures) || b.structures.length === 0) {
    throw new Error("Session file has no structures.");
  }
  // Restore transient fields to a ready state.
  return b.structures.map((s) => ({
    name: s.name ?? "Imported structure",
    source: s.source ?? "upload",
    pdbId: s.pdbId ?? "",
    uniprotId: s.uniprotId ?? "",
    structureText: s.structureText ?? "",
    structureFormat: s.structureFormat ?? "cif",
    cutoff: s.cutoff ?? 4,
    analysis: s.analysis ?? null,
    foldseekResult: s.foldseekResult ?? null,
  }));
}

export function downloadSessionBundle(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
