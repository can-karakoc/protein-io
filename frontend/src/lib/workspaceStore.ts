"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { AnalysisResponse, StructureComparisonResponse, ViewerSelection } from "./types";

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
  isAnalyzing: boolean;
  error: string | null;
  savedAt: string;
};

export type ContextTab =
  | "overview"
  | "chains"
  | "ligands"
  | "contacts"
  | "interfaces"
  | "confidence"
  | "pae"
  | "quality"
  | "compare"
  | "report"
  | "methods";

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
          return { structures: remaining, activeId: newActive, compareIds: newCompare };
        });
      },

      setActiveId: (id) => set({ activeId: id, selection: null, floatingLigandKey: null }),

      setCompareId: (slot, id) =>
        set((s) => {
          const next: [string | null, string | null] = [...s.compareIds] as [string | null, string | null];
          next[slot] = id;
          return { compareIds: next };
        }),

      setContextTab: (tab) => set({ contextTab: tab }),

      setChatOpen: (open) => set({ chatOpen: open }),

      setMode: (mode) => set({ mode }),

      setSelection: (s) => set({ selection: s }),

      setFloatingLigandKey: (key) => set({ floatingLigandKey: key }),

      setComparison: (c, err = null) => set({ comparison: c, compareError: err, compareIsLoading: false }),

      setCompareLoading: (v) => set({ compareIsLoading: v, compareError: null }),

      getActive: () => {
        const { structures, activeId } = get();
        return structures.find((e) => e.id === activeId) ?? null;
      },
    }),
    {
      name: "pio_workspace_v1",
      onRehydrateStorage: () => (state) => {
        if (state) state.hasHydrated = true;
      },
      // Quota-safe storage — swallows QuotaExceededError silently
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          try { return localStorage.getItem(name); } catch { return null; }
        },
        setItem: (name: string, value: string) => {
          try { localStorage.setItem(name, value); } catch { /* quota exceeded */ }
        },
        removeItem: (name: string) => {
          try { localStorage.removeItem(name); } catch { /* ok */ }
        },
      })),
      // Strip structureText from ALL sources — CIF/PDB files are 200KB-2MB and
      // push the serialised store over the 5 MB localStorage quota, causing a
      // silent write failure that wipes the analysis too.
      // On reload the 3D viewer re-fetches structure text via a separate effect.
      partialize: (s) => ({
        structures: s.structures.map((e) => ({
          ...e,
          structureText: "",
          isAnalyzing: false,
          error: null,
        })),
        activeId: s.activeId,
        compareIds: s.compareIds,
        contextTab: s.contextTab,
        mode: s.mode,
      }),
    },
  ),
);
