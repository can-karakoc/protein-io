"use client";

import { Menu } from "lucide-react";

export type WorkbenchMode = "explore" | "compare" | "report";

type TopNavProps = {
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
  onSidebarToggle?: () => void;
};

const MODES: Array<{ id: WorkbenchMode; label: string }> = [
  { id: "explore", label: "Explore" },
  { id: "compare", label: "Compare" },
  { id: "report", label: "Report" },
];

export function TopNav({ mode, onModeChange, onSidebarToggle }: TopNavProps) {
  return (
    <header className="pio-topnav sticky top-0 z-50">
      <div className="mx-auto flex h-[44px] w-full max-w-[1500px] items-center gap-0 px-4 sm:px-8">
        {/* Sidebar toggle — only visible below lg */}
        {onSidebarToggle && (
          <button
            type="button"
            onClick={onSidebarToggle}
            className="mr-2 flex h-8 w-8 items-center justify-center rounded-[10px] text-[var(--pio-ink)] opacity-60 hover:opacity-100 hover:bg-[rgba(26,64,106,0.07)] transition-colors lg:hidden"
            aria-label="Toggle sidebar"
          >
            <Menu size={17} />
          </button>
        )}

        {/* Mode nav */}
        <nav className="flex h-full items-center gap-1 sm:gap-6" aria-label="Workbench mode">
          {MODES.map((item) => {
            const isActive = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onModeChange(item.id)}
                className={[
                  "flex h-[34px] items-center rounded-[12px] px-3 sm:px-5 text-[13px] sm:text-[13.5px] font-semibold transition-colors",
                  isActive
                    ? "bg-[#1A406A] text-white"
                    : "text-[var(--pio-ink)] opacity-70 hover:opacity-100 hover:bg-[rgba(26,64,106,0.07)]",
                ].join(" ")}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right links — hidden on small screens */}
        <div className="ml-auto hidden sm:flex items-center gap-6">
          <a
            href="https://github.com/can-karakoc/protein-io/tree/main/docs"
            target="_blank"
            rel="noreferrer"
            className="text-[13.5px] font-medium text-[var(--pio-ink)] opacity-50 transition-opacity hover:opacity-80"
          >
            Docs
          </a>
          <a
            href="https://github.com/can-karakoc/protein-io"
            target="_blank"
            rel="noreferrer"
            className="text-[13.5px] font-medium text-[var(--pio-ink)] opacity-50 transition-opacity hover:opacity-80"
          >
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}
