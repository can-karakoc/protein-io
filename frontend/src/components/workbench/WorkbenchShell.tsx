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
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <div className="mx-auto flex min-w-0 w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <TopNav
          mode={mode}
          onModeChange={onModeChange}
          onLoadSample={onLoadSample}
          onReset={onReset}
          onExport={onExport}
          canExport={canExport}
        />
        {children}
      </div>
    </main>
  );
}
