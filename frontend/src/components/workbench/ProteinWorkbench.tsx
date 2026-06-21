"use client";

import { Atom, Database, Download, FileUp, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { StructureViewer } from "@/components/viewer/StructureViewer";
import { ExploreSidebar } from "@/components/workbench/ExploreSidebar";
import { WorkbenchShell } from "@/components/workbench/WorkbenchShell";
import type { WorkbenchMode } from "@/components/workbench/TopNav";
import { buildApiUrl } from "@/lib/api";
import { contactsToCsv, ligandInteractionsToCsv } from "@/lib/csv";
import type {
  AlphaFoldAnalysisResponse,
  AnalysisResponse,
  ChainSummary,
  ContactCategory,
  ContactRecord,
  ConfidenceSummary,
  InteractionSummary,
  LigandInteractionSummary,
  LigandSummary,
  PaeSummary,
  ResidueConfidence,
  RcsbAnalysisResponse,
  StructureComparisonResponse,
  StructureMetadata,
  ViewerSelection,
} from "@/lib/types";

const EXAMPLE_FILE = "/sample.pdb";
const TIMING_HEADER = "X-ProteinIO-Timing";
const EMPTY_RESIDUE_CONFIDENCES: ResidueConfidence[] = [];
type StructureFileFormat = "pdb" | "cif";
type ViewerColorMode = "structure" | "plddt";
type ContactFilter = "all" | ContactCategory;
type ResultsTab = "overview" | "chains" | "ligands" | "contacts" | "confidence" | "pae" | "quality";
type WorkbenchError = {
  title: string;
  message: string;
  nextStep: string;
} | null;
type WorkbenchStatus = {
  label: string;
  detail: string;
} | null;

export function ProteinWorkbench() {
  const [mode, setMode] = useState<WorkbenchMode>("explore");
  const [fileName, setFileName] = useState<string>("");
  const [structureText, setStructureText] = useState("");
  const [structureFormat, setStructureFormat] = useState<StructureFileFormat>("pdb");
  const [paeFileName, setPaeFileName] = useState("");
  const [paeText, setPaeText] = useState("");
  const [pdbId, setPdbId] = useState("");
  const [uniprotId, setUniprotId] = useState("");
  const [cutoff, setCutoff] = useState(4.0);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [comparisonFileA, setComparisonFileA] = useState<File | null>(null);
  const [comparisonFileB, setComparisonFileB] = useState<File | null>(null);
  const [comparison, setComparison] = useState<StructureComparisonResponse | null>(null);
  const [selection, setSelection] = useState<ViewerSelection | null>(null);
  const [viewerColorMode, setViewerColorMode] = useState<ViewerColorMode>("structure");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [resultsTab, setResultsTab] = useState<ResultsTab>("overview");
  const [error, setError] = useState<WorkbenchError>(null);
  const [status, setStatus] = useState<WorkbenchStatus>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRcsbLoading, setIsRcsbLoading] = useState(false);
  const [isAlphaFoldLoading, setIsAlphaFoldLoading] = useState(false);
  const [isComparisonLoading, setIsComparisonLoading] = useState(false);

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
    setStatus({ label: "Reading structure file", detail: "Loading local coordinates into the browser." });
    if (!isStructureFile(file.name)) {
      setStatus(null);
      setError({
        title: "Unsupported structure file",
        message: `${file.name} is not a supported structure file.`,
        nextStep: "Choose a plain-text .pdb, .cif, or .mmcif file.",
      });
      return;
    }
    setAnalysis(null);
    setSelection(null);
    setViewerColorMode("structure");
    setContactFilter("all");
    setResultsTab("overview");
    setPaeFileName("");
    setPaeText("");
    setFileName(file.name);
    setStructureFormat(formatFromFileName(file.name));
    try {
      const text = await file.text();
      setStructureText(text);
      logTiming("file upload read", timingStarted, {
        fileName: file.name,
        bytes: file.size,
        characters: text.length,
      });
    } catch {
      setError({
        title: "Could not read structure file",
        message: `The browser could not read ${file.name}.`,
        nextStep: "Try the file again, or export a fresh PDB/mmCIF copy from the source database.",
      });
    } finally {
      setStatus(null);
    }
  }

  async function loadExample() {
    const timingStarted = performance.now();
    setError(null);
    setStatus({ label: "Loading bundled sample", detail: "Fetching the local demo PDB file." });
    setAnalysis(null);
    setSelection(null);
    setViewerColorMode("structure");
    setContactFilter("all");
    setResultsTab("overview");
    setPaeFileName("");
    setPaeText("");
    const fetchStarted = performance.now();
    try {
      const response = await fetch(EXAMPLE_FILE);
      if (!response.ok) {
        throw new Error(`Sample returned status ${response.status}.`);
      }
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
    } catch (caught) {
      setError({
        title: "Could not load sample",
        message: caught instanceof Error ? caught.message : "The bundled sample could not be loaded.",
        nextStep: "Try uploading a local PDB/mmCIF file or fetching an RCSB entry.",
      });
    } finally {
      setStatus(null);
    }
  }

  async function handlePaeFile(file: File) {
    const timingStarted = performance.now();
    setError(null);
    setStatus({ label: "Reading PAE JSON", detail: "Validating the optional AlphaFold error sidecar." });
    if (!file.name.toLowerCase().endsWith(".json")) {
      setStatus(null);
      setError({
        title: "Unsupported PAE file",
        message: `${file.name} is not a JSON file.`,
        nextStep: "Choose the PAE sidecar as a .json file, or continue without PAE.",
      });
      return;
    }
    setAnalysis(null);
    setSelection(null);
    setContactFilter("all");
    setResultsTab("overview");
    try {
      const text = await file.text();
      JSON.parse(text);
      setPaeFileName(file.name);
      setPaeText(text);
      logTiming("pae sidecar read", timingStarted, {
        fileName: file.name,
        bytes: file.size,
        characters: text.length,
      });
    } catch (caught) {
      setError({
        title: "Invalid PAE JSON",
        message: caught instanceof Error ? caught.message : "The PAE sidecar could not be parsed as JSON.",
        nextStep: "Use the PAE JSON downloaded with an AlphaFold prediction, or remove the sidecar.",
      });
    } finally {
      setStatus(null);
    }
  }

  async function analyzeStructure() {
    if (!hasStructure) {
      setError({
        title: "No structure loaded",
        message: "There are no coordinates to analyze yet.",
        nextStep: "Upload a .pdb/.cif/.mmcif file, load the sample, or fetch a structure by ID.",
      });
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatus({ label: "Analyzing structure", detail: "Sending coordinates to the backend contact pipeline." });

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
      if (paeText.trim()) {
        formData.append(
          "pae_file",
          new File([paeText], paeFileName || "pae.json", {
            type: "application/json",
          }),
        );
      }
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
      setResultsTab("overview");
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
      setError({
        title: "Analysis failed",
        message: caught instanceof Error ? caught.message : "The backend could not analyze this structure.",
        nextStep: "Confirm the file is valid PDB/mmCIF text, try a 3-5 A cutoff, or use an RCSB/AlphaFold fetch.",
      });
    } finally {
      setIsLoading(false);
      setStatus(null);
    }
  }

  async function fetchRcsbStructure() {
    const normalizedPdbId = pdbId.trim();
    if (!/^[a-zA-Z0-9]{4}$/.test(normalizedPdbId)) {
      setError({
        title: "Invalid PDB ID",
        message: "RCSB PDB IDs must be exactly 4 letters or numbers.",
        nextStep: "Enter an ID like 2HHB, 1A3N, or 7K00.",
      });
      return;
    }

    setIsRcsbLoading(true);
    setError(null);
    setStatus({ label: "Fetching RCSB entry", detail: `Downloading and analyzing ${normalizedPdbId.toUpperCase()} as mmCIF.` });
    setAnalysis(null);
    setSelection(null);
    setViewerColorMode("structure");
    setContactFilter("all");
    setResultsTab("overview");

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
      setResultsTab("overview");
      logTiming("rcsb fetch analysis", timingStarted, {
        request_ms,
        response_json_ms,
        backend: response.headers.get(TIMING_HEADER) ?? "not exposed",
        pdb_id: payload.analysis.metadata?.pdb_id ?? normalizedPdbId.toUpperCase(),
        bytes: payload.structure_text.length,
        contacts: payload.analysis.summary.contact_count,
      });
    } catch (caught) {
      setError({
        title: "RCSB fetch failed",
        message: caught instanceof Error ? caught.message : "The RCSB entry could not be fetched.",
        nextStep: "Check the PDB ID, try a current replacement entry, or upload the structure file directly.",
      });
    } finally {
      setIsRcsbLoading(false);
      setStatus(null);
    }
  }

  async function fetchAlphaFoldStructure() {
    const normalizedUniprotId = uniprotId.trim();
    if (!/^[a-zA-Z0-9]{6,10}$/.test(normalizedUniprotId)) {
      setError({
        title: "Invalid UniProt accession",
        message: "AlphaFold DB fetch expects a UniProt accession.",
        nextStep: "Enter an accession like P69905 or P68871.",
      });
      return;
    }

    setIsAlphaFoldLoading(true);
    setError(null);
    setStatus({
      label: "Fetching AlphaFold model",
      detail: `Downloading and analyzing the predicted model for ${normalizedUniprotId.toUpperCase()}.`,
    });
    setAnalysis(null);
    setSelection(null);
    setViewerColorMode("structure");
    setContactFilter("all");
    setResultsTab("overview");

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
      setResultsTab("overview");
      logTiming("alphafold fetch analysis", timingStarted, {
        request_ms,
        response_json_ms,
        backend: response.headers.get(TIMING_HEADER) ?? "not exposed",
        uniprot_id: payload.analysis.metadata?.uniprot_id ?? normalizedUniprotId.toUpperCase(),
        bytes: payload.structure_text.length,
        contacts: payload.analysis.summary.contact_count,
      });
    } catch (caught) {
      setError({
        title: "AlphaFold DB fetch failed",
        message: caught instanceof Error ? caught.message : "The AlphaFold DB model could not be fetched.",
        nextStep: "Check the UniProt accession, or upload an AlphaFold PDB/mmCIF file directly.",
      });
    } finally {
      setIsAlphaFoldLoading(false);
      setStatus(null);
    }
  }

  async function compareStructures() {
    if (!comparisonFileA || !comparisonFileB) {
      setError({
        title: "Comparison needs two files",
        message: "Both structure A and structure B are required.",
        nextStep: "Choose two .pdb, .cif, or .mmcif files before comparing.",
      });
      return;
    }
    if (!isStructureFile(comparisonFileA.name) || !isStructureFile(comparisonFileB.name)) {
      setError({
        title: "Unsupported comparison file",
        message: "Comparison currently accepts PDB and mmCIF coordinate files.",
        nextStep: "Choose two .pdb, .cif, or .mmcif files.",
      });
      return;
    }

    setIsComparisonLoading(true);
    setComparison(null);
    setError(null);
    setStatus({ label: "Comparing structures", detail: "Analyzing both files and calculating shared/gained/lost contacts." });

    try {
      const formData = new FormData();
      formData.append("file_a", comparisonFileA);
      formData.append("file_b", comparisonFileB);
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
    } catch (caught) {
      setError({
        title: "Comparison failed",
        message: caught instanceof Error ? caught.message : "The backend could not compare these structures.",
        nextStep: "Confirm both files are valid PDB/mmCIF coordinate files and try again.",
      });
    } finally {
      setIsComparisonLoading(false);
      setStatus(null);
    }
  }

  function reset() {
    setFileName("");
    setStructureText("");
    setStructureFormat("pdb");
    setPdbId("");
    setUniprotId("");
    setPaeFileName("");
    setPaeText("");
    setAnalysis(null);
    setComparison(null);
    setComparisonFileA(null);
    setComparisonFileB(null);
    setSelection(null);
    setViewerColorMode("structure");
    setContactFilter("all");
    setResultsTab("overview");
    setError(null);
    setStatus(null);
    setCutoff(4.0);
  }

  function exportCsv() {
    if (!contacts.length) {
      return;
    }

    downloadCsv(contactsToCsv(contacts), `${baseExportName(fileName) || "contacts"}-contacts.csv`);
  }

  function exportLigandCsv() {
    const ligandInteractions = analysis?.ligand_interactions ?? [];
    if (!ligandInteractions.length) {
      return;
    }

    downloadCsv(
      ligandInteractionsToCsv(ligandInteractions),
      `${baseExportName(fileName) || "ligands"}-ligand-interactions.csv`,
    );
  }

  function exportSingleLigandCsv(ligandInteraction: LigandInteractionSummary) {
    downloadCsv(
      ligandInteractionsToCsv([ligandInteraction]),
      `${baseExportName(fileName) || "ligand"}-${ligandInteraction.name}-${ligandInteraction.chain_id}-${ligandInteraction.residue_number}.csv`,
    );
  }

  return (
    <WorkbenchShell
      mode={mode}
      onModeChange={setMode}
      onLoadSample={loadExample}
      onReset={reset}
      onExport={exportCsv}
      canExport={contacts.length > 0}
    >
      {mode === "explore" ? (
        <>
        <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <ExploreSidebar
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
          />

          <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
            <StructureViewer
              structureText={structureText}
              structureFormat={structureFormat}
              selection={selection}
              residueConfidences={residueConfidences}
              colorMode={viewerColorMode}
            />
            <SelectionBar selection={selection} onClear={() => setSelection(null)} />
            <ResultsPanel
              activeTab={resultsTab}
              onTabChange={setResultsTab}
              analysis={analysis}
              comparison={comparison}
              chains={analysis?.chains ?? []}
              ligands={analysis?.ligands ?? []}
              contacts={filteredContactPreview}
              totalContactCount={filteredContacts.length}
              allContactCount={contacts.length}
              contactFilter={contactFilter}
              onContactFilterChange={setContactFilter}
              selection={selection}
              onChainSelect={(chain) =>
                setSelection({
                  kind: "chain",
                  chainId: chain.id,
                  label: `Chain ${chain.id}`,
                })
              }
              onLigandSelect={(ligand) =>
                setSelection({
                  kind: "ligand",
                  chainId: ligand.chain_id,
                  residueName: ligand.name,
                  residueNumber: ligand.residue_number,
                  label: `${ligand.name} ${ligand.chain_id}:${ligand.residue_number}`,
                })
              }
              onContactSelect={(contact) =>
                setSelection({
                  kind: "contact",
                  contact,
                  label: `${contact.chain_a}:${contact.residue_name_a}${contact.residue_a} - ${contact.chain_b}:${contact.residue_name_b}${contact.residue_b}`,
                })
              }
              residueConfidences={residueConfidences}
              viewerColorMode={viewerColorMode}
              onViewerColorModeChange={setViewerColorMode}
              onExportContacts={exportCsv}
              onExportLigands={exportLigandCsv}
              onExportSingleLigand={exportSingleLigandCsv}
              onLoadSample={loadExample}
              onFocusRcsb={() => document.getElementById("pdb-id")?.focus()}
              onFocusAlphaFold={() => document.getElementById("uniprot-id")?.focus()}
            />
          </section>
        </section>
        </>
      ) : (
        <WorkbenchModePlaceholder mode={mode} />
      )}
    </WorkbenchShell>
  );
}

