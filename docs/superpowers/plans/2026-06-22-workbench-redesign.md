# Workbench UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Protein I/O workbench into a clean 3-column fixed-height layout with a unified sidebar load card, minimal nav, viewer loading overlay, and a design-system gallery section below.

**Architecture:** Four files change — `TopNav` loses action buttons and the page heading; `WorkbenchShell` becomes a fixed-height 3-column grid wrapper; `ExploreSidebar` collapses four stacked panels into one unified load card with a pill source switcher; `ProteinWorkbench` rewires props, adds a viewer overlay, moves export buttons into results tab headers, and renders the gallery below the grid.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4, Lucide React icons, design tokens via CSS custom properties in `globals.css`.

---

## File Map

| File | What changes |
|---|---|
| `frontend/src/components/workbench/TopNav.tsx` | Remove heading/subtitle, remove 4 action props/buttons, keep mode tabs + 2 text links |
| `frontend/src/components/workbench/WorkbenchShell.tsx` | Remove 4 action props, change layout to fixed-height 3-col grid |
| `frontend/src/components/workbench/ExploreSidebar.tsx` | Full rewrite: unified load card with pill switcher, PAE on file tab only, Reset below Analyze |
| `frontend/src/components/workbench/ProteinWorkbench.tsx` | Rewire props, add viewer overlay, export buttons in tab headers, gallery section below |

No new files. No backend changes.

---

## Task 1: Strip TopNav to brand + modes + links

**Files:**
- Modify: `frontend/src/components/workbench/TopNav.tsx`

- [ ] **Step 1: Rewrite TopNav.tsx**

Replace the entire file with:

```tsx
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

        <nav className="flex gap-1.5 ml-4" aria-label="Workbench mode">
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
            className="flex items-center gap-1.5 text-sm text-[var(--pio-graphite)] hover:text-[var(--pio-ink)] transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Docs
          </a>
          <a
            href="https://github.com/can-karakoc/protein-io"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-[var(--pio-graphite)] hover:text-[var(--pio-ink)] transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Codex/protein-interaction-explorer
git add frontend/src/components/workbench/TopNav.tsx
git commit -m "feat: strip TopNav to brand + modes + plain links"
```

---

## Task 2: WorkbenchShell — fixed-height 3-column grid

**Files:**
- Modify: `frontend/src/components/workbench/WorkbenchShell.tsx`

The nav is 60px tall (set in Task 1). The grid below fills `calc(100svh - 60px)`. Each column scrolls independently. The gallery (rendered by ProteinWorkbench outside this shell) lives below in normal document flow so the page can scroll to it.

- [ ] **Step 1: Rewrite WorkbenchShell.tsx**

```tsx
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
    <div className="pio-shell">
      <TopNav mode={mode} onModeChange={onModeChange} />
      <div
        className="grid min-w-0 w-full max-w-[1500px] mx-auto"
        style={{
          gridTemplateColumns: "260px 1fr 340px",
          height: "calc(100svh - 60px)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/workbench/WorkbenchShell.tsx
git commit -m "feat: WorkbenchShell fixed-height 3-column grid"
```

---

## Task 3: ExploreSidebar — unified load card with pill switcher

**Files:**
- Modify: `frontend/src/components/workbench/ExploreSidebar.tsx`

The four stacked panels (Input, RCSB fetch, AlphaFold fetch, Structure comparison) collapse into one unified load card. The comparison panel is removed entirely from the Explore sidebar — it will live in Compare mode (Task 4 wires it there).

- [ ] **Step 1: Rewrite ExploreSidebar.tsx**

