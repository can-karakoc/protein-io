"use client";

import { Layers3, Moon, Sun } from "lucide-react";

import { BatchWorkspace } from "@/components/workbench/BatchWorkspace";
import { StructureViewer } from "@/components/viewer/StructureViewer";
import { useTheme } from "@/hooks/useTheme";
import type { AppMode } from "@/lib/workspaceStore";
import { useWorkspace } from "@/lib/workspaceStore";

import { ChatDrawer, ChatDrawerToggle } from "./ChatDrawer";
import { ContextPanel } from "./ContextPanel";
import { StructureTray } from "./StructureTray";

// ── Top navigation ────────────────────────────────────────────────────────────

const APP_MODES: Array<{ id: AppMode; label: string }> = [
  { id: "workspace", label: "Explore" },
  { id: "batch", label: "Batch" },
];

function WorkspaceTopNav() {
  const { mode, setMode } = useWorkspace();
  const { theme, toggle } = useTheme();

  return (
    <header className="pio-topnav sticky top-0 z-50">
      <div className="mx-auto flex h-[44px] w-full max-w-[1500px] items-center px-4 sm:px-8">
        <nav className="flex h-full items-center gap-1 sm:gap-6" aria-label="App mode">
          {APP_MODES.map((m) => {
            const isActive = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={[
                  "flex h-[34px] items-center rounded-[12px] px-3 sm:px-5 text-pio-base sm:text-pio-md font-semibold transition-colors",
                  isActive
                    ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)]"
                    : "bg-[rgba(26,64,106,0.04)] text-[var(--pio-ink)] opacity-70 hover:opacity-100 hover:bg-[rgba(26,64,106,0.09)]",
                ].join(" ")}
              >
                {m.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 sm:gap-6">
          {mode === "workspace" && <ChatDrawerToggle />}
          <a
            href="https://github.com/can-karakoc/protein-io/tree/main/docs"
            target="_blank"
            rel="noreferrer"
            className="text-pio-xs sm:text-pio-md font-medium text-[var(--pio-ink)] opacity-50 transition-opacity hover:opacity-80"
          >
            Docs
          </a>
          <a
            href="https://github.com/can-karakoc/protein-io"
            target="_blank"
            rel="noreferrer"
            className="text-pio-xs sm:text-pio-md font-medium text-[var(--pio-ink)] opacity-50 transition-opacity hover:opacity-80"
          >
            GitHub
          </a>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-[var(--pio-line-strong)] bg-[var(--pio-white)] text-[var(--pio-ink)] opacity-70 transition-colors hover:opacity-100 hover:bg-[var(--pio-sand)]"
          >
            <span key={theme} className="theme-toggle-icon">
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

// ── Workspace 3-column layout ─────────────────────────────────────────────────

function WorkspaceLayout() {
  const { getActive } = useWorkspace();
  const active = getActive();

  const colorMode = active?.analysis?.confidence ? "plddt" : "structure";
  const residueConfidences = active?.analysis?.residue_confidences ?? [];

  return (
    <div className="relative flex h-full w-full overflow-hidden rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)]">
      {/* Left: structure tray */}
      <div className="w-[260px] flex-shrink-0 h-full overflow-hidden border-r border-[var(--pio-line)]">
        <StructureTray />
      </div>

      {/* Center: persistent Mol* viewer */}
      <div className="flex-1 min-w-0 h-full relative bg-[var(--pio-paper)]">
        {active?.structureText ? (
          <StructureViewer
            structureText={active.structureText}
            structureFormat={active.structureFormat}
            selection={null}
            residueConfidences={residueConfidences}
            colorMode={colorMode}
          />
        ) : (
          <ViewerPlaceholder />
        )}
      </div>

      {/* Right: context panel */}
      <div className="w-[380px] flex-shrink-0 h-full overflow-hidden border-l border-[var(--pio-line)]">
        <ContextPanel />
      </div>

      {/* Chat drawer (slide-over) */}
      <ChatDrawer />
    </div>
  );
}

function ViewerPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 opacity-30">
      <Layers3 size={40} className="text-[var(--pio-graphite)]" />
      <p className="text-pio-md text-[var(--pio-graphite)]">Load a structure to visualize</p>
    </div>
  );
}

// ── Shell entry point ─────────────────────────────────────────────────────────

export function WorkspaceShell() {
  const { mode } = useWorkspace();

  return (
    <main className="pio-shell pt-6">
      <WorkspaceTopNav />

      {/* Padded content area — same geometry as the original WorkbenchShell */}
      <div className="mx-auto w-full max-w-[1500px] px-4 pb-4 pt-6 h-[calc(100svh-92px)]">
        {mode === "workspace" ? (
          <WorkspaceLayout />
        ) : (
          <div className="h-full w-full overflow-hidden rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)]">
            <BatchWorkspace />
          </div>
        )}
      </div>
    </main>
  );
}