function WorkbenchModePlaceholder({ mode }: { mode: Exclude<WorkbenchMode, "explore"> }) {
  const copy =
    mode === "compare"
      ? {
          title: "Compare workspace",
          body: "The comparison workflow is available in Explore for now. This mode is reserved for the upcoming dedicated structure A/B comparison workspace.",
        }
      : {
          title: "Report workspace",
          body: "Report mode is reserved for the upcoming clean analysis summary, provenance, and export workflow.",
        };

  return (
    <section className="border border-dashed border-slate-300 bg-white p-6">
      <p className="text-sm font-semibold text-slate-950">{copy.title}</p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{copy.body}</p>
    </section>
  );
}

function ResultsPanel({
  activeTab,
  onTabChange,
  analysis,
  comparison,
  chains,
  ligands,
  contacts,
  totalContactCount,
  allContactCount,
  contactFilter,
  onContactFilterChange,
  selection,
  onChainSelect,
  onLigandSelect,
  onContactSelect,
  residueConfidences,
  viewerColorMode,
  onViewerColorModeChange,
  onExportContacts,
  onExportLigands,
  onExportSingleLigand,
  onLoadSample,
  onFocusRcsb,
  onFocusAlphaFold,
}: {
  activeTab: ResultsTab;
  onTabChange: (tab: ResultsTab) => void;
  analysis: AnalysisResponse | null;
  comparison: StructureComparisonResponse | null;
  chains: ChainSummary[];
  ligands: LigandSummary[];
  contacts: ContactRecord[];
  totalContactCount: number;
  allContactCount: number;
  contactFilter: ContactFilter;
  onContactFilterChange: (filter: ContactFilter) => void;
  selection: ViewerSelection | null;
  onChainSelect: (chain: ChainSummary) => void;
  onLigandSelect: (ligand: LigandSummary) => void;
  onContactSelect: (contact: ContactRecord) => void;
  residueConfidences: ResidueConfidence[];
  viewerColorMode: ViewerColorMode;
  onViewerColorModeChange: (mode: ViewerColorMode) => void;
  onExportContacts: () => void;
  onExportLigands: () => void;
  onExportSingleLigand: (ligandInteraction: LigandInteractionSummary) => void;
  onLoadSample: () => void;
  onFocusRcsb: () => void;
  onFocusAlphaFold: () => void;
}) {
  const tabs: Array<{ id: ResultsTab; label: string; visible: boolean }> = [
    { id: "overview", label: "Overview", visible: true },
    { id: "chains", label: "Chains", visible: true },
    { id: "ligands", label: "Ligands", visible: true },
    { id: "contacts", label: "Contacts", visible: true },
    { id: "confidence", label: "Confidence", visible: Boolean(analysis?.confidence) },
    { id: "pae", label: "PAE", visible: Boolean(analysis?.pae) },
    { id: "quality", label: "Quality", visible: Boolean(analysis) },
  ];
  const visibleTabs = tabs.filter((tab) => tab.visible);
  const selectedTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : "overview";
  const selectedLigand =
    selection?.kind === "ligand"
      ? ligands.find(
          (ligand) =>
            ligand.name === selection.residueName &&
            ligand.chain_id === selection.chainId &&
            ligand.residue_number === selection.residueNumber,
        ) ?? null
      : null;
  const selectedLigandInteraction =
    selection?.kind === "ligand"
      ? analysis?.ligand_interactions.find(
          (ligand) =>
            ligand.name === selection.residueName &&
            ligand.chain_id === selection.chainId &&
            ligand.residue_number === selection.residueNumber,
        ) ?? null
      : null;

  return (
    <section className="min-w-0 border border-slate-200 bg-white">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 p-2" role="tablist" aria-label="Analysis results">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selectedTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            className={[
              "h-9 border px-3 text-sm font-medium",
              selectedTab === tab.id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-w-0 p-4">
        {selectedTab === "overview" ? (
          <div className="grid min-w-0 gap-4">
            {analysis ? (
              <>
                <MetadataPanel metadata={analysis.metadata ?? null} />
                <SummaryCards analysis={analysis} />
                <InteractionSummaryPanel summary={analysis.interaction_summary ?? null} />
                <StructureComparisonPanel comparison={comparison} />
              </>
            ) : (
              <EmptyWorkbenchState
                onLoadSample={onLoadSample}
                onFocusRcsb={onFocusRcsb}
                onFocusAlphaFold={onFocusAlphaFold}
              />
            )}
          </div>
        ) : null}

        {selectedTab === "chains" ? (
          <ChainTable chains={chains} selection={selection} onSelect={onChainSelect} />
        ) : null}

        {selectedTab === "ligands" ? (
          <div className="grid min-w-0 gap-4">
            <LigandTable ligands={ligands} selection={selection} onSelect={onLigandSelect} />
            <LigandDetailPanel
              ligand={selectedLigand}
              interaction={selectedLigandInteraction}
              onExport={onExportSingleLigand}
            />
            <LigandInteractionPanel ligandInteractions={analysis?.ligand_interactions ?? []} onExport={onExportLigands} />
          </div>
        ) : null}

        {selectedTab === "contacts" ? (
          <div className="min-w-0 border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Contacts</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Closest atom pair per categorized contact.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <ContactCategoryFilter value={contactFilter} onChange={onContactFilterChange} />
                <button
                  type="button"
                  onClick={onExportContacts}
                  disabled={!allContactCount}
                  className="inline-flex h-10 items-center justify-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
            </div>
            <ContactTable
              contacts={contacts}
              totalCount={totalContactCount}
              selection={selection}
              onSelect={onContactSelect}
            />
          </div>
        ) : null}

        {selectedTab === "confidence" ? (
          <ConfidencePanel
            confidence={analysis?.confidence ?? null}
            residueConfidences={residueConfidences}
            colorMode={viewerColorMode}
            onColorModeChange={onViewerColorModeChange}
          />
        ) : null}

        {selectedTab === "pae" ? <PaePanel pae={analysis?.pae ?? null} /> : null}

        {selectedTab === "quality" ? <QualityPanel analysis={analysis} /> : null}
      </div>
    </section>
  );
}

