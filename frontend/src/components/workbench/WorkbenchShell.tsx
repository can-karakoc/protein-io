"use client";

import type { ReactNode } from "react";

import { TopNav, type WorkbenchMode } from "@/components/workbench/TopNav";

type WorkbenchShellProps = {
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
  onSidebarToggle?: () => void;
  children: ReactNode;
};

export function WorkbenchShell({ mode, onModeChange, onSidebarToggle, children }: WorkbenchShellProps) {
  return (
    <main className="pio-shell pt-6">
      <TopNav mode={mode} onModeChange={onModeChange} onSidebarToggle={onSidebarToggle} />
      {/* px-4 pb-4 pt-6 gives the 3-col grid space so its 16px rounded corners are visible */}
      <div className="mx-auto w-full max-w-[1500px] px-4 pb-4 pt-6 md:h-[calc(100svh-92px)]">
        {children}
      </div>
    </main>
  );
}
