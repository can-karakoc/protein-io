"use client";

import { AlertCircle, Atom, Download, FileUp, Loader2, Play, RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { StructureViewer } from "@/components/structure-viewer";
import { buildApiUrl } from "@/lib/api";
import { contactsToCsv } from "@/lib/csv";
import type {
  AlphaFoldAnalysisResponse,
  AnalysisResponse,
  ChainSummary,
  ContactCategory,
  ContactRecord,
  ConfidenceSummary,
  InteractionSummary,
  LigandSummary,
  ResidueConfidence,
  RcsbAnalysisResponse,
  StructureMetadata,
  ViewerSelection,
} from "@/lib/types";

const EXAMPLE_FILE = "/sample.pdb";
const TIMING_HEADER = "X-ProteinIO-Timing";
const EMPTY_RESIDUE_CONFIDENCES: ResidueConfidence[] = [];
type StructureFileFormat = "pdb" | "cif";
type ViewerColorMode = "structure" | "plddt";
type ContactFilter = "all" | ContactCategory;

export function ProteinWorkbench() {
  const [fileName, setFileName] = useState<string>("");
  const [structureText, setStructureText] = useState("");
  const [structureFormat, setStructureFormat] = useState<StructureFileFormat>("pdb");
  const [pdbId, setPdbId] = useState("");
  const [uniprotId, setUniprotId] = useState("");
  const [cutoff, setCutoff] = useState(4.0);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [selection, setSelection] = useState<ViewerSelection | null>(null);
  const [viewerColorMode, setViewerColorMode] = useState<ViewerColorMode>("structure");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRcsbLoading, setIsRcsbLoading] = useState(false);
  const [isAlphaFoldLoading, setIsAlphaFoldLoading] = useState(false);

  const hasStructure = structureText.trim().length > 0;
  const contacts = useMemo(() => analysis?.contacts ?? [], [analysis]);
  const residueConfidences = analysis?.residue_confidences ?? EMPTY_RESIDUE_CONFIDENCES;
  const filteredContacts = useMemo(
    () =>
      contactFilter === "all"
        ? contacts
        : contacts.filter((contact) => contact.contact_categories.includes(contactFilter)),
    [contactFilter, contacts],
  );
  const filteredContactPreview = useMemo(() => filteredContacts.slice(0, 80), [filteredContacts]);

  async function handleFile(file: File) {
    const timingStarted = performance.now();
    setError(null);
    setAnalysis(null);
    setSelection(null);
    setViewerColorMode("structure");
    setContactFilter("all");
    setFileName(file.name);
    setStructureFormat(formatFromFileName(file.name));
    const text = await file.text();
    setStructureText(text);
    logTiming("file upload read", timingStarted, {
      fileName: file.name,
      bytes: file.size,
      characters: text.length,
    });
  }

  async function loadExample() {
    const timingStarted = performance.now();
    setError(null);
    setAnalysis(null);
    setSelection(null);
    setViewerColorMode("structure");
    setContactFilter("all");
    const fetchStarted = performance.now();
    const response = await fetch(EXAMPLE_FILE);
    const fetchMs = elapsedMs(fetchStarted);
    const textStarted = performance.now();
    const text = await response.text();
    const textMs = elapsedMs(textStarted);
    setFileName("sample.pdb");
    setStructureText(text);
    setStructureFormat("pdb");
    logTiming("sample load", timingStarted, {
      fetch_ms: fetchMs,
      response_text_ms: textMs,
      bytes: text.length,
    });
  }

  async function analyzeStructure() {
    if (!hasStructure) {
      setError("Upload or load a PDB or mmCIF file before analysis.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const timingStarted = performance.now();
      const formStarted = performance.now();
      const formData = new FormData();
      formData.append(
        "file",
        new File([structureText], fileName || defaultUploadName(structureFormat), {
          type: contentTypeForFormat(structureFormat),
        }),
      );
      formData.append("cutoff_angstrom", String(cutoff));
      const form_ms = elapsedMs(formStarted);

      const requestStarted = performance.now();
      const response = await fetch(buildApiUrl("/api/analyze"), {
        method: "POST",
        body: formData,
      });
      const request_ms = elapsedMs(requestStarted);

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `Analysis failed with status ${response.status}.`);
      }

      const parseStarted = performance.now();
      const nextAnalysis = (await response.json()) as AnalysisResponse;
      const response_json_ms = elapsedMs(parseStarted);
      setAnalysis(nextAnalysis);
      setSelection(null);
      setViewerColorMode(nextAnalysis.confidence ? "plddt" : "structure");
      setContactFilter("all");
      logTiming("analysis request", timingStarted, {
        form_ms,
        request_ms,
        response_json_ms,
        backend: response.headers.get(TIMING_HEADER) ?? "not exposed",
        atoms: nextAnalysis.summary.atom_count,
        residues: nextAnalysis.summary.residue_count,
        contacts: nextAnalysis.summary.contact_count,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchRcsbStructure() {
    const normalizedPdbId = pdbId.trim();
    if (!normalizedPdbId) {
      setError("Enter a 4-character PDB ID before fetching from RCSB.");
      return;
    }

    setIsRcsbLoading(true);
    setError(null);
    setAnalysis(null);
    setSelection(null);
    setViewerColorMode("structure");
    setContactFilter("all");

    try {
      const timingStarted = performance.now();
      const requestStarted = performance.now();
      const response = await fetch(
        buildApiUrl(`/api/rcsb/${encodeURIComponent(normalizedPdbId)}/analyze?cutoff_angstrom=${cutoff}`),
      );
      const request_ms = elapsedMs(requestStarted);

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `RCSB fetch failed with status ${response.status}.`);
      }

      const parseStarted = performance.now();
      const payload = (await response.json()) as RcsbAnalysisResponse;
      const response_json_ms = elapsedMs(parseStarted);

      setFileName(payload.filename);
      setStructureText(payload.structure_text);
      setStructureFormat(payload.structure_format);
      setAnalysis(payload.analysis);
      setSelection(null);
      setViewerColorMode(payload.analysis.confidence ? "plddt" : "structure");
      setContactFilter("all");
      logTiming("rcsb fetch analysis", timingStarted, {
        request_ms,
        response_json_ms,
        backend: response.headers.get(TIMING_HEADER) ?? "not exposed",
        pdb_id: payload.analysis.metadata?.pdb_id ?? normalizedPdbId.toUpperCase(),
        bytes: payload.structure_text.length,
        contacts: payload.analysis.summary.contact_count,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "RCSB fetch failed.");
    } finally {
      setIsRcsbLoading(false);
    }
  }

  async function fetchAlphaFoldStructure() {
    const normalizedUniprotId = uniprotId.trim();
    if (!normalizedUniprotId) {
      setError("Enter a UniProt accession before fetching from AlphaFold DB.");
      return;
    }

    setIsAlphaFoldLoading(true);
    setError(null);
    setAnalysis(null);
    setSelection(null);
    setViewerColorMode("structure");
    setContactFilter("all");

    try {
      const timingStarted = performance.now();
      const requestStarted = performance.now();
      const response = await fetch(
        buildApiUrl(`/api/alphafold/${encodeURIComponent(normalizedUniprotId)}/analyze?cutoff_angstrom=${cutoff}`),
      );
      const request_ms = elapsedMs(requestStarted);

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `AlphaFold DB fetch failed with status ${response.status}.`);
      }

      const parseStarted = performance.now();
      const payload = (await response.json()) as AlphaFoldAnalysisResponse;
      const response_json_ms = elapsedMs(parseStarted);

      setFileName(payload.filename);
      setStructureText(payload.structure_text);
      setStructureFormat(payload.structure_format);
      setAnalysis(payload.analysis);
      setSelection(null);
      setViewerColorMode(payload.analysis.confidence ? "plddt" : "structure");
      setContactFilter("all");
      logTiming("alphafold fetch analysis", timingStarted, {
        request_ms,
        response_json_ms,
        backend: response.headers.get(TIMING_HEADER) ?? "not exposed",
        uniprot_id: payload.analysis.metadata?.uniprot_id ?? normalizedUniprotId.toUpperCase(),
        bytes: payload.structure_text.length,
        contacts: payload.analysis.summary.contact_count,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AlphaFold DB fetch failed.");
    } finally {
      setIsAlphaFoldLoading(false);
    }
  }

  function reset() {
    setFileName("");
    setStructureText("");
    setStructureFormat("pdb");
    setPdbId("");
    setUniprotId("");
    setAnalysis(null);
    setSelection(null);
    setViewerColorMode("structure");
    setContactFilter("all");
    setError(null);
    setCutoff(4.0);
  }

  function exportCsv() {
    if (!contacts.length) {
      return;
    }

    const csv = contactsToCsv(contacts);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName.replace(/\.[^.]+$/, "") || "contacts"}-contacts.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-700">
              <Atom className="h-4 w-4" />
              Protein Interaction Explorer
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
              Structure upload and contact analysis
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Upload a PDB or mmCIF file, inspect the structure, calculate residue and ligand contacts, and export the
              interaction table.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadExample}
              className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
            >
              <FileUp className="h-4 w-4" />
              Load sample
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="flex flex-col gap-4">
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
                      void handleFile(file);
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
                    onChange={(event) => setCutoff(Number(event.target.value))}
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
                onClick={analyzeStructure}
                disabled={!hasStructure || isLoading}
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 bg-cyan-700 px-4 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Analyze structure
              </button>

              {fileName ? (
                <div className="mt-4 border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Loaded file</p>
                  <p className="mt-1 break-words font-mono text-sm text-slate-800">{fileName}</p>
                </div>
              ) : null}
            </div>

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
                  onChange={(event) => setPdbId(event.target.value.toUpperCase())}
                  placeholder="1ABC"
                  className="h-10 min-w-0 flex-1 border border-slate-300 bg-white px-3 font-mono text-sm uppercase outline-none focus:border-cyan-600"
                />
                <button
                  type="button"
                  onClick={fetchRcsbStructure}
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
              <label
                className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500"
                htmlFor="uniprot-id"
              >
                UniProt accession
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="uniprot-id"
                  type="text"
                  value={uniprotId}
                  maxLength={10}
                  onChange={(event) => setUniprotId(event.target.value.toUpperCase())}
                  placeholder="P69905"
                  className="h-10 min-w-0 flex-1 border border-slate-300 bg-white px-3 font-mono text-sm uppercase outline-none focus:border-cyan-600"
                />
                <button
                  type="button"
                  onClick={fetchAlphaFoldStructure}
                  disabled={isAlphaFoldLoading}
                  className="inline-flex h-10 items-center justify-center gap-2 bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isAlphaFoldLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Fetch
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

            {analysis?.warnings.length ? (
              <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Analysis warnings</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {analysis.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>

          <section className="grid gap-4">
            <StructureViewer
              structureText={structureText}
              structureFormat={structureFormat}
              selection={selection}
              residueConfidences={residueConfidences}
              colorMode={viewerColorMode}
            />
            <SelectionBar selection={selection} onClear={() => setSelection(null)} />
            <MetadataPanel metadata={analysis?.metadata ?? null} />
            <ConfidencePanel
              confidence={analysis?.confidence ?? null}
              residueConfidences={residueConfidences}
              colorMode={viewerColorMode}
              onColorModeChange={setViewerColorMode}
            />
            <InteractionSummaryPanel summary={analysis?.interaction_summary ?? null} />
            <SummaryCards analysis={analysis} />
          </section>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <ChainTable
            chains={analysis?.chains ?? []}
            selection={selection}
            onSelect={(chain) =>
              setSelection({
                kind: "chain",
                chainId: chain.id,
                label: `Chain ${chain.id}`,
              })
            }
          />

          <LigandTable
            ligands={analysis?.ligands ?? []}
            selection={selection}
            onSelect={(ligand) =>
              setSelection({
                kind: "ligand",
                chainId: ligand.chain_id,
                residueName: ligand.name,
                residueNumber: ligand.residue_number,
                label: `${ligand.name} ${ligand.chain_id}:${ligand.residue_number}`,
              })
            }
          />
        </section>

        <section className="border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Contacts</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Closest atom pair per categorized contact.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <ContactCategoryFilter value={contactFilter} onChange={setContactFilter} />
              <button
                type="button"
                onClick={exportCsv}
                disabled={!contacts.length}
                className="inline-flex h-10 items-center justify-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>
          <ContactTable
            contacts={filteredContactPreview}
            totalCount={filteredContacts.length}
            selection={selection}
            onSelect={(contact) =>
              setSelection({
                kind: "contact",
                contact,
                label: `${contact.chain_a}:${contact.residue_name_a}${contact.residue_a} - ${contact.chain_b}:${contact.residue_name_b}${contact.residue_b}`,
              })
            }
          />
        </section>
      </div>
    </main>
  );
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function logTiming(label: string, startedAt: number, details: Record<string, number | string>) {
  console.info(`[protein.io timing] ${label}`, {
    total_ms: elapsedMs(startedAt),
    ...details,
  });
}

function formatFromFileName(fileName: string): StructureFileFormat {
  return /\.(cif|mmcif)$/i.test(fileName) ? "cif" : "pdb";
}

function defaultUploadName(format: StructureFileFormat): string {
  return format === "cif" ? "uploaded.cif" : "uploaded.pdb";
}

function contentTypeForFormat(format: StructureFileFormat): string {
  return format === "cif" ? "chemical/x-mmcif" : "chemical/x-pdb";
}

function SummaryCards({ analysis }: { analysis: AnalysisResponse | null }) {
  const summary = analysis?.summary;
  const items = [
    ["Atoms", summary?.atom_count ?? 0, "Coordinate records parsed from the structure file."],
    ["Protein residues", summary?.residue_count ?? 0, "Amino acid residues counted across chains."],
    ["Chains", summary?.chain_count ?? 0, "Distinct protein chains in the structure."],
    ["Ligands", summary?.ligand_count ?? 0, "Non-water hetero residues detected."],
    ["Contacts", summary?.contact_count ?? 0, "Residue and ligand contacts under cutoff."],
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map(([label, value, helper]) => (
        <div key={label} className="border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-950">{value}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>
        </div>
      ))}
    </div>
  );
}

function MetadataPanel({ metadata }: { metadata: StructureMetadata | null }) {
  if (!metadata || metadata.source === "upload") {
    return null;
  }

  const isAlphaFold = metadata.source === "alphafold";
  const rows = isAlphaFold
    ? [
        ["UniProt", metadata.uniprot_id],
        ["Method", metadata.method],
        ["Organism", metadata.organism],
        ["Model version", metadata.model_version],
        ["Model date", metadata.deposition_date],
        ["Entities", metadata.entity_count],
        ["Chains", metadata.chain_count],
      ]
    : [
        ["PDB ID", metadata.pdb_id],
        ["Status", metadata.status === "removed" ? "Removed entry" : metadata.status],
        ["Replaced by", metadata.replaced_by.length ? metadata.replaced_by.join(", ") : null],
        ["Method", metadata.method],
        ["Resolution", metadata.resolution_angstrom ? `${metadata.resolution_angstrom.toFixed(2)} A` : null],
        ["Organism", metadata.organism],
        ["Deposited", metadata.deposition_date],
        ["Entities", metadata.entity_count],
        ["Chains", metadata.chain_count],
      ];

  const entryUrl = isAlphaFold ? metadata.alphafold_url : metadata.rcsb_url;
  const entryLabel = isAlphaFold ? "AlphaFold DB entry" : "RCSB entry";

  return (
    <div className="border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">
            {metadata.title ?? (isAlphaFold ? "AlphaFold DB model" : "RCSB structure")}
          </h2>
          <div className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map(([label, value]) =>
              value ? (
                <div key={label}>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 text-sm text-slate-800">{value}</p>
                </div>
              ) : null,
            )}
          </div>
        </div>
        {entryUrl ? (
          <a
            href={entryUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 shrink-0 items-center justify-center border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            {entryLabel}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function ConfidencePanel({
  confidence,
  residueConfidences,
  colorMode,
  onColorModeChange,
}: {
  confidence: ConfidenceSummary | null;
  residueConfidences: ResidueConfidence[];
  colorMode: ViewerColorMode;
  onColorModeChange: (mode: ViewerColorMode) => void;
}) {
  if (!confidence) {
    return null;
  }

  const categories = [
    ["Very high", confidence.very_high_count, "#2563eb"],
    ["Confident", confidence.confident_count, "#06b6d4"],
    ["Low", confidence.low_count, "#f59e0b"],
    ["Very low", confidence.very_low_count, "#ef4444"],
  ] as const;

  return (
    <div className="border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Predicted confidence</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            pLDDT values were read from residue B-factors for this predicted structure.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Average pLDDT</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-950">{confidence.average_plddt.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Residues</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-950">{confidence.residue_count}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Low confidence</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-950">{confidence.low_confidence_count}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3">
          <div className="inline-flex border border-slate-300 bg-white p-1">
            {(["structure", "plddt"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onColorModeChange(mode)}
                className={`h-8 px-3 text-xs font-semibold uppercase tracking-wide ${
                  colorMode === mode ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {mode === "plddt" ? "pLDDT" : "Structure"}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">{residueConfidences.length} residues available for confidence coloring.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map(([label, count, color]) => (
          <div key={label} className="flex items-center justify-between border border-slate-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3" style={{ backgroundColor: color }} />
              <span className="text-sm text-slate-700">{label}</span>
            </div>
            <span className="font-mono text-sm text-slate-900">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InteractionSummaryPanel({ summary }: { summary: InteractionSummary | null }) {
  if (!summary) {
    return null;
  }

  const items = [
    ["Protein-protein", summary.protein_protein_count],
    ["Protein-ligand", summary.protein_ligand_count],
    ["Protein-water", summary.protein_water_count],
    ["Ligand-water", summary.ligand_water_count],
    ["Inter-chain", summary.inter_chain_count],
    ["Possible clashes", summary.possible_clash_count],
  ];

  return (
    <div className="border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-950">Interaction summary</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Distance-based contact categories and top contact participants.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between border border-slate-200 px-3 py-2">
            <span className="text-sm text-slate-700">{label}</span>
            <span className="font-mono text-sm text-slate-950">{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <TopContactList
          title="Top residues"
          rows={summary.top_contacting_residues.map((residue) => [
            `${residue.chain_id}:${residue.residue_name}${residue.residue_number}`,
            residue.contact_count,
          ])}
        />
        <TopContactList
          title="Top ligands"
          rows={summary.top_contacting_ligands.map((ligand) => [
            `${ligand.name} ${ligand.chain_id}:${ligand.residue_number}`,
            ligand.contact_count,
          ])}
        />
      </div>
    </div>
  );
}

function TopContactList({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      {rows.length ? (
        <div className="mt-2 divide-y divide-slate-100 border border-slate-200">
          {rows.map(([label, count]) => (
            <div key={label} className="flex items-center justify-between px-3 py-2">
              <span className="font-mono text-sm text-slate-800">{label}</span>
              <span className="font-mono text-sm text-slate-950">{count}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No rows.</p>
      )}
    </div>
  );
}

function SelectionBar({ selection, onClear }: { selection: ViewerSelection | null; onClear: () => void }) {
  if (!selection) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Selected</p>
        <p className="mt-1 font-mono text-sm">{selection.label}</p>
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selected structure item"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ContactCategoryFilter({
  value,
  onChange,
}: {
  value: ContactFilter;
  onChange: (value: ContactFilter) => void;
}) {
  const options: Array<[ContactFilter, string]> = [
    ["all", "All"],
    ["protein-protein", "Protein-protein"],
    ["protein-ligand", "Protein-ligand"],
    ["protein-water", "Protein-water"],
    ["ligand-water", "Ligand-water"],
    ["inter-chain", "Inter-chain"],
    ["possible-clash", "Clashes"],
  ];

  return (
    <div className="flex max-w-full flex-wrap justify-end gap-1">
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`h-8 border px-2 text-xs font-medium ${
            value === option
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ChainTable({
  chains,
  selection,
  onSelect,
}: {
  chains: ChainSummary[];
  selection: ViewerSelection | null;
  onSelect: (chain: ChainSummary) => void;
}) {
  return (
    <div className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-950">Chains</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">Protein residue and atom counts grouped by chain.</p>
      </div>
      {chains.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-4 py-3 font-medium">Chain</th>
                <th className="px-4 py-3 font-medium">Residues</th>
                <th className="px-4 py-3 font-medium">Atoms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {chains.map((chain) => (
                <tr
                  key={chain.id}
                  className={selectableRowClass(selection?.kind === "chain" && selection.chainId === chain.id)}
                >
                  <td className="w-12 px-4 py-3">
                    <SelectionButton label={`Select chain ${chain.id}`} onClick={() => onSelect(chain)} />
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-900">{chain.id}</td>
                  <td className="px-4 py-3 text-slate-800">{chain.residue_count}</td>
                  <td className="px-4 py-3 text-slate-800">{chain.atom_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-4 text-sm text-slate-500">Run analysis to show chains.</p>
      )}
    </div>
  );
}

function LigandTable({
  ligands,
  selection,
  onSelect,
}: {
  ligands: LigandSummary[];
  selection: ViewerSelection | null;
  onSelect: (ligand: LigandSummary) => void;
}) {
  return (
    <div className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-950">Ligands</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">Non-water hetero residues detected in the structure file.</p>
      </div>
      {ligands.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Chain</th>
                <th className="px-4 py-3 font-medium">Residue</th>
                <th className="px-4 py-3 font-medium">Atoms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ligands.map((ligand) => {
                const selected =
                  selection?.kind === "ligand" &&
                  selection.chainId === ligand.chain_id &&
                  selection.residueNumber === ligand.residue_number &&
                  selection.residueName === ligand.name;

                return (
                  <tr
                    key={`${ligand.name}-${ligand.chain_id}-${ligand.residue_number}`}
                    className={selectableRowClass(selected)}
                  >
                    <td className="w-12 px-4 py-3">
                      <SelectionButton
                        label={`Select ligand ${ligand.name} ${ligand.chain_id}:${ligand.residue_number}`}
                        onClick={() => onSelect(ligand)}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-900">{ligand.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-800">{ligand.chain_id}</td>
                    <td className="px-4 py-3 font-mono text-slate-800">{ligand.residue_number}</td>
                    <td className="px-4 py-3 text-slate-800">{ligand.atom_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-4 text-sm text-slate-500">No ligand rows yet.</p>
      )}
    </div>
  );
}

function ContactTable({
  contacts,
  totalCount,
  selection,
  onSelect,
}: {
  contacts: ContactRecord[];
  totalCount: number;
  selection: ViewerSelection | null;
  onSelect: (contact: ContactRecord) => void;
}) {
  if (!contacts.length) {
    return <p className="p-4 text-sm text-slate-500">Run analysis to populate contacts.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">
              <span className="sr-only">Select</span>
            </th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Categories</th>
            <th className="px-4 py-3 font-medium">Residue A</th>
            <th className="px-4 py-3 font-medium">Atom A</th>
            <th className="px-4 py-3 font-medium">Residue B</th>
            <th className="px-4 py-3 font-medium">Atom B</th>
            <th className="px-4 py-3 font-medium">Distance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {contacts.map((contact, index) => {
            const selected = selection?.kind === "contact" && contactKey(selection.contact, index) === contactKey(contact, index);

            return (
              <tr
                key={contactKey(contact, index)}
                className={selectableRowClass(selected)}
              >
                <td className="w-12 px-4 py-3">
                  <SelectionButton
                    label={`Select contact ${contact.chain_a}:${contact.residue_name_a}${contact.residue_a} to ${contact.chain_b}:${contact.residue_name_b}${contact.residue_b}`}
                    onClick={() => onSelect(contact)}
                  />
                </td>
                <td className="px-4 py-3 text-slate-700">{contact.contact_type}</td>
                <td className="px-4 py-3 text-slate-700">{contact.contact_categories.join(", ")}</td>
                <td className="px-4 py-3 font-mono text-slate-900">
                  {contact.chain_a}:{contact.residue_name_a}
                  {contact.residue_a}
                </td>
                <td className="px-4 py-3 font-mono text-slate-700">{contact.atom_a}</td>
                <td className="px-4 py-3 font-mono text-slate-900">
                  {contact.chain_b}:{contact.residue_name_b}
                  {contact.residue_b}
                </td>
                <td className="px-4 py-3 font-mono text-slate-700">{contact.atom_b}</td>
                <td className="px-4 py-3 font-mono text-slate-700">{contact.distance_angstrom.toFixed(3)} A</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {totalCount > contacts.length ? (
        <p className="border-t border-slate-200 p-3 text-xs text-slate-500">
          Showing first {contacts.length} of {totalCount} contacts. CSV export includes all rows.
        </p>
      ) : null}
    </div>
  );
}

function selectableRowClass(selected: boolean) {
  return [
    "text-slate-800",
    selected ? "bg-amber-50 ring-2 ring-inset ring-amber-400 hover:bg-amber-50" : "",
  ].join(" ");
}

function SelectionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center border border-slate-300 bg-white text-slate-700 hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-600"
    >
      <Atom className="h-4 w-4" />
    </button>
  );
}

function contactKey(contact: ContactRecord, index: number) {
  return [
    contact.contact_type,
    contact.chain_a,
    contact.residue_a,
    contact.atom_a,
    contact.chain_b,
    contact.residue_b,
    contact.atom_b,
    index,
  ].join("-");
}
