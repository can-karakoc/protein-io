"use client";

import { AlertCircle, Atom, FileUp, Loader2, Play, Search } from "lucide-react";

import type { AnalysisResponse, StructureMetadata } from "@/lib/types";

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
  hasStructure: boolean;
  isLoading: boolean;
  pdbId: string;
  onPdbIdChange: (pdbId: string) => void;
  onFetchRcsb: () => void;
  isRcsbLoading: boolean;
  uniprotId: string;
  onUniprotIdChange: (uniprotId: string) => void;
  onFetchAlphaFold: () => void;
  isAlphaFoldLoading: boolean;
  comparisonFileA: File | null;
  comparisonFileB: File | null;
  onComparisonFileAChange: (file: File | null) => void;
  onComparisonFileBChange: (file: File | null) => void;
  onCompareStructures: () => void;
  isComparisonLoading: boolean;
  error: {
    title: string;
    message: string;
    nextStep: string;
  } | null;
  status: {
    label: string;
    detail: string;
  } | null;
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
  comparisonFileA,
  comparisonFileB,
  onComparisonFileAChange,
  onComparisonFileBChange,
  onCompareStructures,
  isComparisonLoading,
  error,
  status,
  warnings,
}: ExploreSidebarProps) {
  return (
    <aside className="min-w-0 flex flex-col gap-4">
      <div className="pio-panel p-4">
        <h2 className="text-lg font-semibold text-[var(--pio-ink)]">Input</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--pio-graphite)]">
          PDB and mmCIF files contain atom coordinates used for visualization and distance-based contact detection.
        </p>

        <label className="mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[var(--pio-radius-md)] border border-dashed border-[var(--pio-line-strong)] bg-[var(--pio-paper)] px-4 text-center hover:bg-[var(--pio-sand)]">
          <FileUp className="mb-2 h-5 w-5 text-[var(--pio-graphite)]" />
          <span className="text-sm font-semibold text-[var(--pio-ink)]">Choose structure file</span>
          <span className="mt-1 text-xs text-[var(--pio-graphite)]">Plain text .pdb, .cif, or .mmcif upload</span>
          <input
            type="file"
            accept=".pdb,.cif,.mmcif,chemical/x-pdb,chemical/x-mmcif,text/plain"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onStructureFile(file);
              }
            }}
          />
        </label>

        <div className="mt-4 grid gap-3">
          <label className="text-xs font-medium uppercase tracking-wide text-[var(--pio-graphite)]" htmlFor="cutoff">
            Distance cutoff
          </label>
          <div className="flex items-center gap-2">
            <input
              id="cutoff"
              type="number"
              min="1"
              max="12"
              step="0.1"
              value={cutoff}
              onChange={(event) => onCutoffChange(Number(event.target.value))}
              className="pio-input h-10 w-24 px-3 font-mono text-sm"
            />
            <span className="text-sm text-[var(--pio-graphite)]">angstroms</span>
          </div>
          <p className="text-xs leading-5 text-[var(--pio-graphite)]">
            Atom pairs within this distance are candidates for contacts.
          </p>
        </div>

        <button
          type="button"
          onClick={onAnalyze}
          disabled={!hasStructure || isLoading}
          className="pio-button-primary mt-4 h-11 w-full"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Analyze structure
        </button>

        <label className="mt-4 flex cursor-pointer flex-col rounded-[var(--pio-radius-md)] border border-dashed border-[var(--pio-line-strong)] bg-[var(--pio-paper)] px-3 py-3 hover:bg-[var(--pio-sand)]">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--pio-graphite)]">Optional PAE sidecar</span>
          <span className="mt-1 text-sm font-semibold text-[var(--pio-ink)]">Choose PAE JSON</span>
          <span className="mt-1 text-xs text-[var(--pio-graphite)]">AlphaFold predicted aligned error JSON.</span>
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onPaeFile(file);
              }
            }}
          />
        </label>

        {fileName ? (
          <p className="pio-badge pio-badge-active mt-4">Loaded: {fileName}</p>
        ) : null}

        {paeFileName ? (
          <p className="pio-badge pio-badge-active mt-3">PAE loaded: {paeFileName}</p>
        ) : null}
      </div>

      <CompactMetadataSummary
        fileName={fileName}
        structureFormat={structureFormat}
        analysis={analysis}
        metadata={metadata}
        paeFileName={paeFileName}
      />

      <div className="pio-panel p-4">
        <h2 className="pio-section-title">RCSB fetch</h2>
        <p className="pio-section-copy mt-1">
          Fetch a deposited structure by PDB ID, then analyze the returned mmCIF coordinates.
        </p>
        <label className="pio-label mt-4 block" htmlFor="pdb-id">
          PDB ID
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="pdb-id"
            type="text"
            value={pdbId}
            maxLength={4}
            onChange={(event) => onPdbIdChange(event.target.value.toUpperCase())}
            placeholder="e.g. 2HHB"
            className="pio-input h-10 min-w-0 flex-1 px-3 font-mono text-sm uppercase"
          />
          <button
            type="button"
            onClick={onFetchRcsb}
            disabled={isRcsbLoading}
            className="pio-button-primary h-10 px-4"
          >
            {isRcsbLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Fetch
          </button>
        </div>
      </div>

      <div className="pio-panel p-4">
        <h2 className="pio-section-title">AlphaFold DB fetch</h2>
        <p className="pio-section-copy mt-1">
          Fetch a predicted monomer model by UniProt accession, then analyze the returned mmCIF coordinates.
        </p>
        <label className="pio-label mt-4 block" htmlFor="uniprot-id">
          UniProt accession
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="uniprot-id"
            type="text"
            value={uniprotId}
            maxLength={10}
            onChange={(event) => onUniprotIdChange(event.target.value.toUpperCase())}
            placeholder="e.g. P69905"
            className="pio-input h-10 min-w-0 flex-1 px-3 font-mono text-sm uppercase"
          />
          <button
            type="button"
            onClick={onFetchAlphaFold}
            disabled={isAlphaFoldLoading}
            className="pio-button-primary h-10 px-4"
          >
            {isAlphaFoldLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Fetch
          </button>
        </div>
      </div>

      <div className="pio-panel p-4">
        <h2 className="pio-section-title">Structure comparison</h2>
        <p className="pio-section-copy mt-1">
          Compare parsed counts and residue-level contact sets for two structures.
        </p>
        <div className="mt-4 grid gap-3">
          <ComparisonFileInput
            label="First structure"
            fileName={comparisonFileA?.name ?? ""}
            onChange={onComparisonFileAChange}
          />
          <ComparisonFileInput
            label="Second structure"
            fileName={comparisonFileB?.name ?? ""}
            onChange={onComparisonFileBChange}
          />
          <button
            type="button"
            onClick={onCompareStructures}
            disabled={!comparisonFileA || !comparisonFileB || isComparisonLoading}
            className="pio-button-primary h-10"
          >
            {isComparisonLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Atom className="h-4 w-4" />}
            Compare structures
          </button>
        </div>
      </div>

      {status ? (
        <div className="pio-panel bg-[var(--pio-sage)] p-4 text-sm text-[var(--pio-ink)]">
          <div className="flex items-start gap-2">
            <span className="pio-loading-pulse mt-0.5 inline-flex h-4 w-4 shrink-0 rounded-full bg-[var(--pio-green)]" />
            <div>
              <p className="font-semibold">{status.label}</p>
              <p className="pio-section-copy mt-1">{status.detail}</p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="pio-alert-warning p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pio-coral-deep)]" />
            <div>
              <p className="font-semibold text-[var(--pio-coral-deep)]">{error.title}</p>
              <p className="mt-1 text-xs leading-5">{error.message}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--pio-coral-deep)]">{error.nextStep}</p>
            </div>
          </div>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="pio-alert-caution p-4 text-sm">
          <p className="font-semibold text-[var(--pio-amber-deep)]">Analysis warnings</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
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
  if (!fileName && !metadata && !analysis) {
    return null;
  }

  const source =
    metadata?.source === "rcsb"
      ? "RCSB"
      : metadata?.source === "alphafold"
        ? "AlphaFold DB"
        : fileName
          ? "Upload / sample"
          : "Unknown";
  const sourceId = metadata?.pdb_id ?? metadata?.uniprot_id ?? null;
  const method = metadata?.method ?? (metadata?.source === "alphafold" ? "Predicted model" : null);
  const resolution = metadata?.resolution_angstrom ? `${metadata.resolution_angstrom.toFixed(2)} A` : null;
  const organism = metadata?.organism ?? null;
  const meanPlddt = analysis?.confidence ? analysis.confidence.average_plddt.toFixed(2) : null;
  const rows = [
    ["Source", source],
    ["ID", sourceId],
    ["Method", method],
    ["Resolution", resolution],
    ["Organism", organism],
    ["Format", structureFormat === "cif" ? "mmCIF" : "PDB"],
    ["Chains", analysis?.summary.chain_count ?? null],
    ["Ligands", analysis?.summary.ligand_count ?? null],
    ["Mean pLDDT", meanPlddt],
    ["PAE", paeFileName ? "Provided" : analysis?.confidence ? "Not provided" : null],
  ];

  return (
    <div className="pio-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="pio-section-title">Metadata summary</h2>
        <span className={`pio-badge ${metadata?.source === "alphafold" ? "pio-badge-predicted" : "pio-badge-metadata"}`}>
          {source}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {rows.map(([label, value]) =>
          value !== null && value !== undefined && value !== "" ? (
            <div key={label} className="flex items-start justify-between gap-3 border-b border-[var(--pio-line)] pb-2 last:border-b-0 last:pb-0">
              <span className="pio-label">{label}</span>
              <span className="pio-value text-right text-sm">{value}</span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

function ComparisonFileInput({
  label,
  fileName,
  onChange,
}: {
  label: string;
  fileName: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="pio-field-card flex cursor-pointer flex-col px-3 py-3">
      <span className="pio-label">{label}</span>
      <span className="mt-1 break-words text-sm font-medium text-[var(--pio-ink)]">{fileName || "Choose .pdb, .cif, or .mmcif"}</span>
      <input
        type="file"
        accept=".pdb,.cif,.mmcif,chemical/x-pdb,chemical/x-mmcif,text/plain"
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}
