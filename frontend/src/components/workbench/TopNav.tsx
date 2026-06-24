"use client";

import { Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

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
  const { theme, toggle } = useTheme();
  return (
    <header className="pio-topnav sticky top-0 z-50">
      <div className="mx-auto flex h-[44px] w-full max-w-[1500px] items-center px-4 sm:px-8">
        {/* Nav — all items share one gap so spacing is governed by a single source */}
        <nav className="flex h-full items-center gap-1 sm:gap-6" aria-label="Workbench mode">
          {onSidebarToggle && (
            <button
              type="button"
              onClick={onSidebarToggle}
              className="flex h-[34px] px-3 sm:px-5 items-center justify-center rounded-[12px] text-[var(--pio-ink)] opacity-60 hover:opacity-100 hover:bg-[rgba(26,64,106,0.07)] transition-colors lg:hidden"
              aria-label="Toggle sidebar"
            >
              <Menu size={17} />
            </button>
          )}

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
                    : "bg-[rgba(26,64,106,0.04)] text-[var(--pio-ink)] opacity-70 hover:opacity-100 hover:bg-[rgba(26,64,106,0.09)]",
                ].join(" ")}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right links + theme toggle */}
        <div className="ml-auto flex items-center gap-3 sm:gap-6">
          <a
            href="https://github.com/can-karakoc/protein-io/tree/main/docs"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] sm:text-[13.5px] font-medium text-[var(--pio-ink)] opacity-50 transition-opacity hover:opacity-80"
          >
            Docs
          </a>
          <a
            href="https://github.com/can-karakoc/protein-io"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] sm:text-[13.5px] font-medium text-[var(--pio-ink)] opacity-50 transition-opacity hover:opacity-80"
          >
            GitHub
          </a>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-[var(--pio-line-strong)] bg-[var(--pio-white)] text-[var(--pio-ink)] opacity-70 transition-colors hover:opacity-100 hover:bg-[var(--pio-sand)]"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>
    </header>
  );
}
