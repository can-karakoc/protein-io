"use client";

import type { ReactNode } from "react";

import { TopNav, type WorkbenchMode } from "@/components/workbench/TopNav";

type WorkbenchShellProps = {
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
  children: ReactNode;
};

export function WorkbenchShell({ mode, onModeChange, children }: WorkbenchShellProps) {
  return (
    <main className="pio-shell">
      <TopNav mode={mode} onModeChange={onModeChange} />
      <div
        className="mx-auto w-full max-w-[1500px]"
        style={{ height: "calc(100svh - 60px)", overflow: "hidden" }}
      >
        {children}
      </div>
    </main>
  );
}