function EmptyWorkbenchState({
  onLoadSample,
  onFocusRcsb,
  onFocusAlphaFold,
}: {
  onLoadSample: () => void;
  onFocusRcsb: () => void;
  onFocusAlphaFold: () => void;
}) {
  return (
    <div className="border border-dashed border-slate-300 bg-slate-50 p-5">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold text-slate-950">Start a structure analysis</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Load experimental or predicted coordinates, inspect them in Mol*, then run distance-based contact and ligand
          summaries from the same workspace.
        </p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={onLoadSample}
          className="inline-flex h-11 items-center justify-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
        >
          <FileUp className="h-4 w-4" />
          Load sample
        </button>
        <button
          type="button"
          onClick={onFocusRcsb}
          className="inline-flex h-11 items-center justify-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
        >
          <Database className="h-4 w-4" />
          Fetch PDB ID
        </button>
        <button
          type="button"
          onClick={onFocusAlphaFold}
          className="inline-flex h-11 items-center justify-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
        >
          <Search className="h-4 w-4" />
          Fetch AlphaFold
        </button>
      </div>
    </div>
  );
}

function QualityPanel({ analysis }: { analysis: AnalysisResponse | null }) {
  if (!analysis) {
    return null;
  }

  const possibleClashes = analysis.interaction_summary?.possible_clash_count ?? 0;
  const veryCloseContacts = analysis.contacts.filter((contact) => contact.distance_angstrom < 2).length;
  const lowConfidence = analysis.confidence?.low_confidence_count ?? 0;
  const isPredicted = analysis.metadata?.source === "alphafold" || Boolean(analysis.confidence);
  const paeProvided = Boolean(analysis.pae);
  const hasLigands = analysis.summary.ligand_count > 0;
  const qualityItems = [
    {
      label: "Possible steric clashes",
      value: possibleClashes,
      status: possibleClashes > 0 ? "review" : "ok",
      detail:
        possibleClashes > 0
          ? "These are distance-based flags, not a full stereochemical validation."
          : "No possible clash contacts were flagged by the current distance cutoff.",
    },
    {
      label: "Very close contacts",
      value: veryCloseContacts,
      status: veryCloseContacts > 0 ? "review" : "ok",
      detail: "Atom pairs under 2 A are worth checking before interpreting contacts.",
    },
    {
      label: "Ligand state",
      value: hasLigands ? analysis.summary.ligand_count : "None",
      status: hasLigands ? "ok" : "info",
      detail: hasLigands
        ? "Ligands are available for interaction review."
        : "No non-water ligands were detected in this structure.",
    },
    {
      label: "Low-confidence residues",
      value: analysis.confidence ? lowConfidence : "N/A",
      status: lowConfidence > 0 ? "review" : "ok",
      detail: analysis.confidence
        ? "Low or very low pLDDT regions should not be over-interpreted."
        : "No pLDDT confidence data was detected for this structure.",
    },
    {
      label: "PAE sidecar",
      value: paeProvided ? "Provided" : "Not provided",
      status: isPredicted && !paeProvided ? "review" : "info",
      detail:
        isPredicted && !paeProvided
          ? "Predicted structures are easier to interpret with PAE when domain placement matters."
          : paeProvided
            ? "PAE summary is available in the PAE tab."
            : "PAE is usually relevant for AlphaFold-style predicted structures.",
    },
  ] as const;
  const warningRows = [
    ...analysis.warnings,
    ...(isPredicted && !paeProvided ? ["Predicted model has no PAE sidecar; treat domain-domain placement cautiously."] : []),
  ];
  const closeContactExamples = [
    ...(analysis.interaction_summary?.possible_clashes ?? []),
    ...analysis.contacts.filter((contact) => contact.distance_angstrom < 2),
  ]
    .filter((contact, index, rows) => rows.findIndex((row) => contactKey(row) === contactKey(contact)) === index)
    .slice(0, 6);

  return (
    <div className="grid gap-4">
      <div className="border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Quality</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Practical validation signals from existing contact, ligand, confidence, and PAE data. These checks flag
          review targets; they do not replace crystallographic validation, model-quality tools, or chemical perception.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {qualityItems.map((item) => (
            <QualityCheckCard key={item.label} {...item} />
          ))}
        </div>
      </div>

      {warningRows.length ? (
        <div className="border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-950">Warnings to review</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-6 text-amber-900">
            {warningRows.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-950">Close-contact examples</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Representative contacts flagged as possible clashes or under 2 A.
        </p>
        {closeContactExamples.length ? (
          <div className="mt-3 divide-y divide-slate-100 border border-slate-200">
            {closeContactExamples.map((contact) => (
              <div key={contactKey(contact)} className="grid gap-2 px-3 py-2 text-sm md:grid-cols-[1fr_1fr_auto]">
                <span className="font-mono text-slate-900">
                  {contact.chain_a}:{contact.residue_name_a}
                  {contact.residue_a}.{contact.atom_a}
                </span>
                <span className="font-mono text-slate-900">
                  {contact.chain_b}:{contact.residue_name_b}
                  {contact.residue_b}.{contact.atom_b}
                </span>
                <span className="font-mono text-slate-700">{contact.distance_angstrom.toFixed(3)} A</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No close-contact examples were flagged by the current analysis.</p>
        )}
      </div>
    </div>
  );
}

function QualityCheckCard({
  label,
  value,
  status,
  detail,
}: {
  label: string;
  value: string | number;
  status: "ok" | "review" | "info";
  detail: string;
}) {
  const tone =
    status === "review"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : status === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
        : "border-slate-200 bg-slate-50 text-slate-950";

  return (
    <div className={`border p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
        <span className="font-mono text-sm font-semibold">{value}</span>
      </div>
      <p className="mt-2 text-xs leading-5">{detail}</p>
    </div>
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

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function baseExportName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

function isStructureFile(fileName: string) {
  return /\.(pdb|cif|mmcif)$/i.test(fileName);
}

function formatSignedNumber(value: number) {
  if (value > 0) {
    return `+${value}`;
  }
  return String(value);
}

function formatOptionalDistance(value: number | null) {
  return value === null ? "-" : `${value.toFixed(3)} A`;
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

function PaePanel({ pae }: { pae: PaeSummary | null }) {
  if (!pae) {
    return null;
  }

  const items = [
    ["Residues", pae.residue_count],
    ["Mean PAE", `${pae.mean_predicted_aligned_error.toFixed(2)} A`],
    ["Max PAE", `${pae.max_predicted_aligned_error.toFixed(2)} A`],
    [`Pairs >= ${pae.high_error_threshold.toFixed(1)} A`, pae.high_error_pair_count],
  ];

  return (
    <div className="border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-950">PAE sidecar</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Predicted aligned error summary from the uploaded JSON sidecar.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="border border-slate-200 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 font-mono text-sm text-slate-950">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StructureComparisonPanel({ comparison }: { comparison: StructureComparisonResponse | null }) {
  if (!comparison) {
    return null;
  }

  const deltaItems = [
    ["Atoms", comparison.delta.atom_count_delta],
    ["Protein residues", comparison.delta.residue_count_delta],
    ["Chains", comparison.delta.chain_count_delta],
    ["Ligands", comparison.delta.ligand_count_delta],
    ["Contacts", comparison.delta.contact_count_delta],
  ];

  return (
    <div className="border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-950">Structure comparison</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Deltas are calculated as second structure minus first structure. Contact comparison uses residue-level contact identities.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {deltaItems.map(([label, value]) => (
          <div key={label} className="border border-slate-200 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 font-mono text-sm ${Number(value) === 0 ? "text-slate-950" : Number(value) > 0 ? "text-emerald-700" : "text-red-700"}`}>
              {formatSignedNumber(Number(value))}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <ComparisonCount label="Shared contacts" value={comparison.contacts.shared_contact_count} />
        <ComparisonCount label="Gained contacts" value={comparison.contacts.gained_contact_count} />
        <ComparisonCount label="Lost contacts" value={comparison.contacts.lost_contact_count} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <ContactDifferenceList title="Gained contacts" rows={comparison.contacts.gained_contacts} />
        <ContactDifferenceList title="Lost contacts" rows={comparison.contacts.lost_contacts} />
        <ContactDifferenceList title="Shared examples" rows={comparison.contacts.shared_contacts} />
      </div>
      {comparison.warnings.length ? (
        <ul className="mt-4 list-inside list-disc text-xs leading-5 text-amber-800">
          {comparison.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ComparisonCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border border-slate-200 px-3 py-2">
      <span className="text-sm text-slate-700">{label}</span>
      <span className="font-mono text-sm text-slate-950">{value}</span>
    </div>
  );
}

function ContactDifferenceList({ title, rows }: { title: string; rows: StructureComparisonResponse["contacts"]["gained_contacts"] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      {rows.length ? (
        <div className="mt-2 divide-y divide-slate-100 border border-slate-200">
          {rows.map((row) => (
            <div key={`${row.label}-${row.contact_type}-${row.distance_a_angstrom ?? ""}-${row.distance_b_angstrom ?? ""}`} className="px-3 py-2">
              <p className="font-mono text-xs text-slate-950">{row.label}</p>
              <p className="mt-1 text-xs text-slate-500">
                {row.contact_type} · {row.contact_categories.join(", ")}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-700">
                A: {formatOptionalDistance(row.distance_a_angstrom)} / B: {formatOptionalDistance(row.distance_b_angstrom)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No rows.</p>
      )}
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

function LigandInteractionPanel({
  ligandInteractions,
  onExport,
}: {
  ligandInteractions: LigandInteractionSummary[];
  onExport: () => void;
}) {
  if (!ligandInteractions.length) {
    return null;
  }

  return (
    <div className="border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Ligand interaction summary</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Per-ligand contact counts, closest atom pair, contacting residues, and distance distribution.
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex h-10 items-center justify-center gap-2 border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
        >
          <Download className="h-4 w-4" />
          Export ligand CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Ligand</th>
              <th className="px-4 py-3 font-medium">Contacts</th>
              <th className="px-4 py-3 font-medium">Protein</th>
              <th className="px-4 py-3 font-medium">Water</th>
              <th className="px-4 py-3 font-medium">Clashes</th>
              <th className="px-4 py-3 font-medium">Closest</th>
              <th className="px-4 py-3 font-medium">Top residues</th>
              <th className="px-4 py-3 font-medium">Distance buckets</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ligandInteractions.map((ligand) => (
              <tr key={`${ligand.name}-${ligand.chain_id}-${ligand.residue_number}`}>
                <td className="px-4 py-3 font-mono text-slate-950">
                  {ligand.name} {ligand.chain_id}:{ligand.residue_number}
                </td>
                <td className="px-4 py-3 font-mono text-slate-800">{ligand.contact_count}</td>
                <td className="px-4 py-3 font-mono text-slate-800">{ligand.protein_contact_count}</td>
                <td className="px-4 py-3 font-mono text-slate-800">{ligand.water_contact_count}</td>
                <td className="px-4 py-3 font-mono text-slate-800">{ligand.possible_clash_count}</td>
                <td className="px-4 py-3 text-slate-700">
                  {ligand.closest_contact && ligand.closest_distance_angstrom !== null ? (
                    <span className="font-mono">
                      {ligand.closest_distance_angstrom.toFixed(3)} A, {ligand.closest_contact.atom_a}-
                      {ligand.closest_contact.atom_b}
                    </span>
                  ) : (
                    "None"
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {ligand.contacting_residues.length
                    ? ligand.contacting_residues
                        .map((residue) => `${residue.chain_id}:${residue.residue_name}${residue.residue_number} (${residue.contact_count})`)
                        .join(", ")
                    : "None"}
                </td>
                <td className="px-4 py-3 font-mono text-slate-700">
                  &lt;2:{ligand.distance_distribution.under_2_angstrom} / 2-3:
                  {ligand.distance_distribution.two_to_3_angstrom} / 3-4:
                  {ligand.distance_distribution.three_to_4_angstrom} / &gt;4:
                  {ligand.distance_distribution.over_4_angstrom}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LigandDetailPanel({
  ligand,
  interaction,
  onExport,
}: {
  ligand: LigandSummary | null;
  interaction: LigandInteractionSummary | null;
  onExport: (ligandInteraction: LigandInteractionSummary) => void;
}) {
  if (!ligand) {
    return (
      <div className="border border-dashed border-slate-300 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-950">Ligand detail</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Select a ligand row to inspect its contacts, closest atom pair, distance buckets, and contacting residues.
        </p>
      </div>
    );
  }

  const closestContact = interaction?.closest_contact ?? null;
  const buckets = interaction?.distance_distribution ?? {
    under_2_angstrom: 0,
    two_to_3_angstrom: 0,
    three_to_4_angstrom: 0,
    over_4_angstrom: 0,
  };
  const metrics: Array<[string, string | number]> = [
    ["Chain", ligand.chain_id],
    ["Residue", ligand.residue_number],
    ["Atoms", ligand.atom_count],
    ["Protein contacts", interaction?.protein_contact_count ?? 0],
    ["Water contacts", interaction?.water_contact_count ?? 0],
    ["Possible clashes", interaction?.possible_clash_count ?? 0],
  ];

  return (
    <div className="border border-cyan-200 bg-cyan-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-cyan-700">Ligand detail</p>
          <h2 className="mt-1 font-mono text-lg font-semibold text-slate-950">
            {ligand.name} {ligand.chain_id}:{ligand.residue_number}
          </h2>
          <p className="mt-1 text-xs leading-5 text-cyan-900">
            Selecting this ligand highlights it in Mol* and keeps the detailed interaction summary in view.
          </p>
        </div>
        <button
          type="button"
          onClick={() => interaction && onExport(interaction)}
          disabled={!interaction}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 border border-cyan-300 bg-white px-3 text-sm font-medium text-cyan-950 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          <Download className="h-4 w-4" />
          Export this ligand
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="border border-cyan-200 bg-white/80 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-cyan-700">{label}</p>
            <p className="mt-1 font-mono text-sm text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="border border-cyan-200 bg-white/80 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-cyan-700">Closest contact</p>
          {closestContact && interaction?.closest_distance_angstrom !== null ? (
            <div className="mt-2 text-sm text-slate-800">
              <p className="font-mono text-slate-950">{interaction?.closest_distance_angstrom.toFixed(3)} A</p>
              <p className="mt-1 font-mono text-xs">
                {closestContact.chain_a}:{closestContact.residue_name_a}
                {closestContact.residue_a}.{closestContact.atom_a} - {closestContact.chain_b}:
                {closestContact.residue_name_b}
                {closestContact.residue_b}.{closestContact.atom_b}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No contacts detected for this ligand.</p>
          )}
        </div>

        <div className="border border-cyan-200 bg-white/80 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-cyan-700">Distance buckets</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <DistanceBucket label="<2 A" value={buckets.under_2_angstrom} />
            <DistanceBucket label="2-3 A" value={buckets.two_to_3_angstrom} />
            <DistanceBucket label="3-4 A" value={buckets.three_to_4_angstrom} />
            <DistanceBucket label=">4 A" value={buckets.over_4_angstrom} />
          </div>
        </div>
      </div>

      <div className="mt-4 border border-cyan-200 bg-white/80 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-cyan-700">Contacting residues</p>
        {interaction?.contacting_residues.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {interaction.contacting_residues.map((residue) => (
              <span
                key={`${residue.chain_id}-${residue.residue_name}-${residue.residue_number}`}
                className="inline-flex border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-800"
              >
                {residue.chain_id}:{residue.residue_name}
                {residue.residue_number} ({residue.contact_count})
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No protein residues are within the current cutoff for this ligand.</p>
        )}
      </div>
    </div>
  );
}

function DistanceBucket({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border border-slate-200 bg-white px-2 py-1">
      <span className="font-mono text-xs text-slate-600">{label}</span>
      <span className="font-mono text-xs text-slate-950">{value}</span>
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

  const details = selectionDetails(selection);

  return (
    <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Selected in table and Mol*</p>
          <p className="mt-1 font-mono text-sm font-semibold">{selection.label}</p>
          <p className="mt-2 text-xs leading-5 text-amber-800">
            Mol* focuses the selected chain, ligand, or contact partners automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 border border-amber-300 bg-white px-3 text-sm font-medium text-amber-950 hover:bg-amber-100"
        >
          <X className="h-4 w-4" />
          Clear selection
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {details.map(([label, value]) => (
          <div key={label} className="border border-amber-200 bg-white/70 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700">{label}</p>
            <p className="mt-1 break-words font-mono text-sm text-amber-950">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function selectionDetails(selection: ViewerSelection): Array<[string, string]> {
  if (selection.kind === "chain") {
    return [
      ["Type", "Chain"],
      ["Chain", selection.chainId],
    ];
  }

  if (selection.kind === "ligand") {
    return [
      ["Type", "Ligand"],
      ["Chain", selection.chainId],
      ["Residue", `${selection.residueName} ${selection.residueNumber}`],
    ];
  }

  const contact = selection.contact;
  return [
    ["Type", contact.contact_type],
    ["Partner A", `${contact.chain_a}:${contact.residue_name_a}${contact.residue_a}.${contact.atom_a}`],
    ["Partner B", `${contact.chain_b}:${contact.residue_name_b}${contact.residue_b}.${contact.atom_b}`],
    ["Distance", `${contact.distance_angstrom.toFixed(3)} A`],
    ["Categories", contact.contact_categories.join(", ")],
  ];
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
              {chains.map((chain) => {
                const selected = selection?.kind === "chain" && selection.chainId === chain.id;

                return (
                <tr
                  key={chain.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onClick={() => onSelect(chain)}
                  onKeyDown={(event) => handleSelectableRowKeyDown(event, () => onSelect(chain))}
                  className={selectableRowClass(selected)}
                >
                  <td className="w-12 px-4 py-3">
                    <SelectionButton selected={selected} label={`Select chain ${chain.id}`} onClick={() => onSelect(chain)} />
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-900">{chain.id}</td>
                  <td className="px-4 py-3 text-slate-800">{chain.residue_count}</td>
                  <td className="px-4 py-3 text-slate-800">{chain.atom_count}</td>
                </tr>
                );
              })}
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
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    onClick={() => onSelect(ligand)}
                    onKeyDown={(event) => handleSelectableRowKeyDown(event, () => onSelect(ligand))}
                    className={selectableRowClass(selected)}
                  >
                    <td className="w-12 px-4 py-3">
                      <SelectionButton
                        selected={selected}
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
          {contacts.map((contact) => {
            const selected = selection?.kind === "contact" && contactKey(selection.contact) === contactKey(contact);

            return (
              <tr
                key={contactKey(contact)}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => onSelect(contact)}
                onKeyDown={(event) => handleSelectableRowKeyDown(event, () => onSelect(contact))}
                className={selectableRowClass(selected)}
              >
                <td className="w-12 px-4 py-3">
                  <SelectionButton
                    selected={selected}
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
    "cursor-pointer text-slate-800 outline-none hover:bg-cyan-50 focus:bg-cyan-50",
    selected ? "bg-amber-50 ring-2 ring-inset ring-amber-400 hover:bg-amber-50 focus:bg-amber-50" : "",
  ].join(" ");
}

function SelectionButton({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className={[
        "inline-flex h-8 w-8 items-center justify-center border focus:outline-none focus:ring-2 focus:ring-cyan-600",
        selected
          ? "border-amber-400 bg-amber-100 text-amber-950"
          : "border-slate-300 bg-white text-slate-700 hover:bg-cyan-50",
      ].join(" ")}
    >
      <Atom className="h-4 w-4" />
    </button>
  );
}

function handleSelectableRowKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>, onSelect: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect();
  }
}

function contactKey(contact: ContactRecord) {
  return [
    contact.contact_type,
    contact.chain_a,
    contact.residue_a,
    contact.residue_name_a,
    contact.atom_a,
    contact.chain_b,
    contact.residue_b,
    contact.residue_name_b,
    contact.atom_b,
    contact.distance_angstrom.toFixed(3),
  ].join("-");
}