```tsx
"use client";

import { AlertCircle, ChevronDown, Loader2, Play, RotateCcw, Search, FileUp } from "lucide-react";
import { useState } from "react";

import type { AnalysisResponse, StructureMetadata } from "@/lib/types";

type InputTab = "file" | "pdb" | "alphafold";

type ExploreSidebarProps = {
  fileName: string;
  paeFileName: string;
  structureFormat: "pdb" | "cif";
  analysis: AnalysisResponse | null;
  metadata: StructureMetadata | null;
  cutoff: number;
  onCutoffChange: (cutoff: number) => void;
  onStructureFile: (file: File) => void;
  onPaeFile: (file: File) => void;
  onAnalyze: () => void;
  onLoadSample: () => void;
  onReset: () => void;
  hasStructure: boolean;
  isLoading: boolean;
  pdbId: string;
  onPdbIdChange: (id: string) => void;
  onFetchRcsb: () => void;
  isRcsbLoading: boolean;
  uniprotId: string;
  onUniprotIdChange: (id: string) => void;
  onFetchAlphaFold: () => void;
  isAlphaFoldLoading: boolean;
  error: { title: string; message: string; nextStep: string } | null;
  warnings: string[];
};

export function ExploreSidebar({
  fileName,
  paeFileName,
  structureFormat,
  analysis,
  metadata,
  cutoff,
  onCutoffChange,
  onStructureFile,
  onPaeFile,
  onAnalyze,
  onLoadSample,
  onReset,
  hasStructure,
  isLoading,
  pdbId,
  onPdbIdChange,
  onFetchRcsb,
  isRcsbLoading,
  uniprotId,
  onUniprotIdChange,
  onFetchAlphaFold,
  isAlphaFoldLoading,
  error,
  warnings,
}: ExploreSidebarProps) {
  const [tab, setTab] = useState<InputTab>("file");
  const [paeOpen, setPaeOpen] = useState(false);

  const tabs: Array<{ id: InputTab; label: string }> = [
    { id: "file", label: "File" },
    { id: "pdb", label: "PDB ID" },
    { id: "alphafold", label: "AlphaFold" },
  ];

  return (
    <aside className="flex flex-col gap-3 overflow-y-auto border-r border-[var(--pio-line)] p-4">
      {/* ── Load structure card ── */}
      <div className="pio-panel p-4">
        <p className="pio-label mb-3">Load structure</p>

        {/* Source pill switcher */}
        <div className="flex rounded-full bg-[var(--pio-sand)] p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors",
                tab === t.id
                  ? "bg-[var(--pio-ink)] text-[var(--pio-white)]"
                  : "text-[var(--pio-graphite)] hover:text-[var(--pio-ink)]",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* File tab */}
        {tab === "file" && (
          <div className="mt-3 flex flex-col gap-2">
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-[var(--pio-radius-md)] border border-dashed border-[var(--pio-line-strong)] bg-[var(--pio-paper)] px-3 text-center hover:bg-[var(--pio-sand)] transition-colors">
              <FileUp className="mb-1.5 h-4 w-4 text-[var(--pio-graphite)]" />
              <span className="text-xs font-semibold text-[var(--pio-ink)]">
                {fileName || "Drop .pdb / .cif / .mmcif"}
              </span>
              <span className="mt-0.5 text-[11px] text-[var(--pio-graphite)]">or click to browse</span>
              <input
                type="file"
                accept=".pdb,.cif,.mmcif,chemical/x-pdb,chemical/x-mmcif,text/plain"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onStructureFile(file);
                }}
              />
            </label>

            <button
              type="button"
              onClick={onLoadSample}
              className="text-[11px] text-[var(--pio-graphite)] hover:text-[var(--pio-ink)] transition-colors text-center"
            >
              or load bundled sample →
            </button>

            {/* PAE sidecar — collapsible */}
            <button
              type="button"
              onClick={() => setPaeOpen((o) => !o)}
              className="mt-1 flex items-center justify-between rounded-[var(--pio-radius-sm)] border border-[var(--pio-line-strong)] bg-[var(--pio-paper)] px-3 py-2 text-[11px] text-[var(--pio-graphite)] hover:bg-[var(--pio-sand)] transition-colors"
            >
              <span>Add PAE JSON <span className="opacity-60">(optional)</span></span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${paeOpen ? "rotate-180" : ""}`} />
            </button>

            {paeOpen && (
              <label className="flex cursor-pointer flex-col rounded-[var(--pio-radius-md)] border border-dashed border-[var(--pio-line-strong)] bg-[var(--pio-paper)] px-3 py-2.5 hover:bg-[var(--pio-sand)] transition-colors">
                <span className="text-xs font-semibold text-[var(--pio-ink)]">
                  {paeFileName || "Choose PAE JSON"}
                </span>
                <span className="mt-0.5 text-[11px] text-[var(--pio-graphite)]">AlphaFold predicted aligned error</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onPaeFile(file);
                  }}
                />
              </label>
            )}
          </div>
        )}

        {/* PDB ID tab */}
        {tab === "pdb" && (
          <div className="mt-3 flex flex-col gap-2">
            <label className="pio-label" htmlFor="pdb-id">PDB ID</label>
            <div className="flex gap-2">
              <input
                id="pdb-id"
                type="text"
                value={pdbId}
                maxLength={4}
                onChange={(e) => onPdbIdChange(e.target.value.toUpperCase())}
                placeholder="e.g. 2HHB"
                className="pio-input h-9 min-w-0 flex-1 px-3 font-mono text-sm uppercase"
              />
              <button
                type="button"
                onClick={onFetchRcsb}
                disabled={isRcsbLoading || !pdbId.trim()}
                className="pio-button-primary h-9 px-3"
              >
                {isRcsbLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Fetch
              </button>
            </div>
            <p className="text-[11px] text-[var(--pio-graphite)]">Fetches mmCIF from RCSB and runs analysis.</p>
          </div>
        )}

        {/* AlphaFold tab */}
        {tab === "alphafold" && (
          <div className="mt-3 flex flex-col gap-2">
            <label className="pio-label" htmlFor="uniprot-id">UniProt accession</label>
            <div className="flex gap-2">
              <input
                id="uniprot-id"
                type="text"
                value={uniprotId}
                maxLength={10}
                onChange={(e) => onUniprotIdChange(e.target.value.toUpperCase())}
                placeholder="e.g. P69905"
                className="pio-input h-9 min-w-0 flex-1 px-3 font-mono text-sm uppercase"
              />
              <button
                type="button"
                onClick={onFetchAlphaFold}
                disabled={isAlphaFoldLoading || !uniprotId.trim()}
                className="pio-button-primary h-9 px-3"
              >
                {isAlphaFoldLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Fetch
              </button>
            </div>
            <p className="text-[11px] text-[var(--pio-graphite)]">Fetches predicted model from AlphaFold DB and runs analysis.</p>
          </div>
        )}

        {/* Distance cutoff — always visible */}
        <div className="mt-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="pio-label" htmlFor="cutoff">Distance cutoff</label>
            <span className="font-mono text-xs text-[var(--pio-ink)]">{cutoff.toFixed(1)} Å</span>
          </div>
          <input
            id="cutoff"
            type="number"
            min="1"
            max="12"
            step="0.1"
            value={cutoff}
            onChange={(e) => onCutoffChange(Number(e.target.value))}
            className="pio-input h-9 w-full px-3 font-mono text-sm"
          />
        </div>

        {/* Analyze */}
        <button
          type="button"
          onClick={onAnalyze}
          disabled={!hasStructure || isLoading}
          className="pio-button-primary mt-4 h-10 w-full"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Analyze structure
        </button>

        {/* Reset — only when structure is loaded */}
        {hasStructure && (
          <button
            type="button"
            onClick={onReset}
            className="pio-button-secondary mt-2 h-8 w-full text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
      </div>

      {/* ── Metadata card — appears after analysis ── */}
      {(fileName || metadata || analysis) && (
        <CompactMetadataSummary
          fileName={fileName}
          structureFormat={structureFormat}
          analysis={analysis}
          metadata={metadata}
          paeFileName={paeFileName}
        />
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="pio-alert-warning p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pio-coral-deep)]" />
            <div>
              <p className="font-semibold text-[var(--pio-coral-deep)]">{error.title}</p>
              <p className="mt-1 text-xs leading-5">{error.message}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--pio-coral-deep)]">{error.nextStep}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Warnings banner ── */}
      {warnings.length > 0 && (
        <div className="pio-alert-caution p-3 text-sm">
          <p className="font-semibold text-[var(--pio-amber-deep)]">Analysis warnings</p>
          <ul className="mt-1.5 list-inside list-disc space-y-1">
            {warnings.map((w) => (
              <li key={w} className="text-xs">{w}</li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function CompactMetadataSummary({
  fileName,
  structureFormat,
  analysis,
  metadata,
  paeFileName,
}: {
  fileName: string;
  structureFormat: "pdb" | "cif";
  analysis: AnalysisResponse | null;
  metadata: StructureMetadata | null;
  paeFileName: string;
}) {
  const source =
    metadata?.source === "rcsb"
      ? "RCSB"
      : metadata?.source === "alphafold"
        ? "AlphaFold DB"
        : fileName
          ? "Upload"
          : "Unknown";
  const sourceId = metadata?.pdb_id ?? metadata?.uniprot_id ?? null;
  const method = metadata?.method ?? (metadata?.source === "alphafold" ? "Predicted model" : null);
  const resolution = metadata?.resolution_angstrom ? `${metadata.resolution_angstrom.toFixed(2)} Å` : null;
  const meanPlddt = analysis?.confidence ? analysis.confidence.average_plddt.toFixed(2) : null;
  const rows: Array<[string, string | number | null]> = [
    ["Source", source],
    ["ID", sourceId],
    ["Method", method],
    ["Resolution", resolution],
    ["Format", structureFormat === "cif" ? "mmCIF" : "PDB"],
    ["Chains", analysis?.summary.chain_count ?? null],
    ["Ligands", analysis?.summary.ligand_count ?? null],
    ["Mean pLDDT", meanPlddt],
    ["PAE", paeFileName ? "Provided" : null],
  ];

  return (
    <div className="pio-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="pio-label">Metadata</p>
        <span className={`pio-badge ${metadata?.source === "alphafold" ? "pio-badge-predicted" : "pio-badge-metadata"}`}>
          {source}
        </span>
      </div>
      <div className="mt-2 flex flex-col">
        {rows.map(([label, value]) =>
          value !== null && value !== undefined && value !== "" ? (
            <div key={label} className="flex items-center justify-between border-b border-[var(--pio-line)] py-1.5 last:border-b-0">
              <span className="pio-label text-[10px]">{label}</span>
              <span className="pio-value text-xs">{value}</span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/workbench/ExploreSidebar.tsx
git commit -m "feat: ExploreSidebar unified load card with pill switcher"
```

---

## Task 4: ProteinWorkbench — rewire props, viewer overlay, export in tabs, gallery

**Files:**
- Modify: `frontend/src/components/workbench/ProteinWorkbench.tsx`

This task has four sub-changes applied in sequence to the same file:
1. Update `WorkbenchShell` and `ExploreSidebar` call sites (prop changes)
2. Add viewer loading overlay
3. Move Export CSV buttons into tab headers
4. Add gallery section below workbench
5. Move comparison panel into Compare mode sidebar

### Step 1: Update WorkbenchShell call site

- [ ] Find the `<WorkbenchShell` JSX block (around line 713) and replace it:

**Old:**
```tsx
  return (
    <WorkbenchShell
      mode={mode}
      onModeChange={setMode}
      onLoadSample={loadExample}
      onReset={reset}
      onExport={exportCsv}
      canExport={contacts.length > 0}
    >
```

**New:**
```tsx
  return (
    <>
    <WorkbenchShell
      mode={mode}
      onModeChange={setMode}
    >
```

Note the opening `<>` fragment — the gallery section will be a sibling after `</WorkbenchShell>`.

### Step 2: Update ExploreSidebar call site

- [ ] Find the `<ExploreSidebar` block (around line 724) and replace the props:

**Old props on ExploreSidebar:**
```tsx
            fileName={fileName}
            paeFileName={paeFileName}
            structureFormat={structureFormat}
            analysis={analysis}
            metadata={analysis?.metadata ?? null}
            cutoff={cutoff}
            onCutoffChange={setCutoff}
            onStructureFile={(file) => void handleFile(file)}
            onPaeFile={(file) => void handlePaeFile(file)}
            onAnalyze={analyzeStructure}
            hasStructure={hasStructure}
            isLoading={isLoading}
            pdbId={pdbId}
            onPdbIdChange={setPdbId}
            onFetchRcsb={fetchRcsbStructure}
            isRcsbLoading={isRcsbLoading}
            uniprotId={uniprotId}
            onUniprotIdChange={setUniprotId}
            onFetchAlphaFold={fetchAlphaFoldStructure}
            isAlphaFoldLoading={isAlphaFoldLoading}
            comparisonFileA={comparisonFileA}
            comparisonFileB={comparisonFileB}
            onComparisonFileAChange={(file) => {
              setComparisonFileA(file);
              setComparison(null);
            }}
            onComparisonFileBChange={(file) => {
              setComparisonFileB(file);
              setComparison(null);
            }}
            onCompareStructures={compareStructures}
            isComparisonLoading={isComparisonLoading}
            error={error}
            status={status}
            warnings={analysis?.warnings ?? []}
```

**New props on ExploreSidebar:**
```tsx
            fileName={fileName}
            paeFileName={paeFileName}
            structureFormat={structureFormat}
            analysis={analysis}
            metadata={analysis?.metadata ?? null}
            cutoff={cutoff}
            onCutoffChange={setCutoff}
            onStructureFile={(file) => void handleFile(file)}
            onPaeFile={(file) => void handlePaeFile(file)}
            onAnalyze={analyzeStructure}
            onLoadSample={() => void loadExample()}
            onReset={reset}
            hasStructure={hasStructure}
            isLoading={isLoading}
            pdbId={pdbId}
            onPdbIdChange={setPdbId}
            onFetchRcsb={fetchRcsbStructure}
            isRcsbLoading={isRcsbLoading}
            uniprotId={uniprotId}
            onUniprotIdChange={setUniprotId}
            onFetchAlphaFold={fetchAlphaFoldStructure}
            isAlphaFoldLoading={isAlphaFoldLoading}
            error={error}
            warnings={analysis?.warnings ?? []}
```

### Step 3: Update the 3-column grid wrapper

- [ ] Find the `<section className="grid ... xl:grid-cols-[...]` line (around line 723) and replace just the section wrapper:

**Old:**
```tsx
        <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(420px,1fr)_minmax(380px,460px)] xl:items-start">
```

**New:**
```tsx
        <section className="grid min-w-0 h-full" style={{ gridTemplateColumns: "260px 1fr 340px" }}>
```

### Step 4: Wrap the viewer column with the loading overlay

- [ ] Find where `<StructureViewer` is rendered and wrap it in a relative container with the overlay. Add this derived value near the top of `ProteinWorkbench` (after all the `useState` calls):

```tsx
  const isAnyLoading = isLoading || isRcsbLoading || isAlphaFoldLoading;
  const viewerStatusLabel = isRcsbLoading
    ? "Fetching from RCSB…"
    : isAlphaFoldLoading
      ? "Fetching from AlphaFold…"
      : isLoading
        ? "Analyzing…"
        : null;
```

- [ ] Then wrap the `<StructureViewer` JSX in:

```tsx
          <div className="relative overflow-hidden bg-[var(--pio-sage)]">
            <StructureViewer
              structureText={structureText}
              structureFormat={structureFormat}
              selection={selection}
              colorMode={viewerColorMode}
              residueConfidences={residueConfidences}
              onSelectionClear={() => setSelection(null)}
            />
            {isAnyLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[color-mix(in_srgb,var(--pio-sage)_85%,transparent)] backdrop-blur-[2px]">
                <svg
                  viewBox="0 0 100 100"
                  className="h-14 w-14 pio-loading-pulse text-[var(--pio-green-deep)]"
                  aria-hidden="true"
                >
                  <g filter="url(#goo)">
                    <circle cx="42" cy="45" r="17" fill="currentColor" />
                    <circle cx="66" cy="30" r="10" fill="currentColor" />
                    <circle cx="64" cy="56" r="9" fill="currentColor" />
                    <circle cx="28" cy="68" r="12" fill="currentColor" />
                    <circle cx="20" cy="38" r="7" fill="currentColor" />
                  </g>
                </svg>
                {viewerStatusLabel && (
                  <p className="mt-3 font-mono text-xs text-[var(--pio-green-deep)]">{viewerStatusLabel}</p>
                )}
              </div>
            )}
          </div>
```

Note: The `goo` SVG filter is defined in the design system reference. Add it once as a hidden SVG at the top of the viewer wrapper (or in `layout.tsx`). Check if it already exists in the component tree — it does in the design system HTML. Since it's not currently in the Next.js app, add a hidden SVG defs block inside `ProteinWorkbench`'s return, before the `<WorkbenchShell>`:

```tsx
  return (
    <>
      <svg className="absolute w-0 h-0 overflow-hidden" aria-hidden="true">
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      <WorkbenchShell ...>
```

### Step 5: Make viewer column fill height

- [ ] The viewer `<div className="relative overflow-hidden ...">` needs `h-full` so it fills the grid row. Add `h-full` to the wrapper div class.

### Step 6: Make sidebar and results columns scroll

- [ ] The `<ExploreSidebar` already has `overflow-y-auto` (added in Task 3). Verify the results panel wrapper has it too. Find the right-column results div (the one containing the tabs) and ensure it has `className="overflow-y-auto"` on its outer container. Look for something like `<div className="min-w-0 flex flex-col gap-4">` wrapping the results tabs and add `overflow-y-auto h-full` to it.

### Step 7: Move Export CSV into Contacts tab header

- [ ] Find the Contacts tab render section. Look for where `resultsTab === "contacts"` content is rendered. Find the heading/toolbar that introduces the contacts table. Add the export button there:

```tsx
// In the Contacts tab content, find or add a header row:
<div className="flex items-center justify-between mb-3">
  <p className="pio-label">Contacts</p>
  {contacts.length > 0 && (
    <button
      type="button"
      onClick={exportCsv}
      className="pio-button-secondary h-8 px-3 text-xs"
    >
      <Download className="h-3.5 w-3.5" />
      Export CSV
    </button>
  )}
</div>
```

### Step 8: Move Export Ligand CSV into Ligands tab header

- [ ] Similarly, in the Ligands tab content, add:

```tsx
<div className="flex items-center justify-between mb-3">
  <p className="pio-label">Ligands</p>
  {(analysis?.ligand_interactions?.length ?? 0) > 0 && (
    <button
      type="button"
      onClick={exportLigandCsv}
      className="pio-button-secondary h-8 px-3 text-xs"
    >
      <Download className="h-3.5 w-3.5" />
      Export CSV
    </button>
  )}
</div>
```

### Step 9: Update Compare mode to include comparison panel

- [ ] Find the `mode === "compare"` render branch and ensure it renders a layout that includes the comparison file inputs and button. Replace whatever placeholder is currently there with:

```tsx
      {mode === "compare" && (
        <section className="grid min-w-0 h-full" style={{ gridTemplateColumns: "260px 1fr 340px" }}>
          {/* Compare sidebar */}
          <aside className="flex flex-col gap-3 overflow-y-auto border-r border-[var(--pio-line)] p-4">
            <div className="pio-panel p-4">
              <p className="pio-label mb-3">Compare structures</p>
              <p className="pio-section-copy mb-4">Compare parsed counts and residue-level contact sets for two structures.</p>
              <div className="flex flex-col gap-3">
                <ComparisonFileInput
                  label="Structure A"
                  fileName={comparisonFileA?.name ?? ""}
                  onChange={(file) => { setComparisonFileA(file); setComparison(null); }}
                />
                <ComparisonFileInput
                  label="Structure B"
                  fileName={comparisonFileB?.name ?? ""}
                  onChange={(file) => { setComparisonFileB(file); setComparison(null); }}
                />
                <button
                  type="button"
                  onClick={compareStructures}
                  disabled={!comparisonFileA || !comparisonFileB || isComparisonLoading}
                  className="pio-button-primary h-10 w-full"
                >
                  {isComparisonLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Atom className="h-4 w-4" />}
                  Compare structures
                </button>
              </div>
              {error && (
                <div className="pio-alert-warning mt-3 p-3 text-sm">
                  <p className="font-semibold text-[var(--pio-coral-deep)]">{error.title}</p>
                  <p className="mt-1 text-xs">{error.message}</p>
                </div>
              )}
            </div>
          </aside>
          {/* Center + right: comparison results (existing ComparePanel) */}
          <div className="col-span-2 overflow-y-auto p-4">
            {comparison ? (
              <ComparePanel comparison={comparison} cutoff={cutoff} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-[var(--pio-graphite)]">Load two structures and run Compare to see results.</p>
              </div>
            )}
          </div>
        </section>
      )}
```

Note: `ComparisonFileInput` is a component already defined at the bottom of `ProteinWorkbench.tsx` — keep it there. `ComparePanel` is the existing component that renders comparison results.

### Step 10: Add gallery section below WorkbenchShell

- [ ] Close the `</WorkbenchShell>` tag and add the gallery section, then close the Fragment. The gallery re-uses the existing `EXAMPLE_GALLERY` data array and `loadGalleryExample` function:

```tsx
    </WorkbenchShell>

    {/* ── Example gallery ── */}
    <section className="mx-auto w-full max-w-[1500px] px-6 py-12">
      <p className="pio-label mb-1">Example gallery</p>
      <p className="pio-section-copy mb-6">Guided structures for quickly testing common workflows.</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {EXAMPLE_GALLERY.map((card) => (
          <div key={card.id} className="flex flex-col rounded-[var(--pio-radius-lg)] bg-[var(--pio-sand)] p-3">
            {/* Inner panel */}
            <div className="mb-3 flex h-24 items-center justify-center rounded-[var(--pio-radius-md)] bg-[var(--pio-sage)]">
              <svg viewBox="0 0 100 100" className="h-10 w-10 text-[var(--pio-green-deep)]" aria-hidden="true">
                <g filter="url(#goo)">
                  <circle cx="42" cy="45" r="17" fill="currentColor" opacity="0.7" />
                  <circle cx="66" cy="30" r="10" fill="currentColor" opacity="0.7" />
                  <circle cx="64" cy="56" r="9" fill="currentColor" opacity="0.7" />
                  <circle cx="28" cy="68" r="12" fill="currentColor" opacity="0.7" />
                </g>
              </svg>
            </div>
            <p className="text-sm font-bold leading-tight text-[var(--pio-ink)]">{card.title}</p>
            <p className="pio-value mt-0.5 text-[11px]">{card.source}</p>
            <p className="pio-section-copy mt-1.5 text-[11px] leading-snug">{card.description}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {card.tags.map((tag) => (
                <span key={tag} className="pio-badge pio-badge-neutral py-0.5 px-2 text-[10px]">{tag}</span>
              ))}
            </div>
            <p className="mt-2 text-[11px] italic text-[var(--pio-graphite)]">{card.hint}</p>
            <button
              type="button"
              onClick={() => loadGalleryExample(card.id)}
              className="pio-button-secondary mt-3 h-8 w-full text-xs"
            >
              {card.actionLabel}
            </button>
          </div>
        ))}
      </div>
    </section>
    </>
  );
```

- [ ] **Step 11: Remove unused imports** — `RotateCcw`, `FileUp`, `FileText`, `ExternalLink` are no longer needed in `ProteinWorkbench.tsx` since they moved to the sidebar/nav. Scan the import line and remove any that are no longer referenced.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/components/workbench/ProteinWorkbench.tsx
git commit -m "feat: rewire workbench - viewer overlay, export in tabs, gallery below, compare mode sidebar"
```

---

## Task 5: Results panel empty state

**Files:**
- Modify: `frontend/src/components/workbench/ProteinWorkbench.tsx`

- [ ] **Step 1: Update results empty state**

Find where the empty results panel is rendered (when no analysis, inside the right-column). Replace whatever gallery or placeholder is there with a minimal prompt:

```tsx
{/* Inside the right-column results div, when !analysis: */}
<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
  <p className="text-sm font-semibold text-[var(--pio-ink)]">Load a structure to begin</p>
  <p className="text-xs text-[var(--pio-graphite)] max-w-[200px] leading-relaxed">
    Upload a file, fetch by PDB ID, or pick from the gallery below.
  </p>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/workbench/ProteinWorkbench.tsx
git commit -m "feat: results panel empty state - minimal prompt, gallery moved below"
```

---

## Task 6: Dev server verification

- [ ] **Step 1: Start dev server**

```bash
cd ~/Codex/protein-interaction-explorer/frontend
npm run dev
```

Open http://localhost:3000 and verify:

- [ ] Nav is slim (60px), no heading, no action buttons, just logo + mode pills + Docs/GitHub links
- [ ] 3-column grid fills the viewport exactly — sidebar 260px, viewer flex-1, results 340px
- [ ] Sidebar shows pill switcher: File / PDB ID / AlphaFold
- [ ] File tab: drop zone + "or load bundled sample →" link + collapsible PAE toggle
- [ ] PDB ID tab: text field + Fetch button
- [ ] AlphaFold tab: text field + Fetch button
- [ ] Cutoff input visible below pills in all tabs
- [ ] Analyze button disabled when no structure loaded
- [ ] Reset button absent until a structure is loaded
- [ ] Viewer shows sage background in empty state
- [ ] Gallery visible below when scrolling down — 6 cards in a row, design-system styling
- [ ] Load 2HHB: viewer overlay appears (blob + "Fetching from RCSB…" label), dismissed on analysis complete
- [ ] After analysis: Contacts tab header shows Export CSV button
- [ ] After analysis: Ligands tab header shows Export CSV button (if ligands present)
- [ ] Compare mode: sidebar shows Structure A / B file inputs + Compare button
- [ ] Report tab: unchanged

- [ ] **Step 2: Push and deploy**

```bash
cd ~/Codex/protein-interaction-explorer
git push origin main
vercel --prod
```
