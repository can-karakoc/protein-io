"use client";

import { Layers3, Moon, Sun } from "lucide-react";
import { useState } from "react";

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
  { id: "workspace", label: "Workspace" },
  { id: "batch", label: "Batch" },
];

function WorkspaceTopNav() {
  const { mode, setMode } = useWorkspace();
  const { theme, toggle } = useTheme();

  return (
    <header className="pio-topnav sticky top-0 z-50">
      <div className="mx-auto flex h-[44px] w-full items-center px-4 gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-4">
          <Layers3 size={16} className="text-[var(--pio-highlight)]" />
          <span className="text-pio-md font-bold text-[var(--pio-ink)]">Protein I/O</span>
        </div>

        {/* Mode tabs */}
        <nav className="flex items-center gap-1" aria-label="App mode">
          {APP_MODES.map((m) => {
            const isActive = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={[
                  "flex h-[34px] items-center rounded-[12px] px-4 text-pio-base font-semibold transition-colors",
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

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          {mode === "workspace" && <ChatDrawerToggle />}

          <a
            href="https://github.com/can-karakoc/protein-io/tree/main/docs"
            target="_blank"
            rel="noreferrer"
            className="text-pio-xs font-medium text-[var(--pio-ink)] opacity-50 transition-opacity hover:opacity-80"
          >
            Docs
          </a>
          <a
            href="https://github.com/can-karakoc/protein-io"
            target="_blank"
            rel="noreferrer"
            className="text-pio-xs font-medium text-[var(--pio-ink)] opacity-50 transition-opacity hover:opacity-80"
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
    <div className="relative flex h-full overflow-hidden">
      {/* Left: structure tray */}
      <div className="w-[260px] flex-shrink-0 h-full overflow-hidden">
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
      <div className="w-[380px] flex-shrink-0 h-full overflow-hidden">
        <ContextPanel />
      </div>

      {/* Chat drawer (slide-over from right, overlays context panel on mobile) */}
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
    <div className="flex flex-col h-[100svh] bg-[var(--pio-bg)]">
      <WorkspaceTopNav />

      <main className="flex-1 min-h-0 overflow-hidden">
        {mode === "workspace" ? <WorkspaceLayout /> : <BatchWorkspace />}
      </main>
    </div>
  );
}
