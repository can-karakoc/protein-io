"use client";

import { Atom, Database, Download, FileUp, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

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
const APP_VERSION = "0.1.0";
const EMPTY_RESIDUE_CONFIDENCES: ResidueConfidence[] = [];
type StructureFileFormat = "pdb" | "cif";
type ViewerColorMode = "structure" | "plddt";
type ContactFilter = "all" | ContactCategory | "low-confidence";
type ResultsTab = "overview" | "chains" | "ligands" | "contacts" | "confidence" | "pae" | "quality" | "methods";
type InputSource = "upload" | "sample" | "rcsb" | "alphafold";
type WorkbenchError = {
  title: string;
  message: string;
  nextStep: string;
} | null;
type WorkbenchStatus = {
  label: string;
  detail: string;
} | null;
type ProvenanceRecord = {
  inputSource: InputSource;
  sourceId: string;
  fileName: string;
  fileFormat: string;
  parser: string;
  contactCutoffAngstrom: number;
  contactMethod: string;
  appVersion: string;
  analysisTimestamp: string;
  warnings: string[];
  paeProvided: boolean;
  structureKind: "experimental" | "predicted" | "uploaded coordinates";
};
type ExampleId = "sample" | "hemoglobin" | "ligand-bound" | "large-structure" | "alphafold" | "comparison";
type ExampleCard = {
  id: ExampleId;
  title: string;
  source: string;
  description: string;
  tags: string[];
  hint: string;
  actionLabel: string;
};

const EXAMPLE_GALLERY: ExampleCard[] = [
  {
    id: "sample",
    title: "Bundled ligand sample",
    source: "Local sample.pdb",
    description: "Small fast-loading structure for checking the full upload, viewer, contact, and ligand flow.",
    tags: ["local", "ligand", "fast"],
    hint: "Look at ligand ATP and the possible clash flags in Quality.",
    actionLabel: "Load sample",
  },
  {
    id: "hemoglobin",
    title: "Hemoglobin",
    source: "RCSB 2HHB",
    description: "Classic multi-chain experimental structure for chain metadata and inter-chain contacts.",
    tags: ["RCSB", "experimental", "multi-chain"],
    hint: "Compare chain counts, heme ligands, and inter-chain contact categories.",
    actionLabel: "Load 2HHB",
  },
  {
    id: "ligand-bound",
    title: "Ligand-bound protein",
    source: "RCSB 1A3N",
    description: "Experimental structure useful for ligand interaction summaries and residue contact review.",
    tags: ["RCSB", "ligand", "contacts"],
    hint: "Open the Ligands tab and inspect closest contacts and distance buckets.",
    actionLabel: "Load 1A3N",
  },
  {
    id: "large-structure",
    title: "Large deposited structure",
    source: "RCSB 7K00",
    description: "Larger deposited coordinates for stress-testing loading, Mol* rendering, and summary tables.",
    tags: ["RCSB", "large", "performance"],
    hint: "Watch render responsiveness and use contact filters to narrow the table.",
    actionLabel: "Load 7K00",
  },
  {
    id: "alphafold",
    title: "AlphaFold prediction",
    source: "AlphaFold DB P69905",
    description: "Predicted hemoglobin alpha-chain model with pLDDT confidence coloring and contact warnings.",
    tags: ["AlphaFold", "pLDDT", "predicted"],
    hint: "Use Confidence, Quality, and low-confidence contact filters after analysis.",
    actionLabel: "Load P69905",
  },
  {
    id: "comparison",
    title: "Comparison starter",
    source: "Bundled sample pair",
    description: "Preloads two local sample files into the comparison inputs so the compare endpoint is ready to run.",
    tags: ["compare", "local", "starter"],
    hint: "Run Compare structures, then review shared/gained/lost contact examples.",
    actionLabel: "Prepare compare",
  },
];

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
  const [inputSource, setInputSource] = useState<InputSource>("upload");
  const [analysisTimestamp, setAnalysisTimestamp] = useState<string | null>(null);
  const [error, setError] = useState<WorkbenchError>(null);
  const [status, setStatus] = useState<WorkbenchStatus>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRcsbLoading, setIsRcsbLoading] = useState(false);
  const [isAlphaFoldLoading, setIsAlphaFoldLoading] = useState(false);
  const [isComparisonLoading, setIsComparisonLoading] = useState(false);

  const hasStructure = structureText.trim().length > 0;
  const contacts = useMemo(() => analysis?.contacts ?? [], [analysis]);
  const residueConfidences = analysis?.residue_confidences ?? EMPTY_RESIDUE_CONFIDENCES;
  const confidenceByResidue = useMemo(() => buildConfidenceLookup(residueConfidences), [residueConfidences]);
  const confidenceAwareContacts = useMemo(
    () => contacts.map((contact) => enrichContactConfidence(contact, confidenceByResidue)),
    [confidenceByResidue, contacts],
  );
  const hasContactConfidence = residueConfidences.length > 0;
  const lowConfidenceContactCount = useMemo(
    () => confidenceAwareContacts.filter((contact) => contact.confidence_warning).length,
    [confidenceAwareContacts],
  );
  const filteredContacts = useMemo(
    () =>
      contactFilter === "all"
        ? confidenceAwareContacts
        : contactFilter === "low-confidence"
          ? confidenceAwareContacts.filter((contact) => contact.confidence_warning)
          : confidenceAwareContacts.filter((contact) => contact.contact_categories.includes(contactFilter)),
    [confidenceAwareContacts, contactFilter],
  );
  const filteredContactPreview = useMemo(() => filteredContacts.slice(0, 80), [filteredContacts]);
  const provenance = useMemo(
    () =>
      analysis
        ? buildProvenanceRecord({
            analysis,
            inputSource,
            fileName,
            structureFormat,
            cutoff,
            analysisTimestamp,
            paeFileName,
          })
        : null,
    [analysis, analysisTimestamp, cutoff, fileName, inputSource, paeFileName, structureFormat],
  );

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
    setAnalysisTimestamp(null);
    setSelection(null);
    setViewerColorMode("structure");
    setContactFilter("all");
    setResultsTab("overview");
    setPaeFileName("");
    setPaeText("");
    setFileName(file.name);
    setStructureFormat(formatFromFileName(file.name));
    setInputSource("upload");
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
    setAnalysisTimestamp(null);
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
      setInputSource("sample");
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
    setAnalysisTimestamp(null);
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
      setAnalysisTimestamp(new Date().toISOString());
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

  async function fetchRcsbStructure(targetPdbId = pdbId) {
    const normalizedPdbId = targetPdbId.trim();
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
    setAnalysisTimestamp(null);
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

      setPdbId(normalizedPdbId.toUpperCase());
      setFileName(payload.filename);
      setStructureText(payload.structure_text);
      setStructureFormat(payload.structure_format);
      setAnalysis(payload.analysis);
      setAnalysisTimestamp(new Date().toISOString());
      setInputSource("rcsb");
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

  async function fetchAlphaFoldStructure(targetUniprotId = uniprotId) {
    const normalizedUniprotId = targetUniprotId.trim();
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
    setAnalysisTimestamp(null);
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

      setUniprotId(normalizedUniprotId.toUpperCase());
      setFileName(payload.filename);
      setStructureText(payload.structure_text);
      setStructureFormat(payload.structure_format);
      setAnalysis(payload.analysis);
      setAnalysisTimestamp(new Date().toISOString());
      setInputSource("alphafold");
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

  async function prepareComparisonExample() {
    const timingStarted = performance.now();
    setError(null);
    setStatus({ label: "Preparing comparison example", detail: "Loading bundled sample structures into A/B inputs." });
    setComparison(null);

    try {
      const response = await fetch(EXAMPLE_FILE);
      if (!response.ok) {
        throw new Error(`Sample returned status ${response.status}.`);
      }
      const text = await response.text();
      setComparisonFileA(new File([text], "sample-a.pdb", { type: "chemical/x-pdb" }));
      setComparisonFileB(new File([text], "sample-b.pdb", { type: "chemical/x-pdb" }));
      setMode("explore");
      logTiming("comparison example load", timingStarted, {
        bytes: text.length,
      });
    } catch (caught) {
      setError({
        title: "Could not prepare comparison example",
        message: caught instanceof Error ? caught.message : "The bundled comparison sample could not be loaded.",
        nextStep: "Try choosing two local PDB/mmCIF files in the Structure comparison section.",
      });
    } finally {
      setStatus(null);
    }
  }

  function loadGalleryExample(exampleId: ExampleId) {
    if (exampleId === "sample") {
      void loadExample();
      return;
    }
    if (exampleId === "hemoglobin") {
      void fetchRcsbStructure("2HHB");
      return;
    }
    if (exampleId === "ligand-bound") {
      void fetchRcsbStructure("1A3N");
      return;
    }
    if (exampleId === "large-structure") {
      void fetchRcsbStructure("7K00");
      return;
    }
    if (exampleId === "alphafold") {
      void fetchAlphaFoldStructure("P69905");
      return;
    }
    void prepareComparisonExample();
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
    setAnalysisTimestamp(null);
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

    downloadCsv(contactsToCsv(confidenceAwareContacts), `${baseExportName(fileName) || "contacts"}-contacts.csv`);
  }

  function exportAnalysisJson() {
    if (!analysis) {
      return;
    }

    const payload = {
      generated_at: new Date().toISOString(),
      app_version: APP_VERSION,
      provenance,
      analysis: {
        ...analysis,
        contacts: confidenceAwareContacts,
      },
    };
    downloadText(
      JSON.stringify(payload, null, 2),
      `${baseExportName(fileName) || "analysis"}-analysis.json`,
      "application/json;charset=utf-8",
    );
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

  const isAnyLoading = isLoading || isRcsbLoading || isAlphaFoldLoading;
  const viewerStatusLabel = isRcsbLoading
    ? "Fetching from RCSB…"
    : isAlphaFoldLoading
      ? "Fetching from AlphaFold…"
      : isLoading
        ? "Analyzing…"
        : null;

  return (
    <>
      {/* SVG filter for the loading blob */}
      <svg className="absolute h-0 w-0 overflow-hidden" aria-hidden="true">
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

    <WorkbenchShell
      mode={mode}
      onModeChange={setMode}
    >
      {mode === "explore" ? (
        <div
          className="grid h-full min-w-0"
          style={{ gridTemplateColumns: "260px 1fr 340px" }}
        >
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
          />

          {/* Viewer column */}
          <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--pio-sage)]">
            <div className="min-h-0 flex-1">
              <StructureViewer
                structureText={structureText}
                structureFormat={structureFormat}
                selection={selection}
                residueConfidences={residueConfidences}
                colorMode={viewerColorMode}
              />
            </div>
            <div className="shrink-0 flex flex-col gap-2 p-2">
              <ViewerModeToggle
                colorMode={viewerColorMode}
                hasConfidence={residueConfidences.length > 0}
                onColorModeChange={setViewerColorMode}
              />
              <SelectionBar selection={selection} onClear={() => setSelection(null)} />
            </div>
            {/* Loading overlay */}
            {isAnyLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--pio-sage)]">
                <svg
                  viewBox="0 0 100 100"
                  className="pio-loading-pulse h-14 w-14 text-[var(--pio-green-deep)]"
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

          {/* Results column */}
          <section className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-[var(--pio-line)]">
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
              hasContactConfidence={hasContactConfidence}
              lowConfidenceContactCount={lowConfidenceContactCount}
              provenance={provenance}
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
              onLoadExample={loadGalleryExample}
              onFocusRcsb={() => document.getElementById("pdb-id")?.focus()}
              onFocusAlphaFold={() => document.getElementById("uniprot-id")?.focus()}
            />
          </section>
        </div>
      ) : mode === "report" ? (
        <div className="h-full overflow-y-auto">
          <ReportWorkspace
            analysis={analysis}
            provenance={provenance}
            contacts={confidenceAwareContacts}
            onExportContacts={exportCsv}
            onExportLigands={exportLigandCsv}
            onExportAnalysisJson={exportAnalysisJson}
            onLoadSample={loadExample}
            onFocusRcsb={() => {
              setMode("explore");
              window.requestAnimationFrame(() => document.getElementById("pdb-id")?.focus());
            }}
            onFocusAlphaFold={() => {
              setMode("explore");
              window.requestAnimationFrame(() => document.getElementById("uniprot-id")?.focus());
            }}
          />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-8">
          <WorkbenchModePlaceholder />
        </div>
      )}
    </WorkbenchShell>

    {/* ── Example gallery — always visible below the workbench ── */}
    <section className="mx-auto w-full max-w-[1500px] px-6 py-10">
      <p className="pio-label mb-1">Example gallery</p>
      <p className="pio-section-copy mb-6">Guided structures for quickly testing common workflows.</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {EXAMPLE_GALLERY.map((card) => (
          <div
            key={card.id}
            className="flex flex-col rounded-[var(--pio-radius-lg)] bg-[var(--pio-sand)] p-3"
          >
            <div className="mb-3 flex h-20 items-center justify-center rounded-[var(--pio-radius-md)] bg-[var(--pio-sage)]">
              <svg
                viewBox="0 0 100 100"
                className="pio-loading-pulse h-10 w-10 text-[var(--pio-green-deep)]"
                aria-hidden="true"
              >
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
                <span key={tag} className="pio-badge pio-badge-neutral px-2 py-0.5 text-[10px]">
                  {tag}
                </span>
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
}

function WorkbenchModePlaceholder() {
  return (
    <section className="pio-panel mx-auto grid max-w-2xl justify-items-center gap-4 p-8 text-center">
      <Atom className="h-10 w-10 text-[var(--pio-ink)]" />
      <p className="text-xl font-bold text-[var(--pio-ink)]">Compare workspace is coming next</p>
      <p className="max-w-xl text-sm leading-6 text-[var(--pio-graphite)]">
        The comparison workflow is available in Explore for now. This mode is reserved for the upcoming dedicated
        structure A/B comparison workspace.
      </p>
      <p className="pio-badge pio-badge-caution">
        No structural alignment. No RMSD. No TM-score. No side-by-side 3D superposition yet.
      </p>
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
  hasContactConfidence,
  lowConfidenceContactCount,
  provenance,
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
  onLoadExample,
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
  hasContactConfidence: boolean;
  lowConfidenceContactCount: number;
  provenance: ProvenanceRecord | null;
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
  onLoadExample: (exampleId: ExampleId) => void;
  onFocusRcsb: () => void;
  onFocusAlphaFold: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const tabs: Array<{ id: ResultsTab; label: string; visible: boolean }> = [
    { id: "overview", label: "Overview", visible: true },
    { id: "chains", label: "Chains", visible: true },
    { id: "ligands", label: "Ligands", visible: true },
    { id: "contacts", label: "Contacts", visible: true },
    { id: "confidence", label: "Confidence", visible: Boolean(analysis?.confidence) },
    { id: "pae", label: "PAE", visible: Boolean(analysis?.pae) },
    { id: "quality", label: "Quality", visible: Boolean(analysis) },
    { id: "methods", label: "Methods", visible: Boolean(analysis) },
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

  function preservePanelPosition(update: () => void) {
    const previousTop = panelRef.current?.getBoundingClientRect().top ?? null;
    update();
    window.requestAnimationFrame(() => {
      if (previousTop === null || !panelRef.current) {
        return;
      }
      const nextTop = panelRef.current.getBoundingClientRect().top;
      const delta = nextTop - previousTop;
      if (Math.abs(delta) > 1) {
        window.scrollBy({ top: delta, left: 0, behavior: "auto" });
      }
    });
  }

  return (
    <section ref={panelRef} className="pio-panel min-w-0 overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-[var(--pio-line)] bg-[var(--pio-paper)] p-3" role="tablist" aria-label="Analysis results">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selectedTab === tab.id}
            onClick={() => preservePanelPosition(() => onTabChange(tab.id))}
            className={[
              "h-9 rounded-[var(--pio-radius-sm)] px-3 text-sm font-semibold transition-colors",
              selectedTab === tab.id
                ? "bg-[var(--pio-ink)] text-[var(--pio-white)]"
                : "text-[var(--pio-graphite)] hover:bg-[var(--pio-sand)] hover:text-[var(--pio-ink)]",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-w-0 overflow-hidden p-4">
        {selectedTab === "overview" ? (
          <div className="grid min-w-0 max-w-full gap-4 overflow-hidden">
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
                onLoadExample={onLoadExample}
                onFocusRcsb={onFocusRcsb}
                onFocusAlphaFold={onFocusAlphaFold}
              />
            )}
          </div>
        ) : null}

        {selectedTab === "chains" ? (
          <ChainTable
            chains={chains}
            selection={selection}
            onSelect={onChainSelect}
          />
        ) : null}

        {selectedTab === "ligands" ? (
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
            <div className="grid min-w-0 gap-4">
              <LigandTable
                ligands={ligands}
                selection={selection}
                onSelect={onLigandSelect}
              />
              <LigandInteractionPanel ligandInteractions={analysis?.ligand_interactions ?? []} onExport={onExportLigands} />
            </div>
            <div className="min-w-0 xl:sticky xl:top-4">
              <LigandDetailPanel
                ligand={selectedLigand}
                interaction={selectedLigandInteraction}
                onExport={onExportSingleLigand}
              />
            </div>
          </div>
        ) : null}

        {selectedTab === "contacts" ? (
          <div className="pio-table-card min-w-0">
            <div className="flex flex-col gap-3 border-b border-[var(--pio-line)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="pio-section-title">Contacts</h2>
                <p className="pio-section-copy mt-1">
                  Closest atom pair per categorized contact.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <ContactCategoryFilter
                  value={contactFilter}
                  onChange={onContactFilterChange}
                  showLowConfidence={hasContactConfidence}
                />
                <button
                  type="button"
                  onClick={onExportContacts}
                  disabled={!allContactCount}
                  className="pio-button-secondary h-10 px-4"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
            </div>
            {hasContactConfidence ? (
              <ContactConfidenceSummary
                lowConfidenceContactCount={lowConfidenceContactCount}
                totalContactCount={allContactCount}
              />
            ) : null}
            <ContactTable
              contacts={contacts}
              totalCount={totalContactCount}
              selection={selection}
              onSelect={onContactSelect}
              showConfidence={hasContactConfidence}
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

        {selectedTab === "methods" ? <ProvenancePanel provenance={provenance} /> : null}
      </div>
    </section>
  );
}

function ReportWorkspace({
  analysis,
  provenance,
  contacts,
  onExportContacts,
  onExportLigands,
  onExportAnalysisJson,
  onLoadSample,
  onFocusRcsb,
  onFocusAlphaFold,
}: {
  analysis: AnalysisResponse | null;
  provenance: ProvenanceRecord | null;
  contacts: ContactRecord[];
  onExportContacts: () => void;
  onExportLigands: () => void;
  onExportAnalysisJson: () => void;
  onLoadSample: () => void;
  onFocusRcsb: () => void;
  onFocusAlphaFold: () => void;
}) {
  if (!analysis) {
    return (
      <section className="pio-panel p-6">
        <p className="pio-section-title">No reportable analysis yet</p>
        <p className="pio-section-copy mt-2 max-w-2xl">
          Load and analyze a structure first, then return here for a concise summary with methods and provenance.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={onLoadSample} className="pio-button-secondary h-10">
            Load sample
          </button>
          <button type="button" onClick={onFocusRcsb} className="pio-button-secondary h-10">
            Fetch PDB ID
          </button>
          <button type="button" onClick={onFocusAlphaFold} className="pio-button-secondary h-10">
            Fetch AlphaFold
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="grid min-w-0 gap-4">
      <ReportHeader
        analysis={analysis}
        provenance={provenance}
        onExportContacts={onExportContacts}
        onExportLigands={onExportLigands}
        onExportAnalysisJson={onExportAnalysisJson}
      />
      <MetadataPanel metadata={analysis.metadata ?? null} />
      <SummaryCards analysis={analysis} />
      <InteractionSummaryPanel summary={analysis.interaction_summary ?? null} />
      <ReportContactSummary contacts={contacts} />
      <LigandInteractionPanel ligandInteractions={analysis.ligand_interactions} onExport={onExportLigands} />
      <ReportConfidenceSummary confidence={analysis.confidence} pae={analysis.pae} />
      <QualityPanel analysis={analysis} />
      <ProvenancePanel provenance={provenance} showExport={false} />
    </section>
  );
}

function ReportHeader({
  analysis,
  provenance,
  onExportContacts,
  onExportLigands,
  onExportAnalysisJson,
}: {
  analysis: AnalysisResponse;
  provenance: ProvenanceRecord | null;
  onExportContacts: () => void;
  onExportLigands: () => void;
  onExportAnalysisJson: () => void;
}) {
  const title =
    analysis.metadata?.title ??
    analysis.metadata?.pdb_id ??
    analysis.metadata?.uniprot_id ??
    provenance?.fileName ??
    "Current structure analysis";

  return (
    <div className="pio-panel p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="pio-badge pio-badge-metadata">Report</p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--pio-ink)]">{title}</h2>
          <p className="pio-section-copy mt-2 max-w-3xl">
            Clean summary of the current structure metadata, interaction metrics, ligand analysis, confidence signals,
            quality warnings, and methods/provenance.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
          <button
            type="button"
            onClick={onExportContacts}
            className="pio-button-secondary h-10 px-3"
          >
            <Download className="h-4 w-4" />
            Contacts CSV
          </button>
          <button
            type="button"
            onClick={onExportLigands}
            disabled={!analysis.ligand_interactions.length}
            className="pio-button-secondary h-10 px-3"
          >
            <Download className="h-4 w-4" />
            Ligands CSV
          </button>
          <button
            type="button"
            onClick={onExportAnalysisJson}
            className="pio-button-secondary h-10 px-3"
          >
            <Download className="h-4 w-4" />
            Analysis JSON
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <ReportFact label="Source" value={provenance?.inputSource ?? analysis.metadata?.source ?? "upload"} />
        <ReportFact label="Source ID" value={provenance?.sourceId ?? "N/A"} />
        <ReportFact label="Structure type" value={provenance?.structureKind ?? "uploaded coordinates"} />
        <ReportFact label="Generated" value={provenance ? formatTimestamp(provenance.analysisTimestamp) : "N/A"} />
      </div>
    </div>
  );
}

function ReportFact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="pio-kv-card">
      <p className="pio-label">{label}</p>
      <p className="pio-value mt-1 break-words text-sm">{value}</p>
    </div>
  );
}

function ReportContactSummary({ contacts }: { contacts: ContactRecord[] }) {
  if (!contacts.length) {
    return null;
  }

  const lowConfidenceContacts = contacts.filter((contact) => contact.confidence_warning).length;
  const closestContacts = [...contacts]
    .sort((a, b) => a.distance_angstrom - b.distance_angstrom)
    .slice(0, 8);

  return (
    <div className="rounded-[var(--pio-radius-lg)] border border-[var(--pio-line-strong)] bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--pio-ink)]">Contact report</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--pio-graphite)]">
            Closest contacts and confidence-aware review count for the current cutoff.
          </p>
        </div>
        {contacts.some((contact) => contact.source_residue_confidence || contact.target_residue_confidence) ? (
          <span className="inline-flex border border-[var(--pio-amber)] bg-[var(--pio-amber-pale)] px-3 py-2 text-xs font-medium text-[var(--pio-amber-deep)]">
            {lowConfidenceContacts} low-confidence contacts
          </span>
        ) : null}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[var(--pio-sand)] text-xs uppercase tracking-wide text-[var(--pio-graphite)]">
            <tr>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Categories</th>
              <th className="px-3 py-2 font-medium">Distance</th>
              <th className="px-3 py-2 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--pio-line)]">
            {closestContacts.map((contact) => (
              <tr key={contactKey(contact)}>
                <td className="px-3 py-2 font-mono text-[var(--pio-ink)]">
                  {contact.chain_a}:{contact.residue_name_a}
                  {contact.residue_a}.{contact.atom_a} - {contact.chain_b}:{contact.residue_name_b}
                  {contact.residue_b}.{contact.atom_b}
                </td>
                <td className="px-3 py-2 text-[var(--pio-graphite)]">{contact.contact_type}</td>
                <td className="px-3 py-2 text-[var(--pio-graphite)]">{contact.contact_categories.join(", ")}</td>
                <td className="px-3 py-2 font-mono text-[var(--pio-graphite)]">{contact.distance_angstrom.toFixed(3)} A</td>
                <td className="px-3 py-2">
                  {contact.source_residue_confidence || contact.target_residue_confidence ? (
                    <ContactConfidenceBadge contact={contact} />
                  ) : (
                    <span className="text-xs text-[var(--pio-graphite)]">N/A</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportConfidenceSummary({ confidence, pae }: { confidence: ConfidenceSummary | null; pae: PaeSummary | null }) {
  if (!confidence && !pae) {
    return null;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {confidence ? <ConfidenceReportCard confidence={confidence} /> : null}
      {pae ? <PaePanel pae={pae} /> : null}
    </div>
  );
}

function ConfidenceReportCard({ confidence }: { confidence: ConfidenceSummary }) {
  const categories = [
    ["Very high", confidence.very_high_count],
    ["Confident", confidence.confident_count],
    ["Low", confidence.low_count],
    ["Very low", confidence.very_low_count],
  ] as const;

  return (
    <div className="rounded-[var(--pio-radius-lg)] border border-[var(--pio-line-strong)] bg-white p-4">
      <h2 className="text-sm font-semibold text-[var(--pio-ink)]">Confidence summary</h2>
      <p className="mt-1 text-xs leading-5 text-[var(--pio-graphite)]">
        pLDDT distribution for predicted-structure interpretation.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ReportFact label="Average pLDDT" value={confidence.average_plddt.toFixed(2)} />
        <ReportFact label="Low-confidence residues" value={confidence.low_confidence_count} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {categories.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between rounded-[var(--pio-radius-sm)] border border-[var(--pio-line-strong)] px-3 py-2">
            <span className="text-sm text-[var(--pio-graphite)]">{label}</span>
            <span className="font-mono text-sm text-[var(--pio-ink)]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ViewerModeToggle({
  colorMode,
  hasConfidence,
  onColorModeChange,
}: {
  colorMode: ViewerColorMode;
  hasConfidence: boolean;
  onColorModeChange: (mode: ViewerColorMode) => void;
}) {
  if (!hasConfidence) {
    return null;
  }

  return (
    <div className="pio-panel flex items-center justify-between gap-3 p-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--pio-graphite)]">Viewer color mode</p>
        <p className="mt-1 text-xs text-[var(--pio-graphite)]">Mol* native controls remain available inside the viewer.</p>
      </div>
      <div className="inline-flex rounded-full border border-[var(--pio-line-strong)] bg-[var(--pio-white)] p-1">
        {(["structure", "plddt"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onColorModeChange(mode)}
            className={[
              "h-8 rounded-full px-3 text-xs font-semibold transition-colors",
              colorMode === mode
                ? "bg-[var(--pio-ink)] text-[var(--pio-white)]"
                : "text-[var(--pio-graphite)] hover:text-[var(--pio-ink)]",
            ].join(" ")}
          >
            {mode === "plddt" ? "pLDDT" : "Structure"}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyWorkbenchState({
  onLoadSample,
  onLoadExample,
  onFocusRcsb,
  onFocusAlphaFold,
}: {
  onLoadSample: () => void;
  onLoadExample: (exampleId: ExampleId) => void;
  onFocusRcsb: () => void;
  onFocusAlphaFold: () => void;
}) {
  return (
    <div className="rounded-[var(--pio-radius-lg)] bg-[var(--pio-sage)] p-5">
      <div className="max-w-2xl">
        <p className="pio-section-title">Start a structure analysis</p>
        <p className="pio-section-copy mt-2">
          Explore protein structures, contacts, ligands, and confidence in one browser workspace. Start with a structure
          file, PDB ID, AlphaFold accession, or sample structure.
        </p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={onLoadSample}
          className="pio-button-secondary h-11"
        >
          <FileUp className="h-4 w-4" />
          Load sample
        </button>
        <button
          type="button"
          onClick={onFocusRcsb}
          className="pio-button-secondary h-11"
        >
          <Database className="h-4 w-4" />
          Fetch PDB ID
        </button>
        <button
          type="button"
          onClick={onFocusAlphaFold}
          className="pio-button-secondary h-11"
        >
          <Search className="h-4 w-4" />
          Fetch AlphaFold
        </button>
      </div>
      <ExampleGallery onLoadExample={onLoadExample} />
    </div>
  );
}

function ExampleGallery({ onLoadExample }: { onLoadExample: (exampleId: ExampleId) => void }) {
  return (
    <div className="mt-5 border-t border-[var(--pio-line)] pt-5">
      <div className="flex flex-col gap-1">
        <p className="pio-section-title">Example gallery</p>
        <p className="pio-section-copy">
          Guided structures for quickly testing common experimental, predicted, ligand, large-structure, and comparison
          workflows.
        </p>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {EXAMPLE_GALLERY.map((example) => (
          <article key={example.id} className="pio-panel grid min-w-0 gap-3 p-4">
            <div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--pio-ink)]">{example.title}</h3>
                  <p className="mt-1 font-mono text-xs text-[var(--pio-graphite)]">{example.source}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onLoadExample(example.id)}
                  className="pio-button-secondary mt-2 h-9 shrink-0 px-3 text-xs sm:mt-0"
                >
                  {example.actionLabel}
                </button>
              </div>
              <p className="pio-section-copy mt-2">{example.description}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {example.tags.map((tag) => (
                <span key={tag} className="pio-badge pio-badge-neutral">
                  {tag}
                </span>
              ))}
            </div>
            <p className="rounded-[var(--pio-radius-md)] bg-[var(--pio-amber-pale)] px-3 py-2 text-xs leading-5 text-[var(--pio-ink)]">
              <span className="font-semibold text-[var(--pio-amber-deep)]">What to look at:</span> {example.hint}
            </p>
          </article>
        ))}
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
      <div className="pio-panel p-4">
        <h2 className="pio-section-title">Quality</h2>
        <p className="pio-section-copy mt-1">
          Practical validation signals from existing contact, ligand, confidence, and PAE data.
        </p>
        <p className="mt-3 rounded-[var(--pio-radius-md)] bg-[var(--pio-amber-pale)] px-3 py-2 text-xs font-semibold text-[var(--pio-amber-deep)]">
          These are screening/review signals, not full crystallographic validation or chemical perception.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {qualityItems.map((item) => (
            <QualityCheckCard key={item.label} {...item} />
          ))}
        </div>
      </div>

      {warningRows.length ? (
        <div className="pio-alert-caution p-4">
          <h3 className="text-sm font-semibold text-[var(--pio-amber-deep)]">Warnings to review</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-6">
            {warningRows.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="pio-panel p-4">
        <h3 className="pio-section-title">Close-contact examples</h3>
        <p className="pio-section-copy mt-1">
          Representative contacts flagged as possible clashes or under 2 A.
        </p>
        {closeContactExamples.length ? (
          <div className="pio-table-card mt-3 divide-y divide-[var(--pio-line)]">
            {closeContactExamples.map((contact) => (
              <div key={contactKey(contact)} className="grid gap-2 px-3 py-2 text-sm md:grid-cols-[1fr_1fr_auto]">
                <span className="pio-value">
                  {contact.chain_a}:{contact.residue_name_a}
                  {contact.residue_a}.{contact.atom_a}
                </span>
                <span className="pio-value">
                  {contact.chain_b}:{contact.residue_name_b}
                  {contact.residue_b}.{contact.atom_b}
                </span>
                <span className="pio-value">{contact.distance_angstrom.toFixed(3)} A</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="pio-section-copy mt-3">No close-contact examples were flagged by the current analysis.</p>
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
      ? "bg-[var(--pio-amber-pale)] text-[var(--pio-amber-deep)]"
      : status === "ok"
        ? "bg-[var(--pio-green-pale)] text-[var(--pio-green-deep)]"
        : "bg-[var(--pio-sand)] text-[var(--pio-graphite)]";

  return (
    <div className={`rounded-[var(--pio-radius-md)] p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
        <span className="font-mono text-sm font-semibold">{value}</span>
      </div>
      <p className="mt-2 text-xs leading-5">{detail}</p>
    </div>
  );
}

function ProvenancePanel({ provenance, showExport = true }: { provenance: ProvenanceRecord | null; showExport?: boolean }) {
  if (!provenance) {
    return (
      <div className="pio-panel p-4">
        <h2 className="pio-section-title">Methods and provenance</h2>
        <p className="pio-section-copy mt-2">
          Run an analysis to generate reproducibility details for the current structure.
        </p>
      </div>
    );
  }

  const rows: Array<[string, string | number]> = [
    ["Input source", provenance.inputSource],
    ["Source ID", provenance.sourceId],
    ["File", provenance.fileName],
    ["Format", provenance.fileFormat],
    ["Parser", provenance.parser],
    ["Contact method", provenance.contactMethod],
    ["Cutoff", `${provenance.contactCutoffAngstrom} A`],
    ["Structure type", provenance.structureKind],
    ["PAE sidecar", provenance.paeProvided ? "Provided" : "Not provided"],
    ["App version", provenance.appVersion],
    ["Analyzed", formatTimestamp(provenance.analysisTimestamp)],
  ];

  return (
    <div className="grid gap-4">
      <div className="pio-panel p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="pio-section-title">Methods and provenance</h2>
            <p className="pio-section-copy mt-1 max-w-3xl">
              Reproducibility details for the current analysis. These values describe how the displayed contacts,
              ligand summaries, confidence warnings, and quality checks were generated.
            </p>
            <p className="mt-2 font-mono text-xs text-[var(--pio-graphite)]">
              Analysis generated with Gemmi parsing and distance-based contact search.
            </p>
          </div>
          {showExport ? <button
            type="button"
            onClick={() =>
              downloadText(
                JSON.stringify(provenance, null, 2),
                `${baseExportName(provenance.fileName) || "analysis"}-provenance.json`,
                "application/json;charset=utf-8",
              )
            }
            className="pio-button-secondary h-10 shrink-0 px-4"
          >
            <Download className="h-4 w-4" />
            Export provenance JSON
          </button> : null}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="pio-kv-card">
              <p className="pio-label">{label}</p>
              <p className="pio-value mt-1 break-words text-sm">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {provenance.warnings.length ? (
        <div className="pio-alert-caution p-4">
          <h3 className="text-sm font-semibold text-[var(--pio-amber-deep)]">Recorded warnings</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-6">
            {provenance.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-[var(--pio-radius-md)] bg-[var(--pio-green-pale)] p-4">
          <h3 className="text-sm font-semibold text-[var(--pio-green-deep)]">Recorded warnings</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--pio-ink)]">
            No parser, contact, confidence, or PAE warnings were recorded for this analysis.
          </p>
        </div>
      )}
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
  downloadText(csv, filename, "text/csv;charset=utf-8");
}

function downloadText(text: string, filename: string, type: string) {
  const blob = new Blob([text], { type });
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

function buildProvenanceRecord({
  analysis,
  inputSource,
  fileName,
  structureFormat,
  cutoff,
  analysisTimestamp,
  paeFileName,
}: {
  analysis: AnalysisResponse;
  inputSource: InputSource;
  fileName: string;
  structureFormat: StructureFileFormat;
  cutoff: number;
  analysisTimestamp: string | null;
  paeFileName: string;
}): ProvenanceRecord {
  const metadata = analysis.metadata;
  const sourceId =
    metadata?.pdb_id ??
    metadata?.uniprot_id ??
    (inputSource === "sample" ? "bundled sample" : fileName || "uploaded structure");
  const structureKind =
    metadata?.source === "alphafold" || analysis.confidence
      ? "predicted"
      : metadata?.source === "rcsb"
        ? "experimental"
        : "uploaded coordinates";

  return {
    inputSource,
    sourceId,
    fileName: fileName || defaultUploadName(structureFormat),
    fileFormat: structureFormat === "cif" ? "mmCIF" : "PDB",
    parser: "Gemmi via backend parser",
    contactCutoffAngstrom: cutoff,
    contactMethod: "Distance-based heavy-atom contacts using Gemmi NeighborSearch",
    appVersion: APP_VERSION,
    analysisTimestamp: analysisTimestamp ?? new Date().toISOString(),
    warnings: analysis.warnings,
    paeProvided: Boolean(analysis.pae || paeFileName),
    structureKind,
  };
}

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
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
        <div key={label} className="pio-panel p-4">
          <p className="pio-label">{label}</p>
          <p className="pio-value mt-2 text-2xl font-bold">{value}</p>
          <p className="pio-section-copy mt-2">{helper}</p>
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
    <div className="pio-panel p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="pio-section-title">
            {metadata.title ?? (isAlphaFold ? "AlphaFold DB model" : "RCSB structure")}
          </h2>
          <div className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map(([label, value]) =>
              value ? (
                <div key={label}>
                  <p className="pio-label">{label}</p>
                  <p className="pio-value mt-1 text-sm">{value}</p>
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
            className="pio-button-secondary h-9 shrink-0 px-3"
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
    ["Very high", confidence.very_high_count, "var(--pio-lavender)"],
    ["Confident", confidence.confident_count, "var(--pio-lavender-pale)"],
    ["Low", confidence.low_count, "var(--pio-amber)"],
    ["Very low", confidence.very_low_count, "var(--pio-coral)"],
  ] as const;

  return (
    <div className="pio-panel p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="pio-section-title">Predicted confidence</h2>
          <p className="pio-section-copy mt-1">
            pLDDT values were read from residue B-factors for this predicted structure.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="pio-label">Average pLDDT</p>
              <p className="pio-value mt-1 text-xl font-bold text-[var(--pio-lavender-deep)]">{confidence.average_plddt.toFixed(2)}</p>
            </div>
            <div>
              <p className="pio-label">Residues</p>
              <p className="pio-value mt-1 text-xl font-bold">{confidence.residue_count}</p>
            </div>
            <div>
              <p className="pio-label">Low confidence</p>
              <p className="pio-value mt-1 text-xl font-bold text-[var(--pio-amber-deep)]">{confidence.low_confidence_count}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3">
          <div className="inline-flex rounded-full border border-[var(--pio-line-strong)] bg-[var(--pio-white)] p-1">
            {(["structure", "plddt"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onColorModeChange(mode)}
                className={`h-8 rounded-full px-3 text-xs font-semibold ${
                  colorMode === mode ? "bg-[var(--pio-ink)] text-[var(--pio-white)]" : "text-[var(--pio-graphite)] hover:text-[var(--pio-ink)]"
                }`}
              >
                {mode === "plddt" ? "pLDDT" : "Structure"}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--pio-graphite)]">{residueConfidences.length} residues available for confidence coloring.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map(([label, count, color]) => (
          <div key={label} className="pio-kv-card flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3" style={{ backgroundColor: color }} />
              <span className="text-sm text-[var(--pio-ink)]">{label}</span>
            </div>
            <span className="pio-value text-sm">{count}</span>
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
    <div className="pio-panel p-4">
      <h2 className="pio-section-title">PAE sidecar</h2>
      <p className="pio-section-copy mt-1">
        Predicted aligned error summary from the uploaded JSON sidecar.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="pio-kv-card">
            <p className="pio-label">{label}</p>
            <p className="pio-value mt-1 text-sm">{value}</p>
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
    <div className="pio-panel p-4">
      <h2 className="pio-section-title">Structure comparison</h2>
      <p className="pio-section-copy mt-1">
        Deltas are calculated as second structure minus first structure. Contact comparison uses residue-level contact identities.
      </p>
      <p className="mt-3 rounded-[var(--pio-radius-md)] bg-[var(--pio-amber-pale)] px-3 py-2 text-xs font-semibold text-[var(--pio-amber-deep)]">
        No structural alignment. No RMSD. No TM-score. No side-by-side 3D superposition yet.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {deltaItems.map(([label, value]) => (
          <div key={label} className="pio-kv-card">
            <p className="pio-label">{label}</p>
            <p className={`mt-1 font-mono text-sm ${Number(value) === 0 ? "text-[var(--pio-ink)]" : Number(value) > 0 ? "text-[var(--pio-green-deep)]" : "text-[var(--pio-coral-deep)]"}`}>
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
    <div className="flex items-center justify-between rounded-[var(--pio-radius-sm)] border border-[var(--pio-line-strong)] px-3 py-2">
      <span className="text-sm text-[var(--pio-graphite)]">{label}</span>
      <span className="font-mono text-sm text-[var(--pio-ink)]">{value}</span>
    </div>
  );
}

function ContactDifferenceList({ title, rows }: { title: string; rows: StructureComparisonResponse["contacts"]["gained_contacts"] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--pio-graphite)]">{title}</p>
      {rows.length ? (
        <div className="mt-2 divide-y divide-[var(--pio-line)] border border-[var(--pio-line-strong)]">
          {rows.map((row) => (
            <div key={`${row.label}-${row.contact_type}-${row.distance_a_angstrom ?? ""}-${row.distance_b_angstrom ?? ""}`} className="px-3 py-2">
              <p className="font-mono text-xs text-[var(--pio-ink)]">{row.label}</p>
              <p className="mt-1 text-xs text-[var(--pio-graphite)]">
                {row.contact_type} · {row.contact_categories.join(", ")}
              </p>
              <p className="mt-1 font-mono text-xs text-[var(--pio-graphite)]">
                A: {formatOptionalDistance(row.distance_a_angstrom)} / B: {formatOptionalDistance(row.distance_b_angstrom)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--pio-graphite)]">No rows.</p>
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
    <div className="rounded-[var(--pio-radius-lg)] border border-[var(--pio-line-strong)] bg-white p-4">
      <h2 className="text-sm font-semibold text-[var(--pio-ink)]">Interaction summary</h2>
      <p className="mt-1 text-xs leading-5 text-[var(--pio-graphite)]">
        Distance-based contact categories and top contact participants.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between rounded-[var(--pio-radius-sm)] border border-[var(--pio-line-strong)] px-3 py-2">
            <span className="text-sm text-[var(--pio-graphite)]">{label}</span>
            <span className="font-mono text-sm text-[var(--pio-ink)]">{value}</span>
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
    <div className="min-w-0 overflow-hidden rounded-[var(--pio-radius-lg)] border border-[var(--pio-line-strong)] bg-white">
      <div className="flex flex-col gap-3 border-b border-[var(--pio-line-strong)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--pio-ink)]">Ligand interaction summary</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--pio-graphite)]">
            Per-ligand contact counts, closest atom pair, contacting residues, and distance distribution.
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          className="pio-button-secondary px-4 text-sm"
        >
          <Download className="h-4 w-4" />
          Export ligand CSV
        </button>
      </div>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-[var(--pio-sand)] text-xs uppercase tracking-wide text-[var(--pio-graphite)]">
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
          <tbody className="divide-y divide-[var(--pio-line)]">
            {ligandInteractions.map((ligand) => (
              <tr key={`${ligand.name}-${ligand.chain_id}-${ligand.residue_number}`}>
                <td className="px-4 py-3 font-mono text-[var(--pio-ink)]">
                  {ligand.name} {ligand.chain_id}:{ligand.residue_number}
                </td>
                <td className="px-4 py-3 font-mono text-[var(--pio-ink)]">{ligand.contact_count}</td>
                <td className="px-4 py-3 font-mono text-[var(--pio-ink)]">{ligand.protein_contact_count}</td>
                <td className="px-4 py-3 font-mono text-[var(--pio-ink)]">{ligand.water_contact_count}</td>
                <td className="px-4 py-3 font-mono text-[var(--pio-ink)]">{ligand.possible_clash_count}</td>
                <td className="px-4 py-3 text-[var(--pio-graphite)]">
                  {ligand.closest_contact && ligand.closest_distance_angstrom !== null ? (
                    <span className="font-mono">
                      {ligand.closest_distance_angstrom.toFixed(3)} A, {ligand.closest_contact.atom_a}-
                      {ligand.closest_contact.atom_b}
                    </span>
                  ) : (
                    "None"
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--pio-graphite)]">
                  {ligand.contacting_residues.length
                    ? ligand.contacting_residues
                        .map((residue) => `${residue.chain_id}:${residue.residue_name}${residue.residue_number} (${residue.contact_count})`)
                        .join(", ")
                    : "None"}
                </td>
                <td className="px-4 py-3 font-mono text-[var(--pio-graphite)]">
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
      <div className="min-w-0 rounded-[var(--pio-radius-md)] border border-dashed border-[var(--pio-line-strong)] bg-[var(--pio-sand)] p-4">
        <h2 className="text-sm font-semibold text-[var(--pio-ink)]">Ligand detail</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--pio-graphite)]">
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
    <div className="min-w-0 overflow-hidden rounded-[var(--pio-radius-lg)] border border-[var(--pio-blue)] bg-[var(--pio-blue-pale)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--pio-blue-deep)]">Ligand detail</p>
          <h2 className="mt-1 font-mono text-lg font-semibold text-[var(--pio-ink)]">
            {ligand.name} {ligand.chain_id}:{ligand.residue_number}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--pio-blue-deep)]">
            Selecting this ligand highlights it in Mol* and keeps the detailed interaction summary in view.
          </p>
        </div>
        <button
          type="button"
          onClick={() => interaction && onExport(interaction)}
          disabled={!interaction}
          className="pio-button-secondary shrink-0 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Download className="h-4 w-4" />
          Export this ligand
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="border border-[var(--pio-blue)] bg-white/80 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--pio-blue-deep)]">{label}</p>
            <p className="mt-1 font-mono text-sm text-[var(--pio-ink)]">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="border border-[var(--pio-blue)] bg-white/80 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--pio-blue-deep)]">Closest contact</p>
          {closestContact && interaction?.closest_distance_angstrom !== null ? (
            <div className="mt-2 text-sm text-[var(--pio-ink)]">
              <p className="font-mono text-[var(--pio-ink)]">{interaction?.closest_distance_angstrom.toFixed(3)} A</p>
              <p className="mt-1 font-mono text-xs">
                {closestContact.chain_a}:{closestContact.residue_name_a}
                {closestContact.residue_a}.{closestContact.atom_a} - {closestContact.chain_b}:
                {closestContact.residue_name_b}
                {closestContact.residue_b}.{closestContact.atom_b}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--pio-graphite)]">No contacts detected for this ligand.</p>
          )}
        </div>

        <div className="border border-[var(--pio-blue)] bg-white/80 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--pio-blue-deep)]">Distance buckets</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <DistanceBucket label="<2 A" value={buckets.under_2_angstrom} />
            <DistanceBucket label="2-3 A" value={buckets.two_to_3_angstrom} />
            <DistanceBucket label="3-4 A" value={buckets.three_to_4_angstrom} />
            <DistanceBucket label=">4 A" value={buckets.over_4_angstrom} />
          </div>
        </div>
      </div>

      <div className="mt-4 border border-[var(--pio-blue)] bg-white/80 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--pio-blue-deep)]">Contacting residues</p>
        {interaction?.contacting_residues.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {interaction.contacting_residues.map((residue) => (
              <span
                key={`${residue.chain_id}-${residue.residue_name}-${residue.residue_number}`}
                className="inline-flex rounded-[var(--pio-radius-sm)] border border-[var(--pio-line-strong)] bg-white px-2 py-1 font-mono text-xs text-[var(--pio-ink)]"
              >
                {residue.chain_id}:{residue.residue_name}
                {residue.residue_number} ({residue.contact_count})
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--pio-graphite)]">No protein residues are within the current cutoff for this ligand.</p>
        )}
      </div>
    </div>
  );
}

function DistanceBucket({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--pio-radius-sm)] border border-[var(--pio-line-strong)] bg-white px-2 py-1">
      <span className="font-mono text-xs text-[var(--pio-graphite)]">{label}</span>
      <span className="font-mono text-xs text-[var(--pio-ink)]">{value}</span>
    </div>
  );
}

function TopContactList({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--pio-graphite)]">{title}</p>
      {rows.length ? (
        <div className="mt-2 divide-y divide-[var(--pio-line)] border border-[var(--pio-line-strong)]">
          {rows.map(([label, count]) => (
            <div key={label} className="flex items-center justify-between px-3 py-2">
              <span className="font-mono text-sm text-[var(--pio-ink)]">{label}</span>
              <span className="font-mono text-sm text-[var(--pio-ink)]">{count}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--pio-graphite)]">No rows.</p>
      )}
    </div>
  );
}

function SelectionBar({ selection, onClear }: { selection: ViewerSelection | null; onClear: () => void }) {
  if (!selection) {
    return (
      <div className="pio-panel min-h-[108px] px-4 py-3 text-sm text-[var(--pio-graphite)]">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--pio-graphite)]">Selection inspector</p>
        <p className="mt-2 text-sm leading-6">Select a chain, ligand, or contact row to focus it in Mol*.</p>
      </div>
    );
  }

  const details = selectionDetails(selection);

  return (
    <div className="pio-panel p-4 text-sm text-[var(--pio-ink)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="pio-badge pio-badge-active">Selected in table and Mol*</p>
          <p className="mt-1 font-mono text-sm font-semibold">{selection.label}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--pio-graphite)]">
            Mol* focuses the selected chain, ligand, or contact partners automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="pio-button-secondary h-9 shrink-0 px-3"
        >
          <X className="h-4 w-4" />
          Clear selection
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {details.map(([label, value]) => (
          <div key={label} className="rounded-[var(--pio-radius-sm)] bg-[var(--pio-paper)] px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--pio-graphite)]">{label}</p>
            <p className="mt-1 break-words font-mono text-sm text-[var(--pio-ink)]">{value}</p>
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
  const details: Array<[string, string]> = [
    ["Type", contact.contact_type],
    ["Partner A", `${contact.chain_a}:${contact.residue_name_a}${contact.residue_a}.${contact.atom_a}`],
    ["Partner B", `${contact.chain_b}:${contact.residue_name_b}${contact.residue_b}.${contact.atom_b}`],
    ["Distance", `${contact.distance_angstrom.toFixed(3)} A`],
    ["Categories", contact.contact_categories.join(", ")],
  ];
  if (contact.source_residue_confidence || contact.target_residue_confidence) {
    details.push([
      "Confidence",
      contact.confidence_warning
        ? "Low-confidence endpoint"
        : "Endpoints are not low-confidence",
    ]);
  }
  return details;
}

function ContactCategoryFilter({
  value,
  onChange,
  showLowConfidence,
}: {
  value: ContactFilter;
  onChange: (value: ContactFilter) => void;
  showLowConfidence: boolean;
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
  if (showLowConfidence) {
    options.push(["low-confidence", "Low-confidence"]);
  }

  return (
    <div className="flex max-w-full flex-wrap justify-end gap-1">
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`h-8 border px-2 text-xs font-medium ${
            value === option
              ? "border-[var(--pio-ink)] bg-[var(--pio-ink)] text-[var(--pio-white)]"
              : "border-[var(--pio-line-strong)] bg-[var(--pio-white)] text-[var(--pio-graphite)] hover:bg-[var(--pio-sand)] hover:text-[var(--pio-ink)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ContactConfidenceSummary({
  lowConfidenceContactCount,
  totalContactCount,
}: {
  lowConfidenceContactCount: number;
  totalContactCount: number;
}) {
  const percent = totalContactCount > 0 ? Math.round((lowConfidenceContactCount / totalContactCount) * 100) : 0;

  return (
    <div className="grid gap-3 border-b border-[var(--pio-line)] bg-[var(--pio-amber-pale)] p-4 md:grid-cols-[220px_1fr]">
      <div>
        <p className="pio-label text-[var(--pio-amber-deep)]">Low-confidence contacts</p>
        <p className="mt-1 font-mono text-2xl font-semibold text-[var(--pio-amber-deep)]">
          {lowConfidenceContactCount}
          <span className="ml-2 text-sm font-normal">of {totalContactCount}</span>
        </p>
      </div>
      <p className="text-sm leading-6 text-[var(--pio-ink)]">
        Contacts are flagged when either residue endpoint has low or very low pLDDT. Treat these as review targets,
        especially for predicted structures where local geometry may be uncertain. Current share: {percent}%.
      </p>
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
    <div className="pio-table-card min-w-0">
      <div className="border-b border-[var(--pio-line)] p-4">
        <h2 className="pio-section-title">Chains</h2>
        <p className="pio-section-copy mt-1">Protein residue and atom counts grouped by chain.</p>
      </div>
      {chains.length ? (
        <div className="max-w-full overflow-x-auto">
          <table className="pio-responsive-table w-full min-w-[420px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--pio-graphite)]">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-4 py-3 font-medium">Chain</th>
                <th className="px-4 py-3 font-medium">Residues</th>
                <th className="px-4 py-3 font-medium">Atoms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--pio-line)]">
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
                  <td data-label="Select" className="w-12 px-4 py-3">
                    <SelectionButton selected={selected} label={`Select chain ${chain.id}`} onClick={() => onSelect(chain)} />
                  </td>
                  <td data-label="Chain" className="pio-value px-4 py-3">{chain.id}</td>
                  <td data-label="Residues" className="pio-value px-4 py-3">{chain.residue_count}</td>
                  <td data-label="Atoms" className="pio-value px-4 py-3">{chain.atom_count}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="pio-section-copy p-4">Run analysis to show chains.</p>
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
    <div className="pio-table-card">
      <div className="border-b border-[var(--pio-line)] p-4">
        <h2 className="pio-section-title">Ligands</h2>
        <p className="pio-section-copy mt-1">Non-water hetero residues detected in the structure file.</p>
      </div>
      {ligands.length ? (
        <div className="overflow-x-auto">
          <table className="pio-responsive-table w-full min-w-[420px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--pio-graphite)]">
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
            <tbody className="divide-y divide-[var(--pio-line)]">
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
                    <td data-label="Select" className="w-12 px-4 py-3">
                      <SelectionButton
                        selected={selected}
                        label={`Select ligand ${ligand.name} ${ligand.chain_id}:${ligand.residue_number}`}
                        onClick={() => onSelect(ligand)}
                      />
                    </td>
                    <td data-label="Name" className="pio-value px-4 py-3">{ligand.name}</td>
                    <td data-label="Chain" className="pio-value px-4 py-3">{ligand.chain_id}</td>
                    <td data-label="Residue" className="pio-value px-4 py-3">{ligand.residue_number}</td>
                    <td data-label="Atoms" className="pio-value px-4 py-3">{ligand.atom_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="pio-section-copy p-4">No ligand rows yet.</p>
      )}
    </div>
  );
}

function ContactTable({
  contacts,
  totalCount,
  selection,
  onSelect,
  showConfidence,
}: {
  contacts: ContactRecord[];
  totalCount: number;
  selection: ViewerSelection | null;
  onSelect: (contact: ContactRecord) => void;
  showConfidence: boolean;
}) {
  if (!contacts.length) {
    return <p className="pio-section-copy p-4">Run analysis to populate contacts.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="pio-responsive-table w-full min-w-[1120px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-[var(--pio-graphite)]">
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
            {showConfidence ? <th className="px-4 py-3 font-medium">Confidence</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--pio-line)]">
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
                <td data-label="Select" className="w-12 px-4 py-3">
                  <SelectionButton
                    selected={selected}
                    label={`Select contact ${contact.chain_a}:${contact.residue_name_a}${contact.residue_a} to ${contact.chain_b}:${contact.residue_name_b}${contact.residue_b}`}
                    onClick={() => onSelect(contact)}
                  />
                </td>
                <td data-label="Type" className="px-4 py-3"><ContactTypeBadge contact={contact} /></td>
                <td data-label="Categories" className="px-4 py-3"><ContactCategoryBadges contact={contact} /></td>
                <td data-label="Residue A" className="pio-value px-4 py-3">
                  {contact.chain_a}:{contact.residue_name_a}
                  {contact.residue_a}
                </td>
                <td data-label="Atom A" className="pio-value px-4 py-3">{contact.atom_a}</td>
                <td data-label="Residue B" className="pio-value px-4 py-3">
                  {contact.chain_b}:{contact.residue_name_b}
                  {contact.residue_b}
                </td>
                <td data-label="Atom B" className="pio-value px-4 py-3">{contact.atom_b}</td>
                <td data-label="Distance" className="pio-value px-4 py-3">{contact.distance_angstrom.toFixed(3)} A</td>
                {showConfidence ? (
                  <td data-label="Confidence" className="px-4 py-3">
                    <ContactConfidenceBadge contact={contact} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {totalCount > contacts.length ? (
        <p className="border-t border-[var(--pio-line)] p-3 text-xs text-[var(--pio-graphite)]">
          Showing first {contacts.length} of {totalCount} contacts. CSV export includes all rows.
        </p>
      ) : null}
    </div>
  );
}

function ContactConfidenceBadge({ contact }: { contact: ContactRecord }) {
  const confidences = [contact.source_residue_confidence, contact.target_residue_confidence].filter(
    (confidence): confidence is ResidueConfidence => Boolean(confidence),
  );
  if (!confidences.length) {
    return <span className="text-xs text-[var(--pio-graphite)]">N/A</span>;
  }

  const label = confidences
    .map((confidence) => `${confidence.chain_id}:${confidence.residue_name}${confidence.residue_number} ${confidence.plddt.toFixed(1)}`)
    .join(" / ");

  if (contact.confidence_warning) {
    return (
      <span title={label} className="pio-badge pio-badge-warning">
        Review pLDDT
      </span>
    );
  }

  return (
    <span title={label} className="pio-badge pio-badge-active">
      pLDDT OK
    </span>
  );
}

function ContactTypeBadge({ contact }: { contact: ContactRecord }) {
  const className = contact.contact_type.includes("ligand")
    ? "pio-badge-metadata"
    : contact.contact_type.includes("water")
      ? "pio-badge-neutral"
      : "pio-badge-active";

  return <span className={`pio-badge ${className}`}>{contact.contact_type}</span>;
}

function ContactCategoryBadges({ contact }: { contact: ContactRecord }) {
  if (!contact.contact_categories.length) {
    return <span className="text-xs text-[var(--pio-graphite)]">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {contact.contact_categories.map((category) => (
        <span
          key={category}
          className={`pio-badge ${category === "possible-clash" ? "pio-badge-warning" : "pio-badge-neutral"}`}
        >
          {category}
        </span>
      ))}
    </div>
  );
}

function selectableRowClass(selected: boolean) {
  return [
    "cursor-pointer text-[var(--pio-ink)] outline-none hover:bg-[var(--pio-paper)] focus:bg-[var(--pio-paper)]",
    selected ? "bg-[var(--pio-green-pale)] ring-2 ring-inset ring-[var(--pio-green)] hover:bg-[var(--pio-green-pale)] focus:bg-[var(--pio-green-pale)]" : "",
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
        "inline-flex h-8 w-8 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--pio-green)]",
        selected
          ? "bg-[var(--pio-green-pale)] text-[var(--pio-green-deep)]"
          : "bg-[var(--pio-white)] text-[var(--pio-ink)] hover:bg-[var(--pio-sand)]",
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

function buildConfidenceLookup(residueConfidences: ResidueConfidence[]) {
  return new Map(
    residueConfidences.map((confidence) => [
      residueConfidenceKey(confidence.chain_id, confidence.residue_number, confidence.residue_name),
      confidence,
    ]),
  );
}

function enrichContactConfidence(contact: ContactRecord, confidenceByResidue: Map<string, ResidueConfidence>): ContactRecord {
  const sourceConfidence = confidenceByResidue.get(
    residueConfidenceKey(contact.chain_a, contact.residue_a, contact.residue_name_a),
  );
  const targetConfidence = confidenceByResidue.get(
    residueConfidenceKey(contact.chain_b, contact.residue_b, contact.residue_name_b),
  );
  const confidenceWarning =
    isLowConfidence(sourceConfidence?.category) || isLowConfidence(targetConfidence?.category);

  return {
    ...contact,
    source_residue_confidence: sourceConfidence ?? null,
    target_residue_confidence: targetConfidence ?? null,
    confidence_warning: confidenceWarning,
  };
}

function residueConfidenceKey(chainId: string, residueNumber: string, residueName: string) {
  return `${chainId}:${residueName}:${residueNumber}`;
}

function isLowConfidence(category: ResidueConfidence["category"] | undefined) {
  return category === "low" || category === "very_low";
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
