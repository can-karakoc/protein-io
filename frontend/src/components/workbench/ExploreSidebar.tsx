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
  error: string | null;
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
  warnings,
}: ExploreSidebarProps) {
  return (
    <aside className="min-w-0 flex flex-col gap-4">
      <div className="border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Input</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          PDB and mmCIF files contain atom coordinates used for visualization and distance-based contact detection.
        </p>

        <label className="mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-4 text-center hover:bg-slate-100">
          <FileUp className="mb-2 h-5 w-5 text-slate-500" />
          <span className="text-sm font-medium text-slate-800">Choose structure file</span>
          <span className="mt-1 text-xs text-slate-500">Plain text .pdb, .cif, or .mmcif upload</span>
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
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="cutoff">
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
              className="h-10 w-24 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600"
            />
            <span className="text-sm text-slate-600">angstroms</span>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Atom pairs within this distance are candidates for contacts.
          </p>
        </div>

        <button
          type="button"
          onClick={onAnalyze}
          disabled={!hasStructure || isLoading}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 bg-cyan-700 px-4 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Analyze structure
        </button>

        <label className="mt-4 flex cursor-pointer flex-col border border-dashed border-slate-300 bg-slate-50 px-3 py-3 hover:bg-slate-100">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Optional PAE sidecar</span>
          <span className="mt-1 text-sm font-medium text-slate-800">Choose PAE JSON</span>
          <span className="mt-1 text-xs text-slate-500">AlphaFold predicted aligned error JSON.</span>
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
          <div className="mt-4 border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Loaded file</p>
            <p className="mt-1 break-words font-mono text-sm text-slate-800">{fileName}</p>
          </div>
        ) : null}

        {paeFileName ? (
          <div className="mt-3 border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Loaded PAE sidecar</p>
            <p className="mt-1 break-words font-mono text-sm text-slate-800">{paeFileName}</p>
          </div>
        ) : null}
      </div>

      <CompactMetadataSummary
        fileName={fileName}
        structureFormat={structureFormat}
        analysis={analysis}
        metadata={metadata}
        paeFileName={paeFileName}
      />

      <div className="border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">RCSB fetch</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Fetch a deposited structure by PDB ID, then analyze the returned mmCIF coordinates.
        </p>
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="pdb-id">
          PDB ID
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="pdb-id"
            type="text"
            value={pdbId}
            maxLength={4}
            onChange={(event) => onPdbIdChange(event.target.value.toUpperCase())}
            placeholder="1ABC"
            className="h-10 min-w-0 flex-1 border border-slate-300 bg-white px-3 font-mono text-sm uppercase outline-none focus:border-cyan-600"
          />
          <button
            type="button"
            onClick={onFetchRcsb}
            disabled={isRcsbLoading}
            className="inline-flex h-10 items-center justify-center gap-2 bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isRcsbLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Fetch
          </button>
        </div>
      </div>

      <div className="border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">AlphaFold DB fetch</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Fetch a predicted monomer model by UniProt accession, then analyze the returned mmCIF coordinates.
        </p>
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="uniprot-id">
          UniProt accession
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="uniprot-id"
            type="text"
            value={uniprotId}
            maxLength={10}
            onChange={(event) => onUniprotIdChange(event.target.value.toUpperCase())}
            placeholder="P69905"
            className="h-10 min-w-0 flex-1 border border-slate-300 bg-white px-3 font-mono text-sm uppercase outline-none focus:border-cyan-600"
          />
          <button
            type="button"
            onClick={onFetchAlphaFold}
            disabled={isAlphaFoldLoading}
            className="inline-flex h-10 items-center justify-center gap-2 bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isAlphaFoldLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Fetch
          </button>
        </div>
      </div>

      <div className="border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Structure comparison</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
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
            className="inline-flex h-10 items-center justify-center gap-2 bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isComparisonLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Atom className="h-4 w-4" />}
            Compare structures
          </button>
        </div>
      </div>

      {error ? (
        <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Analysis warnings</p>
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
    <div className="border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-950">Metadata summary</h2>
      <div className="mt-3 grid gap-2">
        {rows.map(([label, value]) =>
          value !== null && value !== undefined && value !== "" ? (
            <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
              <span className="text-right text-sm text-slate-800">{value}</span>
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
    <label className="flex cursor-pointer flex-col border border-dashed border-slate-300 bg-slate-50 px-3 py-3 hover:bg-slate-100">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="mt-1 break-words text-sm font-medium text-slate-800">{fileName || "Choose .pdb, .cif, or .mmcif"}</span>
      <input
        type="file"
        accept=".pdb,.cif,.mmcif,chemical/x-pdb,chemical/x-mmcif,text/plain"
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}
