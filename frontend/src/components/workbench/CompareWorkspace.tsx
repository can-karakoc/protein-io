"use client";

import { ArrowLeftRight, Database, Download, FileUp, LoaderCircle, Play, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

import { buildApiUrl } from "@/lib/api";
import { comparisonContactsToCsv } from "@/lib/csv";
import type {
  AlphaFoldAnalysisResponse,
  ContactDifference,
  RcsbAnalysisResponse,
  StructureComparisonResponse,
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
  pdbId: string;
  uniprotId: string;
  isFetching: boolean;
  error: string | null;
};

const SUPPORTED_STRUCTURE_FILE = /\.(pdb|cif|mmcif)$/i;

function emptyComparisonInput(): ComparisonInputState {
  return {
    mode: "local",
    file: null,
    pdbId: "",
    uniprotId: "",
    isFetching: false,
    error: null,
  };
}

export function CompareWorkspace() {
  const [inputA, setInputA] = useState<ComparisonInputState>(emptyComparisonInput);
  const [inputB, setInputB] = useState<ComparisonInputState>(emptyComparisonInput);
  const [cutoff, setCutoff] = useState(4);
  const [comparison, setComparison] = useState<StructureComparisonResponse | null>(null);
  const [activeTab, setActiveTab] = useState<ComparisonTab>("shared");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<CompareError>(null);

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
  }

  function exportComparisonExamples() {
    if (!comparison || !inputA.file || !inputB.file) return;
    const csv = comparisonContactsToCsv(comparison);
    downloadCsv(csv, `${baseName(inputA.file.name)}-vs-${baseName(inputB.file.name)}-contact-difference-examples.csv`);
  }

  return (
    <div className="h-full overflow-y-auto rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)]">
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

        <div className="mt-5 flex flex-col gap-3 rounded-[12px] bg-[#F5F5F5] p-4 sm:flex-row sm:items-end">
          <label className="w-full sm:max-w-[220px]">
            <div className="flex items-center justify-between">
              <span className="pio-label">Contact cutoff</span>
              <span className="font-mono text-[13px] text-[var(--pio-graphite)]">{cutoff.toFixed(1)} Å</span>
            </div>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={cutoff}
              onChange={(event) => setCutoff(Number(event.target.value))}
              className="pio-input mt-2 w-full px-3 py-2"
            />
          </label>
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
            className="pio-button-primary sm:ml-auto sm:min-w-[160px]"
            style={{ borderRadius: 12 }}
          >
            {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isLoading ? "Analyzing…" : "Analyze"}
          </button>
        </div>

        {error ? (
          <div className="mt-5 rounded-[12px] border border-[var(--pio-coral)] bg-[var(--pio-coral-pale)] px-4 py-3">
            <p className="font-semibold text-[var(--pio-coral-deep)]">{error.title}</p>
            <p className="mt-1 text-sm text-[var(--pio-coral-deep)]">{error.message}</p>
          </div>
        ) : null}

        {comparison && inputA.file && inputB.file ? (
          <ComparisonResults
            comparison={comparison}
            fileAName={inputA.file.name}
            fileBName={inputB.file.name}
            activeTab={activeTab}
            activeRows={activeRows}
            onTabChange={setActiveTab}
            onExport={exportComparisonExamples}
          />
        ) : (
          <div className="mt-8 rounded-[12px] border border-dashed border-[var(--pio-line-strong)] px-6 py-12 text-center">
            <ArrowLeftRight className="mx-auto h-7 w-7 text-[var(--pio-graphite)] opacity-45" />
            <p className="mt-3 text-[15px] font-semibold text-[var(--pio-ink)]">Comparison results will appear here</p>
            <p className="mx-auto mt-1 max-w-[470px] text-[13px] leading-5 text-[var(--pio-graphite)]">
              Choose two structures to calculate count deltas and residue-level shared, gained, and lost contact examples.
            </p>
          </div>
        )}
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
    { id: "alphafold", label: "AlphaFold", icon: Sparkles },
  ];
  const publicValue = input.mode === "rcsb" ? input.pdbId : input.uniprotId;
  const publicLabel = input.mode === "rcsb" ? "PDB ID" : "UniProt accession";
  const publicPlaceholder = input.mode === "rcsb" ? "E.G. 4HHB" : "E.G. P69905";

  return (
    <div className="rounded-[12px] border border-[var(--pio-line)] bg-[#F5F5F5] p-4">
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
        <StructureSummaryCard label="Structure A" fileName={fileAName} summary={comparison.structure_a.summary} />
        <StructureSummaryCard label="Structure B" fileName={fileBName} summary={comparison.structure_b.summary} />
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
            Counts include all identities; the endpoint returns up to 10 representative rows per category.
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
}: {
  label: string;
  fileName: string;
  summary: StructureSummary;
}) {
  const metrics = [
    ["Atoms", summary.atom_count],
    ["Residues", summary.residue_count],
    ["Chains", summary.chain_count],
    ["Ligands", summary.ligand_count],
    ["Contacts", summary.contact_count],
  ];
  return (
    <div className="rounded-[12px] bg-[var(--pio-paper)] p-4">
      <p className="pio-label">{label}</p>
      <p className="mt-1 truncate font-mono text-[13px] font-semibold text-[var(--pio-ink)]" title={fileName}>{fileName}</p>
      <div className="mt-4 grid grid-cols-5 gap-2">
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
    <div className="mt-4 overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[minmax(250px,2fr)_1fr_1fr_1fr] gap-4 border-b border-[var(--pio-line)] px-3 py-2">
          {["Contact identity", "Categories", "Distance A", "Distance B"].map((label) => (
            <p key={label} className="pio-label">{label}</p>
          ))}
        </div>
        {rows.map((row) => (
          <div
            key={`${row.label}-${row.contact_type}-${row.distance_a_angstrom ?? "none"}-${row.distance_b_angstrom ?? "none"}`}
            className="grid grid-cols-[minmax(250px,2fr)_1fr_1fr_1fr] gap-4 border-b border-[var(--pio-line)] px-3 py-3 text-[12px]"
          >
            <div>
              <p className="font-mono font-semibold text-[var(--pio-ink)]">{row.label}</p>
              <p className="mt-1 text-[var(--pio-graphite)]">{row.contact_type}</p>
            </div>
            <div className="flex flex-wrap content-start gap-1">
              {row.contact_categories.map((category) => (
                <span key={category} className="pio-badge pio-badge-neutral">{category}</span>
              ))}
            </div>
            <p className="font-mono text-[var(--pio-ink)]">{formatDistance(row.distance_a_angstrom)}</p>
            <p className="font-mono text-[var(--pio-ink)]">{formatDistance(row.distance_b_angstrom)}</p>
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
