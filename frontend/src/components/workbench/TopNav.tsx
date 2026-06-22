"use client";

import { Atom, ExternalLink, FileText } from "lucide-react";

export type WorkbenchMode = "explore" | "compare" | "report";

type TopNavProps = {
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
};

const MODES: Array<{ id: WorkbenchMode; label: string }> = [
  { id: "explore", label: "Explore" },
  { id: "compare", label: "Compare" },
  { id: "report", label: "Report" },
];

export function TopNav({ mode, onModeChange }: TopNavProps) {
  return (
    <header className="pio-topnav sticky top-0 z-50">
      <div className="mx-auto flex h-[60px] w-full max-w-[1500px] items-center gap-4 px-6">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--pio-ink)]">
          <Atom className="h-5 w-5 shrink-0" />
          <span>Protein I/O</span>
        </div>

        <nav className="ml-4 flex gap-1.5" aria-label="Workbench mode">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onModeChange(item.id)}
              className={[
                "h-8 rounded-full border px-4 text-sm font-semibold transition-colors",
                mode === item.id
                  ? "border-[var(--pio-ink)] bg-[var(--pio-ink)] text-[var(--pio-white)]"
                  : "border-[var(--pio-line-strong)] bg-[var(--pio-white)] text-[var(--pio-ink)] hover:bg-[var(--pio-sand)]",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-5">
          <a
            href="https://github.com/can-karakoc/protein-io/tree/main/docs"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-[var(--pio-graphite)] transition-colors hover:text-[var(--pio-ink)]"
          >
            <FileText className="h-3.5 w-3.5" />
            Docs
          </a>
          <a
            href="https://github.com/can-karakoc/protein-io"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-[var(--pio-graphite)] transition-colors hover:text-[var(--pio-ink)]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}
