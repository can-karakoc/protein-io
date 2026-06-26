import type { AnalysisResponse } from "@/lib/types";

const INDEX_KEY = "pio_saved_runs_v1";
const runKey = (id: string) => `pio_run_${id}_v1`;
const MAX_RUNS = 8;

export type SavedRunMeta = {
  id: string;
  name: string;
  source: "upload" | "rcsb" | "alphafold";
  savedAt: string;
  cutoff: number;
  hasStructureText: boolean;
  summary: {
    chain_count: number;
    residue_count: number;
    contact_count: number;
    ligand_count: number;
  };
  hasConfidence: boolean;
};

export type SavedRun = SavedRunMeta & {
  fileName: string;
  pdbId: string;
  uniprotId: string;
  structureText: string;
  structureFormat: "pdb" | "cif";
  analysis: AnalysisResponse;
};

// ─── Index ───────────────────────────────────────────────────────────────────

export function listSavedRuns(): SavedRunMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as SavedRunMeta[]).sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    );
  } catch {
    return [];
  }
}

function writeIndex(runs: SavedRunMeta[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(runs));
  } catch { /* ignore */ }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export function getSavedRun(id: string): SavedRun | null {
  try {
    const raw = localStorage.getItem(runKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as SavedRun;
  } catch {
    return null;
  }
}

export function saveRun(run: SavedRun): "ok" | "quota" | "no-structure-text" {
  const meta: SavedRunMeta = {
    id: run.id,
    name: run.name,
    source: run.source,
    savedAt: run.savedAt,
    cutoff: run.cutoff,
    hasStructureText: true,
    summary: {
      chain_count: run.analysis.summary.chain_count,
      residue_count: run.analysis.summary.residue_count,
      contact_count: run.analysis.summary.contact_count,
      ligand_count: run.analysis.summary.ligand_count,
    },
    hasConfidence: run.analysis.confidence != null,
  };

  // Evict oldest if at cap
  const current = listSavedRuns();
  let toWrite = current.filter((r) => r.id !== run.id);
  if (toWrite.length >= MAX_RUNS) {
    const oldest = [...toWrite].sort(
      (a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime(),
    )[0];
    deleteSavedRun(oldest.id);
    toWrite = toWrite.filter((r) => r.id !== oldest.id);
  }

  // Try storing full run (with structureText)
  try {
    localStorage.setItem(runKey(run.id), JSON.stringify(run));
    writeIndex([meta, ...toWrite]);
    return "ok";
  } catch {
    // QuotaExceededError — retry without structureText
  }

  // Retry without structureText
  try {
    const slim = { ...run, structureText: "" };
    localStorage.setItem(runKey(run.id), JSON.stringify(slim));
    writeIndex([{ ...meta, hasStructureText: false }, ...toWrite]);
    return "no-structure-text";
  } catch {
    return "quota";
  }
}

export function deleteSavedRun(id: string) {
  try { localStorage.removeItem(runKey(id)); } catch { /* ignore */ }
  const updated = listSavedRuns().filter((r) => r.id !== id);
  writeIndex(updated);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function makeRunId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function runDisplayName(run: {
  source: string;
  fileName: string;
  pdbId: string;
  uniprotId: string;
}): string {
  if (run.source === "rcsb" && run.pdbId) return run.pdbId.toUpperCase();
  if (run.source === "alphafold" && run.uniprotId) return run.uniprotId.toUpperCase();
  return run.fileName || "Untitled";
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
