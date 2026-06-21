"use client";

import { Atom, Download, ExternalLink, FileText, FileUp, RotateCcw } from "lucide-react";

export type WorkbenchMode = "explore" | "compare" | "report";

type TopNavProps = {
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
  onLoadSample: () => void;
  onReset: () => void;
  onExport: () => void;
  canExport: boolean;
};

const MODES: Array<{ id: WorkbenchMode; label: string }> = [
  { id: "explore", label: "Explore" },
  { id: "compare", label: "Compare" },
  { id: "report", label: "Report" },
];

export function TopNav({ mode, onModeChange, onLoadSample, onReset, onExport, canExport }: TopNavProps) {
  return (
    <header className="pio-topnav sticky top-0 z-50">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-6 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--pio-ink)]">
              <Atom className="h-5 w-5" />
              Protein I/O
            </div>
            <h1 className="max-w-3xl text-[30px] font-bold leading-tight tracking-normal text-[var(--pio-ink)] sm:text-4xl">
              Structure upload and contact analysis
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pio-graphite)]">
              Explore protein structures, contacts, ligands, and confidence in one browser workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="https://github.com/can-karakoc/protein-io/tree/main/docs"
              target="_blank"
              rel="noreferrer"
              className="pio-button-secondary min-h-10 px-4"
            >
              <FileText className="h-4 w-4" />
              Docs
            </a>
            <a
              href="https://github.com/can-karakoc/protein-io"
              target="_blank"
              rel="noreferrer"
              className="pio-button-secondary min-h-10 px-4"
            >
              <ExternalLink className="h-4 w-4" />
              GitHub
            </a>
            <button
              type="button"
              onClick={onLoadSample}
              className="pio-button-secondary min-h-10 px-4"
            >
              <FileUp className="h-4 w-4" />
              Load sample
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={!canExport}
              className="pio-button-primary min-h-10 px-4"
            >
              <Download className="h-4 w-4" />
              Export contacts CSV
            </button>
            <button
              type="button"
              onClick={onReset}
              className="pio-button-secondary min-h-10 px-4"
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
                "h-9 rounded-full border px-4 text-sm font-semibold transition-colors",
                mode === item.id
                  ? "border-[var(--pio-ink)] bg-[var(--pio-ink)] text-[var(--pio-white)]"
                  : "border-[var(--pio-line-strong)] bg-[var(--pio-white)] text-[var(--pio-ink)] hover:bg-[var(--pio-sand)]",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
