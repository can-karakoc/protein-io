"use client";

import { Atom, FileUp, RotateCcw } from "lucide-react";

export type WorkbenchMode = "explore" | "compare" | "report";

type TopNavProps = {
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
  onLoadSample: () => void;
  onReset: () => void;
};

const MODES: Array<{ id: WorkbenchMode; label: string }> = [
  { id: "explore", label: "Explore" },
  { id: "compare", label: "Compare" },
  { id: "report", label: "Report" },
];

export function TopNav({ mode, onModeChange, onLoadSample, onReset }: TopNavProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-700">
            <Atom className="h-4 w-4" />
            Protein Interaction Explorer
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            Structure upload and contact analysis
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Upload a PDB or mmCIF file, inspect the structure, calculate residue and ligand contacts, and export the
            interaction table.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onLoadSample}
            className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            <FileUp className="h-4 w-4" />
            Load sample
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Workbench mode">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onModeChange(item.id)}
            className={[
              "h-9 border px-3 text-sm font-medium",
              mode === item.id
                ? "border-cyan-700 bg-cyan-700 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
