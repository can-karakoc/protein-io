"use client";

import { AlertCircle, ChevronDown, FileUp, Loader2, Play, RotateCcw, Search } from "lucide-react";
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
    <aside className="relative z-[1] flex h-full flex-col bg-[var(--pio-white)] py-5 shadow-[8px_0_24px_rgba(17,22,16,0.07)]">
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin-panel px-6 pb-6">
      {/* ── Load Structure ── */}
      <div>
        <p className="mb-3 text-[20px] font-bold text-[var(--pio-ink)]">Load Structure</p>

        {/* Source tab switcher */}
        <div className="flex gap-1 rounded-[12px] border border-[var(--pio-line)] bg-[var(--pio-paper)] p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "flex-1 rounded-[8px] py-[5px] text-[12.5px] font-semibold transition-colors",
                tab === t.id
                  ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)]"
                  : "text-[var(--pio-blue-deep)] opacity-60 hover:opacity-100",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* File tab */}
        {tab === "file" && (
          <div className="mt-3 flex flex-col gap-2">
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed border-[var(--pio-line-strong)] bg-[var(--pio-paper)] px-3 text-center transition-colors hover:bg-[var(--pio-sand)]">
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
              className="text-center text-[11px] text-[var(--pio-graphite)] transition-colors hover:text-[var(--pio-ink)] hover:underline"
            >
              or load bundled sample →
            </button>

            {/* PAE sidecar — collapsible */}
            <button
              type="button"
              onClick={() => setPaeOpen((o) => !o)}
              className="mt-1 flex items-center justify-between rounded-[12px] border border-[var(--pio-line)] bg-[var(--pio-paper)] px-3 py-2 text-[11px] text-[var(--pio-graphite)] transition-colors hover:bg-[var(--pio-sand)]"
            >
              <span>
                Add PAE JSON <span className="opacity-60">(optional)</span>
              </span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${paeOpen ? "rotate-180" : ""}`} />
            </button>

            {paeOpen && (
              <label className="flex cursor-pointer flex-col rounded-[12px] border border-dashed border-[var(--pio-line-strong)] bg-[var(--pio-paper)] px-3 py-2.5 transition-colors hover:bg-[var(--pio-sand)]">
                <span className="text-xs font-semibold text-[var(--pio-ink)]">
                  {paeFileName || "Choose PAE JSON"}
                </span>
                <span className="mt-0.5 text-[11px] text-[var(--pio-graphite)]">
                  AlphaFold predicted aligned error
                </span>
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
            <label className="pio-label" htmlFor="pdb-id">
              PDB ID
            </label>
            <div className="flex gap-2">
              <input
                id="pdb-id"
                type="text"
                value={pdbId}
                maxLength={4}
                onChange={(e) => onPdbIdChange(e.target.value.toUpperCase())}
                placeholder="e.g. 2HHB"
                className="pio-input h-9 min-w-0 flex-1 bg-[var(--pio-paper)] px-3 font-mono text-sm uppercase"
              />
              <button
                type="button"
                onClick={onFetchRcsb}
                disabled={isRcsbLoading || !pdbId.trim()}
                className="flex items-center gap-1.5 rounded-full bg-[var(--pio-line)] px-[18px] py-2 text-[13px] font-semibold text-[var(--pio-ink)] transition-colors hover:bg-[var(--pio-line-strong)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isRcsbLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Fetch
              </button>
            </div>
            <p className="mt-1 text-[12px] text-[var(--pio-graphite)]">Fetches mmCIF from RCSB.</p>
          </div>
        )}

        {/* AlphaFold tab */}
        {tab === "alphafold" && (
          <div className="mt-3 flex flex-col gap-2">
            <label className="pio-label" htmlFor="uniprot-id">
              UniProt accession
            </label>
            <div className="flex gap-2">
              <input
                id="uniprot-id"
                type="text"
                value={uniprotId}
                maxLength={10}
                onChange={(e) => onUniprotIdChange(e.target.value.toUpperCase())}
                placeholder="e.g. P69905"
                className="pio-input h-9 min-w-0 flex-1 bg-[var(--pio-paper)] px-3 font-mono text-sm uppercase"
              />
              <button
                type="button"
                onClick={onFetchAlphaFold}
                disabled={isAlphaFoldLoading || !uniprotId.trim()}
                className="flex items-center gap-1.5 rounded-full bg-[var(--pio-line)] px-[18px] py-2 text-[13px] font-semibold text-[var(--pio-ink)] transition-colors hover:bg-[var(--pio-line-strong)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isAlphaFoldLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                Fetch
              </button>
            </div>
            <p className="mt-1 text-[12px] text-[var(--pio-graphite)]">Fetches predicted model from AlphaFold DB.</p>
          </div>
        )}

        {/* Analysis Controls section */}
        <div className="mt-4 border-t border-[var(--pio-line)] pt-4">
          <p className="mb-3 text-[20px] font-bold text-[var(--pio-ink)]">Analysis Controls</p>

          {/* Distance cutoff */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="pio-label" htmlFor="cutoff">
                Distance Cutoff
              </label>
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
              className="pio-input h-9 w-full bg-[var(--pio-paper)] px-3 font-mono text-sm"
            />
          </div>

        </div>

        {/* Analyze + Reset */}
        <div className={`mt-4 flex gap-2 ${hasStructure ? "" : ""}`}>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!hasStructure || isLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-[12px] bg-[var(--pio-highlight)] py-[10px] text-[13px] font-semibold text-[var(--pio-highlight-text)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Analyze
          </button>
          {hasStructure && (
            <button
              type="button"
              onClick={onReset}
              className="flex flex-1 items-center justify-center gap-2 rounded-[12px] border border-[var(--pio-highlight)] bg-[var(--pio-white)] py-[10px] text-[13px] font-semibold text-[var(--pio-ink)] transition-colors hover:bg-[var(--pio-sand)]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Metadata — appears after analysis ── */}
      {(fileName || metadata || analysis) && (
        <div className="mt-4 border-t border-[var(--pio-line)] pt-4">
          <CompactMetadataSummary
            fileName={fileName}
            structureFormat={structureFormat}
            analysis={analysis}
            metadata={metadata}
            paeFileName={paeFileName}
          />
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="mt-4 rounded-[var(--pio-radius-md)] bg-[var(--pio-coral-pale)] p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pio-coral-deep)]" />
            <div>
              <p className="text-xs font-semibold text-[var(--pio-coral-deep)]">{error.title}</p>
              <p className="mt-1 text-[11px] leading-5">{error.message}</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--pio-coral-deep)]">{error.nextStep}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Warnings banner ── */}
      {warnings.length > 0 && (
        <div className="mt-4 rounded-[var(--pio-radius-md)] bg-[var(--pio-amber-pale)] p-3">
          <p className="text-xs font-semibold text-[var(--pio-amber-deep)]">Analysis warnings</p>
          <ul className="mt-1.5 list-inside list-disc space-y-1">
            {warnings.map((w) => (
              <li key={w} className="text-[11px]">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
    </aside>
  );
}

function toTitleCaseSidebar(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function CompactMetadataSummary({
  fileName,
  structureFormat,
  analysis,
  metadata,
}: {
  fileName: string;
  structureFormat: "pdb" | "cif";
  analysis: AnalysisResponse | null;
  metadata: StructureMetadata | null;
  paeFileName: string;
}) {
  const isAlphaFold = metadata?.source === "alphafold";
  const badgeLabel = isAlphaFold ? "AlphaFold" : metadata?.source === "rcsb" ? "RCSB" : fileName ? "Upload" : null;

  const sourceLabel = isAlphaFold ? "AlphaFold" : "PDB";
  const idValue = metadata?.pdb_id ?? metadata?.uniprot_id ?? null;
  const rawMethod = isAlphaFold ? "Predicted model" : (metadata?.method ?? null);
  const method = rawMethod ? toTitleCaseSidebar(rawMethod) : null;
  const resolution =
    metadata?.resolution_angstrom != null
      ? `${parseFloat(String(metadata.resolution_angstrom)).toFixed(2)} Å`
      : "N/A";
  const formatValue = structureFormat === "cif" ? "mmCIF" : "PDB";
  const ligandCount = analysis?.summary.ligand_count ?? null;

  type Row = { label: string; value: string | number | null; mono?: boolean; dimmed?: boolean };
  const rows: Row[] = [
    { label: "SOURCE", value: sourceLabel },
    { label: "ID", value: idValue, mono: true },
    { label: "METHOD", value: method },
    { label: "RESOLUTION", value: resolution, mono: true, dimmed: metadata?.resolution_angstrom == null },
    { label: "FORMAT", value: formatValue, mono: true },
    { label: "LIGANDS", value: ligandCount, mono: true },
  ].filter((r) => r.value !== null && r.value !== undefined && r.value !== "");

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[20px] font-bold text-[var(--pio-ink)]">Metadata</p>
        {badgeLabel && (
          <span className="rounded-full bg-[var(--pio-blue-pale)] px-[9px] py-[3px] font-mono text-[11px] font-medium text-[var(--pio-blue-deep)]">
            {badgeLabel}
          </span>
        )}
      </div>
      <div className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between py-[5px]"
          >
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">{row.label}</span>
            {row.mono ? (
              <span className={`font-mono text-[12px] font-medium ${row.dimmed ? "text-[var(--pio-graphite)]" : "text-[var(--pio-ink)]"}`}>
                {row.value}
              </span>
            ) : (
              <span className="text-[13px] font-medium text-[var(--pio-ink)]">{row.value}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
