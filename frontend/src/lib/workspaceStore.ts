"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AnalysisResponse } from "./types";

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

  // Actions
  addStructure: (entry: Omit<StructureEntry, "id" | "savedAt">) => string;
  updateStructure: (id: string, updates: Partial<StructureEntry>) => void;
  removeStructure: (id: string) => void;
  setActiveId: (id: string) => void;
  setCompareId: (slot: 0 | 1, id: string | null) => void;
  setContextTab: (tab: ContextTab) => void;
  setChatOpen: (open: boolean) => void;
  setMode: (mode: AppMode) => void;
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

      setActiveId: (id) => set({ activeId: id }),

      setCompareId: (slot, id) =>
        set((s) => {
          const next: [string | null, string | null] = [...s.compareIds] as [string | null, string | null];
          next[slot] = id;
          return { compareIds: next };
        }),

      setContextTab: (tab) => set({ contextTab: tab }),

      setChatOpen: (open) => set({ chatOpen: open }),

      setMode: (mode) => set({ mode }),

      getActive: () => {
        const { structures, activeId } = get();
        return structures.find((e) => e.id === activeId) ?? null;
      },
    }),
    {
      name: "pio_workspace_v1",
      // Don't persist structureText (large) or isAnalyzing state
      partialize: (s) => ({
        structures: s.structures.map((e) => ({
          ...e,
          structureText: "",       // don't bloat localStorage
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
