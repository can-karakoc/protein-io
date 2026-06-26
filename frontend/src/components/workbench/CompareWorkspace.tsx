"use client";

import { ArrowLeftRight, Database, Download, FileUp, LoaderCircle, Play, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { buildApiUrl } from "@/lib/api";
import { comparisonContactsToCsv } from "@/lib/csv";
import { setCompareSession, labelFromInput } from "@/lib/compareSession";
import type {
  AlphaFoldAnalysisResponse,
  ContactDifference,
  RcsbAnalysisResponse,
  StructureComparisonResponse,
  StructureMetadata,
  StructureSummary,
} from "@/lib/types";

type ComparisonTab = "shared" | "gained" | "lost";
type ComparisonInputMode = "local" | "rcsb" | "alphafold";
type ComparisonSide = "a" | "b";

type CompareError = {
  title: string;
  message: string;
} | null;

type ComparisonInputState = {
  mode: ComparisonInputMode;
  file: File | null;
  fileText: string | null; // raw text for rcsb/alphafold fetched files — enables persistence
  pdbId: string;
  uniprotId: string;
  isFetching: boolean;
  error: string | null;
};

type CompareCacheEntry = {
  savedAt: number;
  cutoff: number;
  inputA: { mode: ComparisonInputMode; pdbId: string; uniprotId: string; fileName: string | null; fileText: string | null };
  inputB: { mode: ComparisonInputMode; pdbId: string; uniprotId: string; fileName: string | null; fileText: string | null };
  comparison: StructureComparisonResponse | null;
};

const COMPARE_CACHE_KEY = "pio_compare_v1";
const SUPPORTED_STRUCTURE_FILE = /\.(pdb|cif|mmcif)$/i;

// Module-level snapshot — survives tab switches within a session without touching localStorage.
// localStorage is still written (trimmed) for cross-session persistence (page reload).
let _sessionSnapshot: CompareCacheEntry | null = null;

function trimComparisonForCache(c: StructureComparisonResponse): StructureComparisonResponse {
  const trimAnalysis = (a: typeof c.structure_a) => ({
    ...a,
    contacts: [],
    residue_confidences: [],
    water_bridges: [],
  });
  return {
    ...c,
    structure_a: trimAnalysis(c.structure_a),
    structure_b: trimAnalysis(c.structure_b),
    contacts: {
      ...c.contacts,
      shared_contacts: c.contacts.shared_contacts.slice(0, 500),
      gained_contacts: c.contacts.gained_contacts.slice(0, 500),
      lost_contacts: c.contacts.lost_contacts.slice(0, 500),
    },
  };
}

function saveCompareCache(entry: CompareCacheEntry) {
  // Always keep the full entry in memory — no trimming needed for session snapshot
  _sessionSnapshot = entry;

  // Trim before writing to localStorage to stay within the 5 MB quota
  const trimmed: CompareCacheEntry = {
    ...entry,
    inputA: entry.inputA.mode !== "local" ? { ...entry.inputA, fileText: null } : entry.inputA,
    inputB: entry.inputB.mode !== "local" ? { ...entry.inputB, fileText: null } : entry.inputB,
    comparison: entry.comparison ? trimComparisonForCache(entry.comparison) : null,
  };
  try { localStorage.setItem(COMPARE_CACHE_KEY, JSON.stringify(trimmed)); } catch { /* quota */ }
}

function loadCompareCache(): CompareCacheEntry | null {
  // Prefer in-memory snapshot (full fidelity); fall back to localStorage (page reload case)
  if (_sessionSnapshot) return _sessionSnapshot;
  try {
    const raw = localStorage.getItem(COMPARE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CompareCacheEntry) : null;
  } catch { return null; }
}

function restoreInput(cached: CompareCacheEntry["inputA"]): ComparisonInputState {
  const file = cached.fileText && cached.fileName
    ? new File([cached.fileText], cached.fileName, { type: "chemical/x-mmcif" })
    : null;
  return { mode: cached.mode, file, fileText: cached.fileText, pdbId: cached.pdbId, uniprotId: cached.uniprotId, isFetching: false, error: null };
}

function emptyComparisonInput(): ComparisonInputState {
  return { mode: "local", file: null, fileText: null, pdbId: "", uniprotId: "", isFetching: false, error: null };
}

export function CompareWorkspace() {
  // Initialize directly from cache so the save effect never races against a restore effect
  const [inputA, setInputA] = useState<ComparisonInputState>(() => {
    const c = loadCompareCache(); return c ? restoreInput(c.inputA) : emptyComparisonInput();
  });
  const [inputB, setInputB] = useState<ComparisonInputState>(() => {
    const c = loadCompareCache(); return c ? restoreInput(c.inputB) : emptyComparisonInput();
  });
  const [cutoff, setCutoff] = useState<number>(() => loadCompareCache()?.cutoff ?? 4);
  const [comparison, setComparison] = useState<StructureComparisonResponse | null>(() => loadCompareCache()?.comparison ?? null);
  const [activeTab, setActiveTab] = useState<ComparisonTab>("shared");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<CompareError>(null);

  // Persist whenever inputs, cutoff, or comparison changes
  useEffect(() => {
    const inputACache = { mode: inputA.mode, pdbId: inputA.pdbId, uniprotId: inputA.uniprotId, fileName: inputA.file?.name ?? null, fileText: inputA.fileText };
    const inputBCache = { mode: inputB.mode, pdbId: inputB.pdbId, uniprotId: inputB.uniprotId, fileName: inputB.file?.name ?? null, fileText: inputB.fileText };
    saveCompareCache({ savedAt: Date.now(), cutoff, inputA: inputACache, inputB: inputBCache, comparison });
    // Keep shared session entry in sync so Report can read it without touching localStorage
    setCompareSession(
      comparison
        ? { comparison, cutoff, labelA: labelFromInput(inputACache), labelB: labelFromInput(inputBCache) }
        : null
    );
  }, [inputA, inputB, cutoff, comparison]);

  const activeRows = useMemo(() => {
    if (!comparison) return [];
    if (activeTab === "gained") return comparison.contacts.gained_contacts;
    if (activeTab === "lost") return comparison.contacts.lost_contacts;
    return comparison.contacts.shared_contacts;
  }, [activeTab, comparison]);

  function updateInput(
    side: ComparisonSide,
    update: (current: ComparisonInputState) => ComparisonInputState,
  ) {
    if (side === "a") setInputA(update);
    else setInputB(update);
  }

  function setInputMode(side: ComparisonSide, mode: ComparisonInputMode) {
    setComparison(null);
    setError(null);
    updateInput(side, (current) => ({
      ...current,
      mode,
      file: null,
      fileText: null,
      isFetching: false,
      error: null,
    }));
  }

  function chooseFile(side: ComparisonSide, file: File | null) {
    setError(null);
    setComparison(null);
    if (file && !SUPPORTED_STRUCTURE_FILE.test(file.name)) {
      updateInput(side, (current) => ({
        ...current,
        file: null,
        error: "Comparison accepts .pdb, .cif, and .mmcif coordinate files.",
      }));
      return;
    }
    updateInput(side, (current) => ({ ...current, file, error: null }));
  }

  function setPublicId(side: ComparisonSide, value: string) {
    updateInput(side, (current) =>
      current.mode === "rcsb"
        ? { ...current, pdbId: value, error: null }
        : { ...current, uniprotId: value, error: null },
    );
  }

  async function fetchPublicStructure(side: ComparisonSide) {
    const input = side === "a" ? inputA : inputB;
    const isRcsb = input.mode === "rcsb";
    const rawId = isRcsb ? input.pdbId : input.uniprotId;
    const normalizedId = rawId.trim().toUpperCase();
    const valid = isRcsb
      ? /^[A-Z0-9]{4}$/.test(normalizedId)
      : /^[A-Z0-9]{6,10}$/.test(normalizedId);

    if (!valid) {
      updateInput(side, (current) => ({
        ...current,
        error: isRcsb
          ? "PDB IDs must be exactly 4 letters or numbers."
          : "UniProt accessions must be 6 to 10 letters or numbers.",
      }));
      return;
    }

    setComparison(null);
    setError(null);
    updateInput(side, (current) => ({ ...current, isFetching: true, error: null, file: null }));
    try {
      const endpoint = isRcsb
        ? `/api/rcsb/${encodeURIComponent(normalizedId)}/analyze`
        : `/api/alphafold/${encodeURIComponent(normalizedId)}/analyze`;
      const response = await fetch(buildApiUrl(`${endpoint}?cutoff_angstrom=${cutoff}`));
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `Fetch failed with status ${response.status}.`);
      }
      const payload = (await response.json()) as RcsbAnalysisResponse | AlphaFoldAnalysisResponse;
      const file = new File([payload.structure_text], payload.filename, { type: "chemical/x-mmcif" });
      updateInput(side, (current) => ({
        ...current,
        file,
        fileText: payload.structure_text,
        pdbId: isRcsb ? normalizedId : current.pdbId,
        uniprotId: isRcsb ? current.uniprotId : normalizedId,
        isFetching: false,
        error: null,
      }));
    } catch (caught) {
      updateInput(side, (current) => ({
        ...current,
        isFetching: false,
        error: caught instanceof Error ? caught.message : "The public structure could not be fetched.",
      }));
    }
  }

  async function compareStructures() {
    if (!inputA.file || !inputB.file) {
      setError({
        title: "Two structures are required",
        message: "Choose both structure A and structure B before running the comparison.",
      });
      return;
    }
    if (!Number.isFinite(cutoff) || cutoff <= 0) {
      setError({
        title: "Invalid distance cutoff",
        message: "Enter a contact cutoff greater than zero angstroms.",
      });
      return;
    }

    setIsLoading(true);
    setError(null);
    setComparison(null);
    try {
      const formData = new FormData();
      formData.append("file_a", inputA.file);
      formData.append("file_b", inputB.file);
      formData.append("cutoff_angstrom", String(cutoff));
      const response = await fetch(buildApiUrl("/api/compare"), {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `Comparison failed with status ${response.status}.`);
      }
      setComparison((await response.json()) as StructureComparisonResponse);
      setActiveTab("shared");
    } catch (caught) {
      setError({
        title: "Comparison failed",
        message: caught instanceof Error ? caught.message : "The structures could not be compared.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  function swapStructures() {
    setInputA(inputB);
    setInputB(inputA);
    setComparison(null);
    setError(null);
  }

  function resetComparison() {
    setInputA(emptyComparisonInput());
    setInputB(emptyComparisonInput());
    setComparison(null);
    setError(null);
    try { localStorage.removeItem(COMPARE_CACHE_KEY); } catch { /* ignore */ }
  }

  function exportComparisonExamples() {
    if (!comparison || !inputA.file || !inputB.file) return;
    const csv = comparisonContactsToCsv(comparison);
    downloadCsv(csv, `${baseName(inputA.file.name)}-vs-${baseName(inputB.file.name)}-contact-difference-examples.csv`);
  }

  return (
    <div className="h-full flex flex-col overflow-clip rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)] pt-5 pb-5">
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin-panel">
      <div className="mx-auto max-w-[1180px] px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="pio-label">Structure comparison</p>
            <h1 className="mt-1 text-[26px] font-bold tracking-[-0.025em] text-[var(--pio-ink)]">
              Compare residue-level contact patterns
            </h1>
            <p className="mt-2 max-w-[720px] text-[14px] leading-6 text-[var(--pio-graphite)]">
              Analyze two coordinate files with the same distance cutoff, then review shared, gained, and lost
              residue-contact identities.
            </p>
          </div>
          <div className="flex max-w-[390px] flex-wrap gap-2">
            {["No alignment", "No RMSD", "No TM-score", "No 3D superposition"].map((label) => (
              <span key={label} className="pio-badge pio-badge-caution">{label}</span>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-[12px] border border-[var(--pio-quality-amber-border)] bg-[var(--pio-quality-amber-bg)] px-4 py-3 text-[13px] leading-5 text-[var(--pio-quality-amber-fg)]">
          Contact identities use chain ID, residue name, residue number, and contact type. Equivalent structures with
          different chain or residue numbering may appear different even when their folds are similar.
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <ComparisonStructureInput
            side="A"
            input={inputA}
            onModeChange={(mode) => setInputMode("a", mode)}
            onFileChange={(file) => chooseFile("a", file)}
            onPublicIdChange={(value) => setPublicId("a", value)}
            onFetch={() => void fetchPublicStructure("a")}
          />
          <button
            type="button"
            onClick={swapStructures}
            disabled={!inputA.file && !inputB.file}
            className="pio-button-secondary mx-auto h-10 w-10 rounded-full p-0"
            aria-label="Swap structure A and structure B"
            title="Swap structures"
          >
            <ArrowLeftRight size={16} />
          </button>
          <ComparisonStructureInput
            side="B"
            input={inputB}
            onModeChange={(mode) => setInputMode("b", mode)}
            onFileChange={(file) => chooseFile("b", file)}
            onPublicIdChange={(value) => setPublicId("b", value)}
            onFetch={() => void fetchPublicStructure("b")}
          />
        </div>

        <div className="mt-5 rounded-[12px] bg-[var(--pio-paper)] p-4">
          <div className="flex items-center justify-between">
            <span className="pio-label">Contact cutoff</span>
            <span className="font-mono text-[13px] text-[var(--pio-graphite)]">{cutoff.toFixed(1)} Å</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={cutoff}
              onChange={(event) => setCutoff(Number(event.target.value))}
              className="pio-input w-[200px] px-3 py-2"
            />
            {(inputA.file || inputB.file || comparison || error) ? (
              <button
                type="button"
                onClick={resetComparison}
                className="pio-button-secondary shrink-0"
                style={{ borderRadius: 12 }}
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void compareStructures()}
              disabled={!inputA.file || !inputB.file || isLoading || inputA.isFetching || inputB.isFetching}
              className="ml-auto flex min-w-[160px] items-center justify-center gap-2 rounded-[12px] bg-[var(--pio-highlight)] py-[10px] text-[13px] font-semibold text-[var(--pio-highlight-text)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isLoading ? "Analyzing…" : "Analyze"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-[12px] border border-[var(--pio-coral)] bg-[var(--pio-coral-pale)] px-4 py-3">
            <p className="font-semibold text-[var(--pio-coral-deep)]">{error.title}</p>
            <p className="mt-1 text-sm text-[var(--pio-coral-deep)]">{error.message}</p>
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-8 flex flex-col items-center gap-4 py-12">
            <LoaderCircle className="h-8 w-8 animate-spin text-[var(--pio-highlight)]" />
            <p className="text-[14px] font-semibold text-[var(--pio-ink)]">Analyzing both structures…</p>
            <p className="text-[13px] text-[var(--pio-graphite)]">Parsing coordinates, computing contacts, and diffing contact sets.</p>
          </div>
        ) : null}

        {!isLoading && comparison && inputA.file && inputB.file ? (
          <ComparisonResults
            comparison={comparison}
            fileAName={inputA.file.name}
            fileBName={inputB.file.name}
            activeTab={activeTab}
            activeRows={activeRows}
            onTabChange={setActiveTab}
            onExport={exportComparisonExamples}
          />
        ) : !isLoading ? (
          <div className="mt-8 rounded-[12px] border border-dashed border-[var(--pio-line-strong)] px-6 py-12 text-center">
            <ArrowLeftRight className="mx-auto h-7 w-7 text-[var(--pio-graphite)] opacity-45" />
            <p className="mt-3 text-[15px] font-semibold text-[var(--pio-ink)]">Comparison results will appear here</p>
            <p className="mx-auto mt-1 max-w-[470px] text-[13px] leading-5 text-[var(--pio-graphite)]">
              Choose two structures to calculate count deltas and residue-level shared, gained, and lost contact examples.
            </p>
          </div>
        ) : null}
      </div>
    </div>
    </div>
  );
}

function ComparisonStructureInput({
  side,
  input,
  onModeChange,
  onFileChange,
  onPublicIdChange,
  onFetch,
}: {
  side: "A" | "B";
  input: ComparisonInputState;
  onModeChange: (mode: ComparisonInputMode) => void;
  onFileChange: (file: File | null) => void;
  onPublicIdChange: (value: string) => void;
  onFetch: () => void;
}) {
  const modes: Array<{ id: ComparisonInputMode; label: string; icon: typeof FileUp }> = [
    { id: "local", label: "File", icon: FileUp },
    { id: "rcsb", label: "PDB ID", icon: Database },
    { id: "alphafold", label: "UniProt", icon: Sparkles },
  ];
  const publicValue = input.mode === "rcsb" ? input.pdbId : input.uniprotId;
  const publicLabel = input.mode === "rcsb" ? "PDB ID" : "UniProt accession";
  const publicPlaceholder = input.mode === "rcsb" ? "E.G. 4HHB" : "E.G. P69905";

  return (
    <div className="rounded-[12px] border border-[var(--pio-line)] bg-[var(--pio-paper)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="pio-label">Structure {side}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--pio-ink)]">
            {side === "A" ? "Reference structure" : "Comparison structure"}
          </p>
        </div>
        {input.file ? (
          <button
            type="button"
            onClick={() => onFileChange(null)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--pio-graphite)] hover:bg-[var(--pio-line)]"
            aria-label={`Clear structure ${side}`}
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1 rounded-[12px] border border-[var(--pio-line)] bg-[var(--pio-white)] p-1">
        {modes.map((mode) => {
          const Icon = mode.icon;
          const selected = input.mode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onModeChange(mode.id)}
              aria-pressed={selected}
              className={[
                "flex min-w-0 items-center justify-center gap-1.5 rounded-[7px] px-2 py-2 text-[11px] font-semibold transition-colors",
                selected
                  ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)]"
                  : "text-[var(--pio-graphite)] hover:bg-[var(--pio-paper)]",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{mode.label}</span>
            </button>
          );
        })}
      </div>

      {input.mode === "local" ? (
        <label className="mt-4 flex h-[140px] cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed border-[var(--pio-line-strong)] bg-[var(--pio-white)] px-4 text-center transition-colors hover:bg-[var(--pio-sand)]">
          <FileUp className="h-5 w-5 text-[var(--pio-highlight)]" />
          <span className="mt-2 max-w-full truncate text-[13px] font-semibold text-[var(--pio-ink)]">
            {input.file?.name ?? "Choose PDB or mmCIF"}
          </span>
          <span className="mt-1 text-[11px] text-[var(--pio-graphite)]">
            {input.file ? formatBytes(input.file.size) : ".pdb, .cif, or .mmcif"}
          </span>
          <input
            key={input.file?.name ?? "empty"}
            type="file"
            accept=".pdb,.cif,.mmcif"
            className="sr-only"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
        </label>
      ) : input.file ? (
        <div className="mt-4 flex h-[140px] items-center justify-center rounded-[12px] bg-[var(--pio-green-pale)] p-4">
          <div className="text-center">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--pio-green-deep)] opacity-60">Ready</p>
            <p className="mt-1.5 max-w-[200px] truncate font-mono text-[13px] font-semibold text-[var(--pio-green-deep)]" title={input.file.name}>
              {input.file.name}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-[var(--pio-green-deep)] opacity-60">{formatBytes(input.file.size)}</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex h-[140px] flex-col justify-center rounded-[12px] bg-[var(--pio-white)] px-3 py-4">
          <label className="block">
            <span className="pio-label">{publicLabel}</span>
            <div className="mt-2 flex gap-2">
              <input
                value={publicValue}
                onChange={(event) => onPublicIdChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onFetch();
                }}
                placeholder={publicPlaceholder}
                className="pio-input min-w-0 flex-1 px-3 py-2"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={onFetch}
                disabled={!publicValue.trim() || input.isFetching}
                className="pio-button-secondary shrink-0 gap-1.5 px-4"
              >
                {input.isFetching ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                {input.isFetching ? "Fetching…" : "Fetch"}
              </button>
            </div>
          </label>
        </div>
      )}

      {input.error ? (
        <p className="mt-3 text-[12px] leading-5 text-[var(--pio-coral-deep)]" role="alert">
          {input.error}
        </p>
      ) : null}
    </div>
  );
}

function ComparisonResults({
  comparison,
  fileAName,
  fileBName,
  activeTab,
  activeRows,
  onTabChange,
  onExport,
}: {
  comparison: StructureComparisonResponse;
  fileAName: string;
  fileBName: string;
  activeTab: ComparisonTab;
  activeRows: ContactDifference[];
  onTabChange: (tab: ComparisonTab) => void;
  onExport: () => void;
}) {
  const tabs: Array<{ id: ComparisonTab; label: string; count: number }> = [
    { id: "shared", label: "Shared", count: comparison.contacts.shared_contact_count },
    { id: "gained", label: "Gained in B", count: comparison.contacts.gained_contact_count },
    { id: "lost", label: "Lost from A", count: comparison.contacts.lost_contact_count },
  ];

  return (
    <div className="mt-8">
      <div className="grid gap-4 lg:grid-cols-2">
        <StructureSummaryCard label="Structure A" fileName={fileAName} summary={comparison.structure_a.summary} metadata={comparison.structure_a.metadata} />
        <StructureSummaryCard label="Structure B" fileName={fileBName} summary={comparison.structure_b.summary} metadata={comparison.structure_b.metadata} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <DeltaCard label="Atoms" value={comparison.delta.atom_count_delta} />
        <DeltaCard label="Residues" value={comparison.delta.residue_count_delta} />
        <DeltaCard label="Chains" value={comparison.delta.chain_count_delta} />
        <DeltaCard label="Ligands" value={comparison.delta.ligand_count_delta} />
        <DeltaCard label="Contacts" value={comparison.delta.contact_count_delta} />
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[20px] font-bold text-[var(--pio-ink)]">Contact differences</h2>
          <p className="mt-1 text-[13px] text-[var(--pio-graphite)]">
            Counts include all identities; up to 500 representative rows are shown per category.
          </p>
        </div>
        <button type="button" onClick={onExport} className="pio-button-secondary shrink-0">
          <Download className="h-4 w-4" />
          Export examples CSV
        </button>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-[12px] bg-[var(--pio-paper)] p-1" role="tablist" aria-label="Contact difference category">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            className={[
              "min-w-max flex-1 rounded-[9px] px-4 py-2 text-[13px] font-semibold transition-colors",
              activeTab === tab.id
                ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)]"
                : "text-[var(--pio-graphite)] hover:bg-[var(--pio-line)]",
            ].join(" ")}
          >
            {tab.label} <span className="ml-1 font-mono text-[11px] opacity-75">{tab.count}</span>
          </button>
        ))}
      </div>

      <ContactDifferenceTable rows={activeRows} />

      {comparison.warnings.length ? (
        <div className="mt-5 rounded-[12px] bg-[var(--pio-paper)] px-4 py-3">
          <p className="pio-label">Methods and limitations</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-[13px] leading-5 text-[var(--pio-graphite)]">
            {comparison.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StructureSummaryCard({
  label,
  fileName,
  summary,
  metadata,
}: {
  label: string;
  fileName: string;
  summary: StructureSummary;
  metadata?: StructureMetadata | null;
}) {
  const metrics = [
    ["Atoms", summary.atom_count],
    ["Residues", summary.residue_count],
    ["Chains", summary.chain_count],
    ["Ligands", summary.ligand_count],
    ["Contacts", summary.contact_count],
  ];
  const sourceLabel = metadata?.source === "rcsb" ? "RCSB PDB" : metadata?.source === "alphafold" ? "AlphaFold DB" : "Upload";
  const sourceBadgeClass = metadata?.source === "rcsb" ? "pio-badge-metadata" : metadata?.source === "alphafold" ? "pio-badge-predicted" : "pio-badge-neutral";
  const displayTitle = metadata?.title ?? fileName;
  const meta2: Array<[string, string | number | null | undefined]> = [
    ["Method", metadata?.method ?? null],
    ["Organism", metadata?.organism ?? null],
    ["Resolution", metadata?.resolution_angstrom != null ? `${metadata.resolution_angstrom.toFixed(2)} Å` : null],
  ].filter(([, v]) => v != null) as Array<[string, string]>;

  return (
    <div className="rounded-[12px] bg-[var(--pio-paper)] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="pio-label">{label}</p>
        {metadata && <span className={`pio-badge ${sourceBadgeClass}`}>{sourceLabel}</span>}
      </div>
      <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-[1.4] text-[var(--pio-ink)]" title={displayTitle}>
        {displayTitle}
      </p>
      {meta2.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
          {meta2.map(([k, v]) => (
            <span key={k} className="text-[11px] text-[var(--pio-graphite)]">
              <span className="font-semibold">{k}:</span> {v}
            </span>
          ))}
        </div>
      )}
      <div className="mt-4 grid grid-cols-5 gap-2 border-t border-[var(--pio-line)] pt-3">
        {metrics.map(([metricLabel, value]) => (
          <div key={metricLabel} className="min-w-0">
            <p className="truncate text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--pio-graphite)]">{metricLabel}</p>
            <p className="mt-1 font-mono text-[14px] font-semibold text-[var(--pio-ink)]">{Number(value).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeltaCard({ label, value }: { label: string; value: number }) {
  const tone = value > 0 ? "text-[var(--pio-green-deep)]" : value < 0 ? "text-[var(--pio-coral-deep)]" : "text-[var(--pio-ink)]";
  return (
    <div className="rounded-[10px] border border-[var(--pio-line)] px-3 py-3">
      <p className="pio-label">Δ {label}</p>
      <p className={`mt-1 font-mono text-lg font-bold ${tone}`}>{value > 0 ? `+${value}` : value}</p>
      <p className="mt-1 text-[10px] text-[var(--pio-graphite)]">B minus A</p>
    </div>
  );
}

function ContactDifferenceTable({ rows }: { rows: ContactDifference[] }) {
  if (!rows.length) {
    return (
      <div className="mt-4 rounded-[12px] border border-dashed border-[var(--pio-line-strong)] px-5 py-9 text-center text-sm text-[var(--pio-graphite)]">
        No representative contacts in this category.
      </div>
    );
  }
  return (
    <div className="mt-4 overflow-x-auto rounded-[12px] border border-[var(--pio-line)]">
      <div className="min-w-[680px]">
        <div className="grid grid-cols-[minmax(220px,2fr)_minmax(120px,1fr)_90px_90px] gap-3 border-b border-[var(--pio-line)] bg-[var(--pio-paper)] px-4 py-2.5">
          {["Contact identity", "Categories", "Dist A", "Dist B"].map((label) => (
            <p key={label} className="pio-label">{label}</p>
          ))}
        </div>
        {rows.map((row, i) => (
          <div
            key={`${row.label}-${row.contact_type}-${row.distance_a_angstrom ?? "none"}-${row.distance_b_angstrom ?? "none"}`}
            className={[
              "grid grid-cols-[minmax(220px,2fr)_minmax(120px,1fr)_90px_90px] gap-3 border-b border-[var(--pio-line)] px-4 py-3 last:border-b-0",
              i % 2 === 1 ? "bg-[var(--pio-paper)]" : "",
            ].join(" ")}
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-[12px] font-semibold text-[var(--pio-ink)]" title={row.label}>{row.label}</p>
              <p className="mt-0.5 text-[11px] text-[var(--pio-graphite)]">{row.contact_type.replace(/-/g, "‑")}</p>
            </div>
            <div className="flex flex-wrap content-start gap-1">
              {row.contact_categories.length ? row.contact_categories.map((category) => (
                <span key={category} className="pio-badge pio-badge-neutral">{category}</span>
              )) : <span className="text-[11px] text-[var(--pio-graphite)]">—</span>}
            </div>
            <p className="font-mono text-[12px] text-[var(--pio-ink)]">{formatDistance(row.distance_a_angstrom)}</p>
            <p className="font-mono text-[12px] text-[var(--pio-ink)]">{formatDistance(row.distance_b_angstrom)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDistance(value: number | null) {
  return value == null ? "—" : `${value.toFixed(3)} Å`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
