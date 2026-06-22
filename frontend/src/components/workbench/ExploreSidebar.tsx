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
    <aside className="flex h-full flex-col gap-3 overflow-y-auto border-r border-[var(--pio-line)] p-4">
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
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-[var(--pio-radius-md)] border border-dashed border-[var(--pio-line-strong)] bg-[var(--pio-paper)] px-3 text-center transition-colors hover:bg-[var(--pio-sand)]">
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
              className="text-center text-[11px] text-[var(--pio-graphite)] transition-colors hover:text-[var(--pio-ink)]"
            >
              or load bundled sample →
            </button>

            {/* PAE sidecar — collapsible */}
            <button
              type="button"
              onClick={() => setPaeOpen((o) => !o)}
              className="mt-1 flex items-center justify-between rounded-[var(--pio-radius-sm)] border border-[var(--pio-line-strong)] bg-[var(--pio-paper)] px-3 py-2 text-[11px] text-[var(--pio-graphite)] transition-colors hover:bg-[var(--pio-sand)]"
            >
              <span>
                Add PAE JSON <span className="opacity-60">(optional)</span>
              </span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${paeOpen ? "rotate-180" : ""}`} />
            </button>

            {paeOpen && (
              <label className="flex cursor-pointer flex-col rounded-[var(--pio-radius-md)] border border-dashed border-[var(--pio-line-strong)] bg-[var(--pio-paper)] px-3 py-2.5 transition-colors hover:bg-[var(--pio-sand)]">
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
                className="pio-input h-9 min-w-0 flex-1 px-3 font-mono text-sm uppercase"
              />
              <button
                type="button"
                onClick={onFetchRcsb}
                disabled={isRcsbLoading || !pdbId.trim()}
                className="pio-button-primary h-9 gap-1.5 px-3 text-xs"
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
                className="pio-input h-9 min-w-0 flex-1 px-3 font-mono text-sm uppercase"
              />
              <button
                type="button"
                onClick={onFetchAlphaFold}
                disabled={isAlphaFoldLoading || !uniprotId.trim()}
                className="pio-button-primary h-9 gap-1.5 px-3 text-xs"
              >
                {isAlphaFoldLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                Fetch
              </button>
            </div>
            <p className="text-[11px] text-[var(--pio-graphite)]">Fetches predicted model from AlphaFold DB.</p>
          </div>
        )}

        {/* Distance cutoff — always visible */}
        <div className="mt-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="pio-label" htmlFor="cutoff">
              Distance cutoff
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
        <div className="pio-alert-warning p-3">
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
        <div className="pio-alert-caution p-3">
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

  const rows: Array<[string, string | number | null | undefined]> = [
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
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="pio-label">Metadata</p>
        <span
          className={`pio-badge ${metadata?.source === "alphafold" ? "pio-badge-predicted" : "pio-badge-metadata"}`}
        >
          {source}
        </span>
      </div>
      <div className="flex flex-col">
        {rows.map(([label, value]) =>
          value !== null && value !== undefined && value !== "" ? (
            <div
              key={label}
              className="flex items-center justify-between border-b border-[var(--pio-line)] py-1.5 last:border-b-0"
            >
              <span className="pio-label text-[10px]">{label}</span>
              <span className="pio-value text-xs">{value}</span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
