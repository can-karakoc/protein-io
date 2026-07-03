"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createDebouncedIdbStorage } from "./idbStorage";
import type { AnalysisResponse, BatchAnalysisResponse, BatchClusterResponse, FoldseekSearchResult, StructureComparisonResponse, ViewerSelection } from "./types";

// ── Types ────────────────────────────────────────────────────────────────────

export type StructureSource = "upload" | "rcsb" | "alphafold" | "sample";
export type StructureFormat = "pdb" | "cif";

export type StructureEntry = {
  id: string;
  name: string;
  source: StructureSource;
  pdbId: string;
  uniprotId: string;
  structureText: string;
  structureFormat: StructureFormat;
  cutoff: number;
  analysis: AnalysisResponse | null;
  foldseekResult: FoldseekSearchResult | null;
  isAnalyzing: boolean;
  error: string | null;
  savedAt: string;
};

export type ContextTab =
  | "overview"
  | "chains"
  | "sequence"
  | "ligands"
  | "pockets"
  | "contacts"
  | "interfaces"
  | "confidence"
  | "pae"
  | "quality"
  | "compare"
  | "report"
  | "methods"
  | "similar";

export type AppMode = "workspace" | "batch";

export type WorkspaceState = {
  // State
  structures: StructureEntry[];
  activeId: string | null;
  compareIds: [string | null, string | null];
  contextTab: ContextTab;
  chatOpen: boolean;
  mode: AppMode;
  selection: ViewerSelection | null;
  floatingLigandKey: string | null; // `${chain_id}:${residue_number}`
  hasHydrated: boolean; // true once persist middleware finishes reading localStorage
  comparison: StructureComparisonResponse | null;
  compareIsLoading: boolean;
  compareError: string | null;
  batchResult: BatchAnalysisResponse | null;
  batchCluster: BatchClusterResponse | null;

  // Actions
  addStructure: (entry: Omit<StructureEntry, "id" | "savedAt">) => string;
  updateStructure: (id: string, updates: Partial<StructureEntry>) => void;
  removeStructure: (id: string) => void;
  setActiveId: (id: string) => void;
  setCompareId: (slot: 0 | 1, id: string | null) => void;
  setContextTab: (tab: ContextTab) => void;
  setChatOpen: (open: boolean) => void;
  setMode: (mode: AppMode) => void;
  setSelection: (s: ViewerSelection | null) => void;
  setFloatingLigandKey: (key: string | null) => void;
  setComparison: (c: StructureComparisonResponse | null, err?: string | null) => void;
  setCompareLoading: (v: boolean) => void;
  setBatchResult: (r: BatchAnalysisResponse | null) => void;
  setBatchCluster: (c: BatchClusterResponse | null) => void;
  setHasHydrated: (v: boolean) => void;
  getActive: () => StructureEntry | null;
};

// ── Store ────────────────────────────────────────────────────────────────────

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      structures: [],
      activeId: null,
      compareIds: [null, null],
      contextTab: "overview",
      chatOpen: false,
      mode: "workspace",
      selection: null,
      floatingLigandKey: null,
      hasHydrated: false,
      comparison: null,
      compareIsLoading: false,
      compareError: null,
      batchResult: null,
      batchCluster: null,

      addStructure: (entry) => {
        const id = nanoid(10);
        const newEntry: StructureEntry = {
          ...entry,
          id,
          savedAt: new Date().toISOString(),
        };
        set((s) => ({
          structures: [...s.structures, newEntry],
          activeId: id,
          selection: null,
          floatingLigandKey: null,
        }));
        return id;
      },

      updateStructure: (id, updates) => {
        set((s) => ({
          structures: s.structures.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        }));
      },

      removeStructure: (id) => {
        set((s) => {
          const remaining = s.structures.filter((e) => e.id !== id);
          const newActive =
            s.activeId === id
              ? (remaining[remaining.length - 1]?.id ?? null)
              : s.activeId;
          const newCompare: [string | null, string | null] = [
            s.compareIds[0] === id ? null : s.compareIds[0],
            s.compareIds[1] === id ? null : s.compareIds[1],
          ];
          return { structures: remaining, activeId: newActive, compareIds: newCompare, comparison: null, compareError: null, compareIsLoading: false };
        });
      },

      setActiveId: (id) => set({ activeId: id, selection: null, floatingLigandKey: null }),

      setCompareId: (slot, id) =>
        set((s) => {
          const next: [string | null, string | null] = [...s.compareIds] as [string | null, string | null];
          next[slot] = id;
          return { compareIds: next, comparison: null, compareError: null, compareIsLoading: false };
        }),

      setContextTab: (tab) => set({ contextTab: tab }),

      setChatOpen: (open) => set({ chatOpen: open }),

      setMode: (mode) => set({ mode }),

      setSelection: (s) => set({ selection: s }),

      setFloatingLigandKey: (key) => set({ floatingLigandKey: key }),

      setComparison: (c, err = null) => set({ comparison: c, compareError: err, compareIsLoading: false }),

      setCompareLoading: (v) => set({ compareIsLoading: v, compareError: null }),

      // A new (or cleared) batch invalidates any cached fold clustering.
      setBatchResult: (r) => set({ batchResult: r, batchCluster: null }),
      setBatchCluster: (c) => set({ batchCluster: c }),

      setHasHydrated: (v) => set({ hasHydrated: v }),

      getActive: () => {
        const { structures, activeId } = get();
        return structures.find((e) => e.id === activeId) ?? null;
      },
    }),
    {
      // v2: uses IndexedDB so structureText (~200KB-2MB) and comparison results
      // can be persisted without hitting the 5 MB localStorage quota.
      name: "pio_workspace_v2",
      storage: createDebouncedIdbStorage(400),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (s) => ({
        structures: s.structures.map((e) => ({
          ...e,
          // Always reset mid-analysis flag — the analysis process does not
          // survive a page refresh, so we'd be stuck in a spinner forever.
          isAnalyzing: false,
        })),
        activeId: s.activeId,
        compareIds: s.compareIds,
        contextTab: s.contextTab,
        mode: s.mode,
        // Persist comparison result so the Compare tab is immediately ready
        // after a page refresh without re-running the API call.
        comparison: s.comparison,
        compareError: s.compareError,
        // Batch campaign results persist to IndexedDB (large; survives mode switches
        // and page refresh, unlike the old quota-limited localStorage cache).
        batchResult: s.batchResult,
        batchCluster: s.batchCluster,
      }),
    },
  ),
);
