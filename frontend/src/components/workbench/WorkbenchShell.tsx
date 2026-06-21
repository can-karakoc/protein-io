"use client";

import type { ReactNode } from "react";

import { TopNav, type WorkbenchMode } from "@/components/workbench/TopNav";

type WorkbenchShellProps = {
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
  onLoadSample: () => void;
  onReset: () => void;
  onExport: () => void;
  canExport: boolean;
  children: ReactNode;
};

export function WorkbenchShell({
  mode,
  onModeChange,
  onLoadSample,
  onReset,
  onExport,
  canExport,
  children,
}: WorkbenchShellProps) {
  return (
    <main className="pio-shell">
      <TopNav
        mode={mode}
        onModeChange={onModeChange}
        onLoadSample={onLoadSample}
        onReset={onReset}
        onExport={onExport}
        canExport={canExport}
      />
      <div className="pio-wrap flex min-w-0 flex-col gap-6 pt-6">
        {children}
      </div>
    </main>
  );
}
