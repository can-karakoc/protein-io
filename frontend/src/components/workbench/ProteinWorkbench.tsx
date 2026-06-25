"use client";

import { Database, Download, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { StructureViewer } from "@/components/viewer/StructureViewer";
import { CompareWorkspace } from "@/components/workbench/CompareWorkspace";
import { ExploreSidebar } from "@/components/workbench/ExploreSidebar";
import { WorkbenchShell } from "@/components/workbench/WorkbenchShell";
import type { WorkbenchMode } from "@/components/workbench/TopNav";
import { useMediaQuery } from "@/hooks/useMediaQuery";
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
type ExampleId = "sample" | "hemoglobin" | "ligand-bound" | "large-structure" | "alphafold";
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
];

const PUBLIC_STRUCTURE_CACHE_KEY = "pio_public_structure_cache_v2";
const WORKBENCH_PREFERENCES_KEY = "pio_workbench_preferences_v1";
const LEGACY_CACHE_KEY = "pio_cache_v1";

interface PublicStructureCache {
  version: 2;
  source: "rcsb" | "alphafold";
  structureText: string;
  structureFormat: StructureFileFormat;
  fileName: string;
  pdbId: string;
  uniprotId: string;
  analysis: AnalysisResponse;
  cutoff: number;
  savedAt: string;
}

interface WorkbenchPreferences {
  resultsTab: ResultsTab;
  tabStripScrollLeft?: number;
  workbenchMode: WorkbenchMode;
}

function savePublicStructureCache(entry: PublicStructureCache) {
  try {
    localStorage.setItem(PUBLIC_STRUCTURE_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // QuotaExceededError for very large structures — silently skip
  }
}

function parsePublicStructureCache(raw: string | null): PublicStructureCache | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PublicStructureCache;
    if (
      parsed.version !== 2 ||
      (parsed.source !== "rcsb" && parsed.source !== "alphafold") ||
      !parsed.structureText ||
      !parsed.analysis
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseWorkbenchPreferences(raw: string | null): WorkbenchPreferences {
  const defaults: WorkbenchPreferences = {
    resultsTab: "overview",
    workbenchMode: "explore",
    tabStripScrollLeft: 0,
  };
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkbenchPreferences>;
    return {
      resultsTab: parsed.resultsTab ?? defaults.resultsTab,
      workbenchMode: parsed.workbenchMode ?? defaults.workbenchMode,
      tabStripScrollLeft: parsed.tabStripScrollLeft ?? defaults.tabStripScrollLeft,
    };
  } catch {
    return defaults;
  }
}

function saveWorkbenchPreferences(entry: WorkbenchPreferences) {
  try {
    localStorage.setItem(WORKBENCH_PREFERENCES_KEY, JSON.stringify(entry));
  } catch {
    // Preference persistence is optional.
  }
}

function subscribeToLocalStorageSnapshot() {
  // Storage is read once after hydration. Same-tab writes already update local state,
  // and cross-tab preference changes should not remount an active local upload.
  return () => undefined;
}

function getPublicCacheSnapshot() {
  return localStorage.getItem(PUBLIC_STRUCTURE_CACHE_KEY);
}

function getPreferencesSnapshot() {
  return localStorage.getItem(WORKBENCH_PREFERENCES_KEY) ?? "null";
}

function getServerSnapshot() {
  return null;
}

export function ProteinWorkbench() {
  const cacheSnapshot = useSyncExternalStore(subscribeToLocalStorageSnapshot, getPublicCacheSnapshot, getServerSnapshot);
  const preferencesSnapshot = useSyncExternalStore(subscribeToLocalStorageSnapshot, getPreferencesSnapshot, getServerSnapshot);
  const initialCache = useMemo(() => parsePublicStructureCache(cacheSnapshot), [cacheSnapshot]);
  const initialPreferences = useMemo(
    () => parseWorkbenchPreferences(preferencesSnapshot),
    [preferencesSnapshot],
  );

  useEffect(() => {
    localStorage.removeItem(LEGACY_CACHE_KEY);
  }, []);

  return (
    <ProteinWorkbenchState
      key={`${initialCache?.savedAt ?? "empty"}:${preferencesSnapshot ?? "defaults"}`}
      initialCache={initialCache}
      initialPreferences={initialPreferences}
      preferencesHydrated={preferencesSnapshot !== null}
    />
  );
}

function ProteinWorkbenchState({
  initialCache,
  initialPreferences,
  preferencesHydrated,
}: {
  initialCache: PublicStructureCache | null;
  initialPreferences: WorkbenchPreferences;
  preferencesHydrated: boolean;
}) {
  const [mode, setMode] = useState<WorkbenchMode>(initialPreferences.workbenchMode);
  const [fileName, setFileName] = useState<string>(initialCache?.fileName ?? "");
  const [structureText, setStructureText] = useState(initialCache?.structureText ?? "");
  const [structureFormat, setStructureFormat] = useState<StructureFileFormat>(
    initialCache?.structureFormat ?? "pdb",
  );
  const [paeFileName, setPaeFileName] = useState("");
  const [paeText, setPaeText] = useState("");
  const [pdbId, setPdbId] = useState(initialCache?.pdbId ?? "");
  const [uniprotId, setUniprotId] = useState(initialCache?.uniprotId ?? "");
  const [cutoff, setCutoff] = useState(initialCache?.cutoff ?? 4.0);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(initialCache?.analysis ?? null);
  const [selection, setSelection] = useState<ViewerSelection | null>(null);
  const viewerColumnRef = useRef<HTMLDivElement | null>(null);
  const [viewerColorMode, setViewerColorMode] = useState<ViewerColorMode>(
    initialCache?.analysis.confidence ? "plddt" : "structure",
  );
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [resultsTab, setResultsTab] = useState<ResultsTab>(initialPreferences.resultsTab);
  const resultsColumnRef = useRef<HTMLElement | null>(null);
  const [initialTabStripScrollLeft] = useState(initialPreferences.tabStripScrollLeft ?? 0);
  const tabStripScrollLeftRef = useRef(initialTabStripScrollLeft);
  const [inputSource, setInputSource] = useState<InputSource>(initialCache?.source ?? "upload");
  const [analysisTimestamp, setAnalysisTimestamp] = useState<string | null>(
    initialCache?.savedAt ?? null,
  );
  const [error, setError] = useState<WorkbenchError>(null);
  const [, setStatus] = useState<WorkbenchStatus>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRcsbLoading, setIsRcsbLoading] = useState(false);
  const [isAlphaFoldLoading, setIsAlphaFoldLoading] = useState(false);

  // Persist the active results tab whenever it changes so reload restores it
  useEffect(() => {
    if (!preferencesHydrated) return;
    saveWorkbenchPreferences({
      resultsTab,
      workbenchMode: mode,
      tabStripScrollLeft: tabStripScrollLeftRef.current,
    });
  }, [mode, preferencesHydrated, resultsTab]);

  // Persist the active workbench mode (Explore / Report / Compare)
  const isLg = useMediaQuery("(min-width: 1024px)");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (isLg) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarOpen(false);
    }
  }, [isLg]);

  useEffect(() => {
    if (resultsColumnRef.current) resultsColumnRef.current.scrollTop = 0;
  }, [resultsTab]);

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
      savePublicStructureCache({
        version: 2,
        source: "rcsb",
        structureText: payload.structure_text,
        structureFormat: payload.structure_format,
        fileName: payload.filename,
        pdbId: normalizedPdbId.toUpperCase(),
        uniprotId: "",
        analysis: payload.analysis,
        cutoff,
        savedAt: new Date().toISOString(),
      });
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
      savePublicStructureCache({
        version: 2,
        source: "alphafold",
        structureText: payload.structure_text,
        structureFormat: payload.structure_format,
        fileName: payload.filename,
        pdbId: "",
        uniprotId: normalizedUniprotId.toUpperCase(),
        analysis: payload.analysis,
        cutoff,
        savedAt: new Date().toISOString(),
      });
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
    }
  }

  function reset() {
    localStorage.removeItem(PUBLIC_STRUCTURE_CACHE_KEY);
    localStorage.removeItem(WORKBENCH_PREFERENCES_KEY);
    localStorage.removeItem(LEGACY_CACHE_KEY);
    setFileName("");
    setStructureText("");
    setStructureFormat("pdb");
    setPdbId("");
    setUniprotId("");
    setPaeFileName("");
    setPaeText("");
    setAnalysis(null);
    setAnalysisTimestamp(null);
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
      onSidebarToggle={() => setSidebarOpen((o) => !o)}
    >
      <AnimatePresence mode="wait" initial={false}>
      {mode === "explore" ? (
        <motion.div
          key="explore"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="wb-explore-grid min-w-0 rounded-[16px] border border-[var(--pio-line)] bg-transparent shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)]"
        >
          {/* Sidebar in grid — desktop only */}
          <div className="hidden lg:block">
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
            onFetchRcsb={() => fetchRcsbStructure()}
            isRcsbLoading={isRcsbLoading}
            uniprotId={uniprotId}
            onUniprotIdChange={setUniprotId}
            onFetchAlphaFold={() => fetchAlphaFoldStructure()}
            isAlphaFoldLoading={isAlphaFoldLoading}
            error={error}
            warnings={analysis?.warnings ?? []}
          />
          </div>{/* end hidden lg:block sidebar wrapper */}

          {/* Viewer column — white background, columns shadow over it */}
          <div ref={viewerColumnRef} className="relative min-h-0 bg-white">
            <StructureViewer
              structureText={structureText}
              structureFormat={structureFormat}
              selection={selection}
              residueConfidences={residueConfidences}
              colorMode={viewerColorMode}
            />

            {/* Color mode toggle — absolute overlay, top-right */}
            {residueConfidences.length > 0 && (
              <div className="absolute right-3 top-3 z-10 inline-flex rounded-full border border-[rgba(20,20,15,0.14)] bg-[var(--pio-white)] p-[3px]">
                {(["structure", "plddt"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setViewerColorMode(m)}
                    className={[
                      "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                      viewerColorMode === m
                        ? "bg-[var(--pio-ink)] text-[var(--pio-white)]"
                        : "bg-transparent text-[var(--pio-graphite)] hover:text-[var(--pio-ink)]",
                    ].join(" ")}
                  >
                    {m === "plddt" ? "pLDDT" : "Structure"}
                  </button>
                ))}
              </div>
            )}

            {/* Selection pill — centered, only visible when something is selected */}
            <AnimatePresence>
              {selection && (
                <motion.div
                  key="selection-pill"
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 12, opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                  className="absolute right-3 pointer-events-none"
                  style={{ top: residueConfidences.length > 0 ? 52 : 12 }}
                >
                  <div
                    className="pointer-events-auto inline-flex items-center gap-2"
                    style={{
                      background: "rgba(12,22,36,0.72)",
                      backdropFilter: "blur(14px)",
                      WebkitBackdropFilter: "blur(14px)",
                      borderRadius: 20,
                      padding: "7px 8px 7px 14px",
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.12em", textTransform: "uppercase", lineHeight: 1, marginBottom: 3, whiteSpace: "nowrap" }}>Selected</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1, whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{selection.label}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelection(null)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, flexShrink: 0, background: "rgba(255,255,255,0.12)", borderRadius: "50%", color: "rgba(255,255,255,0.70)", transition: "background 0.15s" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.22)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)"; }}
                      title="Clear selection"
                    >
                      <X size={10} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating ligand panel — desktop only (viewer too narrow on smaller screens) */}
            {isLg && (() => {
              const selLigand = selection?.kind === "ligand"
                ? (analysis?.ligands ?? []).find(l => l.name === selection.residueName && l.chain_id === selection.chainId && l.residue_number === selection.residueNumber) ?? null
                : null;
              const selInteraction = selection?.kind === "ligand"
                ? (analysis?.ligand_interactions ?? []).find(l => l.name === selection.residueName && l.chain_id === selection.chainId && l.residue_number === selection.residueNumber) ?? null
                : null;
              return (
                <AnimatePresence>
                  {selLigand ? (
                    <FloatingLigandPanel
                      ligand={selLigand}
                      interaction={selInteraction}
                      viewerRef={viewerColumnRef}
                      onClose={() => setSelection(null)}
                      onExport={(interaction) => exportSingleLigandCsv(interaction)}
                    />
                  ) : null}
                </AnimatePresence>
              );
            })()}

            {/* Loading overlay */}
            {isAnyLoading && <LoadingOverlay statusLabel={viewerStatusLabel} />}
          </div>

          {/* Results column */}
          <section ref={resultsColumnRef} className="relative z-[1] min-h-0 overflow-y-auto bg-[var(--pio-white)] border-t border-[var(--pio-line)] md:border-t-0 md:shadow-[-8px_0_24px_rgba(17,22,16,0.07)]">
            <ResultsPanel
              activeTab={resultsTab}
              onTabChange={setResultsTab}
              initialTabStripScrollLeft={initialTabStripScrollLeft}
              onTabStripScroll={(x) => {
                tabStripScrollLeftRef.current = x;
                saveWorkbenchPreferences({
                  resultsTab,
                  workbenchMode: mode,
                  tabStripScrollLeft: x,
                });
              }}
              analysis={analysis}
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
              onLoadExample={loadGalleryExample}
            />
          </section>
        </motion.div>
      ) : mode === "report" ? (
        <motion.div
          key="report"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="h-full"
        >
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
        </motion.div>
      ) : (
        <motion.div
          key="compare"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="h-full"
        >
          <CompareWorkspace />
        </motion.div>
      )}
      </AnimatePresence>
    </WorkbenchShell>

    {/* Sidebar drawer — rendered outside WorkbenchShell so position:fixed works
        (Framer Motion transforms on the inner motion.div would otherwise contain it) */}
    <AnimatePresence>
      {!isLg && sidebarOpen && (
        <motion.div
          key="backdrop"
          className="wb-sidebar-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </AnimatePresence>
    <AnimatePresence>
      {!isLg && sidebarOpen && (
        <motion.div
          key="drawer"
          className="wb-sidebar-drawer bg-[var(--pio-white)]"
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 280 }}
        >
          <div className="flex items-center justify-between border-b border-[rgba(20,20,15,0.08)] px-4 py-3">
            <span className="text-[13px] font-semibold text-[var(--pio-ink)]">Load Structure</span>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[rgba(20,20,15,0.06)] text-[var(--pio-graphite)]"
            >
              <X size={14} />
            </button>
          </div>
          <ExploreSidebar
            fileName={fileName}
            paeFileName={paeFileName}
            structureFormat={structureFormat}
            analysis={analysis}
            metadata={analysis?.metadata ?? null}
            cutoff={cutoff}
            onCutoffChange={setCutoff}
            onStructureFile={(file) => { void handleFile(file); setSidebarOpen(false); }}
            onPaeFile={(file) => void handlePaeFile(file)}
            onAnalyze={analyzeStructure}
            onLoadSample={() => { void loadExample(); setSidebarOpen(false); }}
            onReset={reset}
            hasStructure={hasStructure}
            isLoading={isLoading}
            pdbId={pdbId}
            onPdbIdChange={setPdbId}
            onFetchRcsb={() => { fetchRcsbStructure(); setSidebarOpen(false); }}
            isRcsbLoading={isRcsbLoading}
            uniprotId={uniprotId}
            onUniprotIdChange={setUniprotId}
            onFetchAlphaFold={() => { fetchAlphaFoldStructure(); setSidebarOpen(false); }}
            isAlphaFoldLoading={isAlphaFoldLoading}
            error={error}
            warnings={analysis?.warnings ?? []}
          />
        </motion.div>
      )}
    </AnimatePresence>

    </>
  );
}

const LOADING_LINES = [
  "Parsing structure…",
  "Computing contacts…",
  "Building interaction graph…",
  "Mapping ligands…",
  "Finalising analysis…",
];

function LoadingOverlay({ statusLabel }: { statusLabel: string | null }) {
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setLineIndex((i) => (i + 1) % LOADING_LINES.length);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const headline = statusLabel === "Fetching from RCSB…" || statusLabel === "Fetching from AlphaFold…"
    ? "Fetching! Hold on tight…"
    : statusLabel === "Analyzing…"
      ? "Analyzing structure…"
      : LOADING_LINES[lineIndex];

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white">
      <p className="text-[22px] font-semibold text-[#14140f] tracking-tight">
        {headline}
      </p>
      <p className="mt-2 text-sm text-[#6b6f63]">This might take a minute.</p>
    </div>
  );
}

function tagBackground(tag: string): string {
  const t = tag.toLowerCase();
  if (t === "ligand" || t === "contacts" || t === "experimental" || t === "multi-chain" || t === "predicted" || t === "plddt" || t === "performance" || t === "starter") return "var(--pio-green-pale)";
  return "var(--pio-blue-pale)";
}

function tagColor(tag: string): string {
  const t = tag.toLowerCase();
  if (t === "ligand" || t === "contacts" || t === "experimental" || t === "multi-chain" || t === "predicted" || t === "plddt" || t === "performance" || t === "starter") return "var(--pio-green-deep)";
  return "var(--pio-blue-deep)";
}

function ResultsPanel({
  activeTab,
  onTabChange,
  analysis,
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
  onLoadExample,
  initialTabStripScrollLeft,
  onTabStripScroll,
}: {
  activeTab: ResultsTab;
  onTabChange: (tab: ResultsTab) => void;
  analysis: AnalysisResponse | null;
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
  onLoadExample: (exampleId: ExampleId) => void;
  initialTabStripScrollLeft?: number;
  onTabStripScroll?: (x: number) => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const tabStripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (tabStripRef.current && initialTabStripScrollLeft) {
      tabStripRef.current.scrollLeft = initialTabStripScrollLeft;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const tabs: Array<{ id: ResultsTab; label: string; visible: boolean; count?: number }> = [
    { id: "overview", label: "Overview", visible: true },
    { id: "chains", label: "Chains", visible: true, count: analysis ? chains.length : undefined },
    { id: "ligands", label: "Ligands", visible: true, count: analysis ? ligands.length : undefined },
    { id: "contacts", label: "Contacts", visible: true, count: analysis ? allContactCount : undefined },
    { id: "confidence", label: "Confidence", visible: Boolean(analysis?.confidence) },
    { id: "pae", label: "PAE", visible: Boolean(analysis?.pae) },
    { id: "quality", label: "Quality", visible: Boolean(analysis) },
    { id: "methods", label: "Methods", visible: Boolean(analysis) },
  ];
  const visibleTabs = tabs.filter((tab) => tab.visible);
  const selectedTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : "overview";
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

  if (!analysis) {
    return (
      <section ref={panelRef} className="min-w-0">
        <EmptyWorkbenchState
          onLoadExample={onLoadExample}
        />
      </section>
    );
  }

  function TabButton({ tab }: { tab: { id: ResultsTab; label: string; count?: number } }) {
    const isActive = selectedTab === tab.id;
    return (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => preservePanelPosition(() => onTabChange(tab.id))}
        className={[
          "flex-1 min-w-max whitespace-nowrap text-center rounded-[12px] px-2 sm:px-3.5 py-[7px] text-[13px] font-semibold transition-colors",
          isActive
            ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)]"
            : "text-[var(--pio-highlight)] opacity-70 hover:opacity-100 hover:bg-[var(--pio-line)]",
        ].join(" ")}
      >
        {tab.label}
        {tab.count != null && (
          <span className={["ml-1.5 text-[10px] font-semibold", isActive ? "opacity-70" : "opacity-50"].join(" ")}>
            {tab.count.toLocaleString()}
          </span>
        )}
      </button>
    );
  }

  return (
    <section ref={panelRef} className="min-w-0">
      <div
        className="sticky top-0 z-10 bg-[var(--pio-white)] px-3 sm:px-5 pb-4 pt-4 shadow-[0_1px_0_rgba(17,22,16,0.07)]"
        role="tablist"
        aria-label="Analysis results"
      >
        {/* relative wrapper lets the fade gradient sit over the right edge */}
        <div className="relative">
          <div
            ref={tabStripRef}
            className="flex gap-1 overflow-x-auto scrollbar-hide"
            onScroll={() => onTabStripScroll?.(tabStripRef.current?.scrollLeft ?? 0)}
          >
            {visibleTabs.map((tab) => <TabButton key={tab.id} tab={tab} />)}
          </div>
          {/* right-edge fade — signals hidden tabs without a scrollbar */}
          {visibleTabs.length > 4 && (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--pio-white)] to-transparent" />
          )}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={selectedTab}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -5 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        className="min-w-0 px-5 pb-6 pt-6"
      >
        {selectedTab === "overview" ? (
          <div className="grid min-w-0 max-w-full gap-6 overflow-hidden">
            <>
              {analysis.metadata && analysis.metadata.source !== "upload" && (() => {
                const isAlphaFold = analysis.metadata.source === "alphafold";
                const rawTitle = analysis.metadata.title ?? analysis.metadata.pdb_id ?? analysis.metadata.uniprot_id ?? "Structure";
                const title = toTitleCase(rawTitle.replace(/\s+at\s+[\d.]+\s+angstroms?\s+resolution\s*$/i, "").trim());
                const entryUrl = isAlphaFold ? analysis.metadata.alphafold_url : analysis.metadata.rcsb_url;
                return (
                  <div className="flex items-start gap-3">
                    <h2 className="pio-section-title">{title}</h2>
                    {entryUrl && (
                      <a href={entryUrl} target="_blank" rel="noreferrer" aria-label={isAlphaFold ? "AlphaFold DB entry" : "RCSB entry"}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: "var(--pio-highlight)", color: "var(--pio-highlight-text)", flexShrink: 0, textDecoration: "none" }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                          <path d="M2.5 11.5L11.5 2.5M11.5 2.5H6M11.5 2.5V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </a>
                    )}
                  </div>
                );
              })()}
              <MetadataPanel metadata={analysis.metadata ?? null} />
              <SummaryCards analysis={analysis} />
              <InteractionSummaryPanel summary={analysis.interaction_summary ?? null} />
            </>
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
          <div className="min-w-0" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <LigandTable ligands={ligands} selection={selection} onSelect={onLigandSelect} />
            <LigandInteractionPanel ligandInteractions={analysis?.ligand_interactions ?? []} onExport={onExportLigands} />
          </div>
        ) : null}

        {selectedTab === "contacts" ? (
          <div className="min-w-0">
            {/* Heading row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.015em", color: "var(--pio-ink)", flex: 1, minWidth: 0 }}>Contacts</h2>
              <button
                type="button"
                onClick={onExportContacts}
                disabled={!allContactCount}
                style={{ background: "var(--pio-sky)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 12, color: "var(--pio-highlight)", opacity: !allContactCount ? 0.45 : 1 }}
                title="Export CSV"
              >
                <Download size={14} />
              </button>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--pio-graphite)", lineHeight: 1.5, marginTop: 4 }}>Closest atom pair per categorized contact.</p>
            <ContactCategoryFilter
              value={contactFilter}
              onChange={onContactFilterChange}
              showLowConfidence={hasContactConfidence}
            />
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
      </motion.div>
      </AnimatePresence>
    </section>
  );
}

const REPORT_DIVIDER: React.CSSProperties = { paddingTop: 24, marginTop: 8 };
const REPORT_H2: React.CSSProperties = { fontSize: 22, fontWeight: 700, letterSpacing: "-0.015em", color: "var(--pio-ink)" };
const REPORT_SUB: React.CSSProperties = { fontSize: 13.5, color: "var(--pio-graphite)", lineHeight: 1.5, marginTop: 4 };
const REPORT_TILE: React.CSSProperties = { background: "var(--pio-paper)", borderRadius: 10, padding: "12px 14px" };
const REPORT_LABEL: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--pio-graphite)", textTransform: "uppercase" as const };
const REPORT_MONO: React.CSSProperties = { fontFamily: "var(--font-pio-mono)" };

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
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="w-full max-w-[480px] rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] p-10 text-center shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)]">
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(199,217,236,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Database size={22} color="var(--pio-highlight)" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--pio-ink)" }}>No analysis yet</h2>
          <p style={{ fontSize: 13.5, color: "var(--pio-graphite)", lineHeight: 1.6, marginTop: 8 }}>
            Load and analyze a structure first, then return here for a concise summary with methods and provenance.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "center", flexWrap: "wrap" }}>
            {([["Load sample", onLoadSample], ["Fetch PDB ID", onFocusRcsb], ["Fetch AlphaFold", onFocusAlphaFold]] as const).map(([label, fn]) => (
              <button key={label} type="button" onClick={fn}
                className="rounded-[12px] border border-[var(--pio-line-strong)] bg-[var(--pio-white)] px-4 py-2 text-[13px] font-semibold text-[var(--pio-ink)] hover:bg-[var(--pio-sand)]">
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
    <div className="mx-auto w-full max-w-[960px] flex-1 min-h-0 flex flex-col rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)] overflow-clip pr-[3px] pt-[20px] pb-[20px]">
    <div className="overflow-y-auto flex-1 scrollbar-thin-report" style={{ padding: "12px 33px 36px 36px" }}>
      <ReportHeader analysis={analysis} provenance={provenance} onExportContacts={onExportContacts} onExportLigands={onExportLigands} onExportAnalysisJson={onExportAnalysisJson} />
      <div style={REPORT_DIVIDER}>
        <MetadataPanel metadata={analysis.metadata ?? null} />
      </div>
      <div style={REPORT_DIVIDER}>
        <SummaryCards analysis={analysis} />
      </div>
      <div style={REPORT_DIVIDER}>
        <InteractionSummaryPanel summary={analysis.interaction_summary ?? null} />
      </div>
      <div style={REPORT_DIVIDER}>
        <ReportContactSummary contacts={contacts} />
      </div>
      {analysis.ligand_interactions.length > 0 && (
        <div style={REPORT_DIVIDER}>
          <LigandInteractionPanel ligandInteractions={analysis.ligand_interactions} onExport={onExportLigands} />
        </div>
      )}
      <ReportConfidenceSummary confidence={analysis.confidence} pae={analysis.pae} />
      <div style={REPORT_DIVIDER}>
        <QualityPanel analysis={analysis} />
      </div>
      <div style={REPORT_DIVIDER}>
        <ProvenancePanel provenance={provenance} showExport={false} />
      </div>
    </div>
    </div>
    </div>
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
  const metadata = analysis.metadata;
  const isAlphaFold = metadata?.source === "alphafold";
  const rawTitle =
    metadata?.title ??
    metadata?.pdb_id ??
    metadata?.uniprot_id ??
    provenance?.fileName ??
    "Current structure analysis";
  const title = toTitleCase(rawTitle.replace(/\s+at\s+[\d.]+\s+angstroms?\s+resolution\s*$/i, "").trim());
  const entryUrl = isAlphaFold ? metadata?.alphafold_url : metadata?.rcsb_url;

  const facts: Array<[string, string]> = [
    ["Source", String(provenance?.inputSource ?? analysis.metadata?.source ?? "upload")],
    ["Source ID", String(provenance?.sourceId ?? "N/A")],
    ["Structure type", String(provenance?.structureKind ?? "uploaded coordinates")],
    ["Generated", provenance ? formatTimestamp(provenance.analysisTimestamp) : "N/A"],
  ];

  const exports: Array<[string, () => void, boolean]> = [
    ["Contacts CSV", onExportContacts, false],
    ["Ligands CSV", onExportLigands, !analysis.ligand_interactions.length],
    ["Analysis JSON", onExportAnalysisJson, false],
  ];

  return (
    <div>
      {/* Label */}
      <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", color: "var(--pio-highlight)", textTransform: "uppercase", marginBottom: 10 }}>Report</p>

      {/* Title + external link */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--pio-ink)", lineHeight: 1.2, flex: 1, minWidth: 0 }}>{title}</h1>
        {entryUrl ? (
          <a href={entryUrl} target="_blank" rel="noreferrer" aria-label={isAlphaFold ? "AlphaFold DB entry" : "RCSB entry"}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: "var(--pio-highlight)", color: "var(--pio-highlight-text)", flexShrink: 0, textDecoration: "none", marginTop: 4 }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2.5 11.5L11.5 2.5M11.5 2.5H6M11.5 2.5V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        ) : null}
      </div>

      {/* Subtitle */}
      <p style={{ ...REPORT_SUB, maxWidth: 560, marginTop: 8 }}>
        Structure metadata, interaction metrics, ligand analysis, confidence signals, quality warnings, and provenance.
      </p>

      {/* Export buttons */}
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {exports.map(([label, fn, disabled]) => (
          <button key={label} type="button" onClick={fn} disabled={disabled}
            style={{ borderRadius: 12, border: "1px solid var(--pio-line-strong)", background: "var(--pio-white)", color: "var(--pio-ink)", padding: "7px 13px", fontSize: 12, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, opacity: disabled ? 0.45 : 1 }}>
            <Download size={12} color={disabled ? "var(--pio-graphite)" : "var(--pio-highlight)"} />
            {label}
          </button>
        ))}
      </div>

      {/* Provenance fact tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 20 }}>
        {facts.map(([label, value]) => (
          <div key={label} style={REPORT_TILE}>
            <p style={REPORT_LABEL}>{label}</p>
            <p style={{ ...REPORT_MONO, fontSize: 13, fontWeight: 600, color: "var(--pio-ink)", marginTop: 4 }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const REPORT_CONTACT_GRID = "minmax(200px,2fr) minmax(120px,1fr) minmax(160px,1.5fr) minmax(80px,0.7fr) minmax(80px,0.7fr)";

function ReportContactSummary({ contacts }: { contacts: ContactRecord[] }) {
  if (!contacts.length) return null;

  const lowConfidenceContacts = contacts.filter((c) => c.confidence_warning).length;
  const closestContacts = [...contacts].sort((a, b) => a.distance_angstrom - b.distance_angstrom).slice(0, 10);
  const hasConfidence = contacts.some((c) => c.source_residue_confidence || c.target_residue_confidence);
  const chipBase: React.CSSProperties = { borderRadius: 999, fontWeight: 500, display: "inline-block", fontSize: 11, padding: "3px 8px", whiteSpace: "nowrap" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={REPORT_H2}>Contact Report</h2>
          <p style={REPORT_SUB}>Closest 10 contacts by distance for the current cutoff.</p>
        </div>
        {hasConfidence && (
          <span style={{ background: "rgba(194,160,64,0.12)", border: "1px solid rgba(194,160,64,0.3)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#5C4A00", flexShrink: 0 }}>
            {lowConfidenceContacts} low-confidence
          </span>
        )}
      </div>

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <div style={{ minWidth: 600 }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: REPORT_CONTACT_GRID, columnGap: 12, borderBottom: "1px solid var(--pio-line)", padding: "8px 0" }}>
            {(hasConfidence ? ["ATOMS", "TYPE", "CATEGORIES", "DISTANCE", "CONFIDENCE"] : ["ATOMS", "TYPE", "CATEGORIES", "DISTANCE", ""]).map((col) => (
              <p key={col} style={{ ...REPORT_LABEL }}>{col}</p>
            ))}
          </div>
          {/* Rows */}
          {closestContacts.map((contact, i) => (
            <div key={contactKey(contact)}>
              <div style={{ display: "grid", gridTemplateColumns: REPORT_CONTACT_GRID, columnGap: 12, padding: "10px 0", alignItems: "start" }}>
                <p style={{ ...REPORT_MONO, fontSize: 12, color: "var(--pio-ink)" }}>
                  {contact.chain_a}:{contact.residue_name_a}{contact.residue_a}.{contact.atom_a} – {contact.chain_b}:{contact.residue_name_b}{contact.residue_b}.{contact.atom_b}
                </p>
                <div><span style={{ ...chipBase, ...contactChipStyle(contact.contact_type) }}>{contact.contact_type}</span></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {contact.contact_categories.length ? contact.contact_categories.map((cat) => (
                    <span key={cat} style={{ ...chipBase, ...contactChipStyle(cat) }}>{cat}</span>
                  )) : <span style={{ fontSize: 12, color: "var(--pio-graphite)" }}>—</span>}
                </div>
                <p style={{ ...REPORT_MONO, fontSize: 12.5, fontWeight: 600, color: "var(--pio-ink)" }}>{contact.distance_angstrom.toFixed(3)} Å</p>
                <div>
                  {contact.source_residue_confidence || contact.target_residue_confidence ? (
                    <ContactConfidenceBadge contact={contact} />
                  ) : null}
                </div>
              </div>
              {i < closestContacts.length - 1 && <div style={{ height: 1, background: "var(--pio-line)" }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportConfidenceSummary({ confidence, pae }: { confidence: ConfidenceSummary | null; pae: PaeSummary | null }) {
  if (!confidence && !pae) return null;
  return (
    <div style={{ paddingTop: 24, marginTop: 8, display: "grid", gap: 24, gridTemplateColumns: confidence && pae ? "1fr 1fr" : "1fr" }}>
      {confidence ? <ConfidenceReportCard confidence={confidence} /> : null}
      {pae ? <PaePanel pae={pae} /> : null}
    </div>
  );
}

function ConfidenceReportCard({ confidence }: { confidence: ConfidenceSummary }) {
  const categories: Array<[string, number, string]> = [
    ["Very high", confidence.very_high_count, "rgba(74,140,100,0.15)"],
    ["Confident", confidence.confident_count, "rgba(74,140,100,0.08)"],
    ["Low", confidence.low_count, "rgba(194,160,64,0.12)"],
    ["Very low", confidence.very_low_count, "rgba(255,100,80,0.1)"],
  ];

  return (
    <div>
      <h2 style={REPORT_H2}>Confidence Summary</h2>
      <p style={REPORT_SUB}>pLDDT distribution for predicted-structure interpretation.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
        <div style={REPORT_TILE}>
          <p style={REPORT_LABEL}>Average pLDDT</p>
          <p style={{ ...REPORT_MONO, fontSize: 26, fontWeight: 700, color: "var(--pio-ink)", marginTop: 4, lineHeight: 1 }}>{confidence.average_plddt.toFixed(2)}</p>
        </div>
        <div style={REPORT_TILE}>
          <p style={REPORT_LABEL}>Low-confidence residues</p>
          <p style={{ ...REPORT_MONO, fontSize: 26, fontWeight: 700, color: "var(--pio-ink)", marginTop: 4, lineHeight: 1 }}>{confidence.low_confidence_count.toLocaleString()}</p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        {categories.map(([label, value, bg]) => (
          <div key={label} style={{ ...REPORT_TILE, background: bg, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ ...REPORT_LABEL, color: "var(--pio-ink)" }}>{label}</p>
            <p style={{ ...REPORT_MONO, fontSize: 18, fontWeight: 700, color: "var(--pio-ink)" }}>{value.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyWorkbenchState({
  onLoadExample,
}: {
  onLoadExample: (exampleId: ExampleId) => void;
}) {
  return (
    <div className="p-6">
      <h2 className="text-[21px] font-bold tracking-[-0.01em] text-[var(--pio-ink)]">
        Start a structure analysis
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--pio-graphite)]">
        Explore protein structures, contacts, ligands, and confidence in one browser workspace. Start with a
        structure file, PDB ID, AlphaFold accession, or sample structure.
      </p>
      <div className="mt-5 border-t border-[var(--pio-line)] pt-5">
        <ExampleGallery onLoadExample={onLoadExample} />
      </div>
    </div>
  );
}

function ExampleGallery({
  onLoadExample,
}: {
  onLoadExample: (exampleId: ExampleId) => void;
}) {
  return (
    <div>
      <h3 className="text-[18px] font-bold tracking-[-0.01em] text-[var(--pio-ink)]">Example Gallery</h3>
      <div className="mt-4 flex flex-col gap-3">
        {EXAMPLE_GALLERY.map((example) => (
          <article
            key={example.id}
            className="pio-gallery-card flex min-w-0 flex-col gap-3 rounded-[8px] bg-[#F5F5F5] p-4"
          >
            <div className="min-w-0">
              <h4 className="text-[15.5px] font-bold leading-snug text-[var(--pio-ink)]">
                {example.title}
              </h4>
              <p className="mt-0.5 font-[family-name:var(--font-pio-mono)] text-[12px] text-[var(--pio-graphite)]">
                {example.source}
              </p>
              <p className="mt-1.5 text-[13.5px] leading-[1.5] text-[var(--pio-graphite)]"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {example.description}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {example.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-[10px] py-[3px] text-[11px] font-semibold"
                    style={{ background: tagBackground(tag), color: tagColor(tag) }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onLoadExample(example.id)}
              className="flex w-full items-center justify-center rounded-[12px] bg-[var(--pio-highlight)] py-[6px] text-[13px] font-semibold text-[var(--pio-highlight-text)] transition-colors hover:opacity-90"
            >
              Load
            </button>
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

  const veryCloseContacts = analysis.interaction_summary?.very_close_contact_count ?? 0;
  const lowConfidence = analysis.confidence?.low_confidence_count ?? 0;
  const paeProvided = Boolean(analysis.pae);
  const hasLigands = analysis.summary.ligand_count > 0;
  const cards: Array<{
    label: string;
    value: string | number;
    description: string;
    tone: "amber" | "green" | "neutral";
    fullWidth?: boolean;
  }> = [
    {
      label: "VERY CLOSE CONTACTS",
      value: veryCloseContacts,
      description: "Atom pairs under 2 Å are review flags. They may include expected covalent geometry and are not proof of a steric clash.",
      tone: "amber",
    },
    {
      label: "LIGAND STATE",
      value: hasLigands ? analysis.summary.ligand_count : "None",
      description: hasLigands
        ? "Ligands are available for interaction review."
        : "No non-water ligands were detected in this structure.",
      tone: "green",
    },
    {
      label: "LOW-CONFIDENCE RESIDUES",
      value: analysis.confidence ? lowConfidence : "N/A",
      description: analysis.confidence
        ? "Low or very low pLDDT regions should not be over-interpreted."
        : "No pLDDT confidence data was detected for this structure.",
      tone: "green",
    },
    {
      label: "PAE SIDECAR",
      value: paeProvided ? "Provided" : "N/A",
      description: paeProvided
        ? "PAE summary is available in the PAE tab."
        : "PAE is usually relevant for AlphaFold-style predicted structures.",
      tone: "neutral",
      fullWidth: true,
    },
  ];

  const closeContactExamples = [
    ...(analysis.interaction_summary?.very_close_contacts ?? []),
    ...analysis.contacts.filter((contact) => contact.distance_angstrom < 2),
  ]
    .filter((contact, index, rows) => rows.findIndex((row) => contactKey(row) === contactKey(contact)) === index)
    .slice(0, 6);

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.015em", color: "var(--pio-ink)" }}>Quality</h2>
      <p style={{ fontSize: 13.5, color: "var(--pio-graphite)", lineHeight: 1.5, marginTop: 4 }}>
        Practical validation signals from existing contact, ligand, confidence, and PAE data.
      </p>

      <div style={{
        marginTop: 12,
        background: "var(--pio-quality-amber-bg)",
        border: "1px solid var(--pio-quality-amber-border)",
        borderRadius: 10,
        padding: "10px 14px",
      }}>
        <p style={{ fontSize: 12.5, fontWeight: 400, color: "var(--pio-quality-amber-fg)", lineHeight: 1.5 }}>
          These are screening/review signals, not full crystallographic validation or chemical perception.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        {cards.map((card) => (
          <QualityCheckCard key={card.label} {...card} />
        ))}
      </div>

      <div style={{ marginTop: 20, paddingTop: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--pio-ink)" }}>
          Close-Contact Examples
        </h3>
        <p style={{ fontSize: 13.5, color: "var(--pio-graphite)", marginTop: 4 }}>
          Representative atom pairs under 2 Å. Review them in context before drawing a chemical conclusion.
        </p>

        {closeContactExamples.length ? (
          <div style={{ marginTop: 12, overflow: "hidden" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr auto",
              borderBottom: "1px solid var(--pio-line)",
              padding: "8px 0",
            }}>
              {["ATOM 1", "ATOM 2", "DISTANCE"].map((col) => (
                <p key={col} style={{
                  fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", color: "var(--pio-graphite)",
                  textAlign: col === "DISTANCE" ? "right" : "left",
                }}>{col}</p>
              ))}
            </div>
            {closeContactExamples.map((contact, i) => {
              const atom1 = `${contact.chain_a}:${contact.residue_name_a}${contact.residue_a}.${contact.atom_a}`;
              const atom2 = `${contact.chain_b}:${contact.residue_name_b}${contact.residue_b}.${contact.atom_b}`;
              const dist = `${parseFloat(String(contact.distance_angstrom)).toFixed(3)} Å`;
              return (
                <div key={contactKey(contact)} style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr auto",
                  padding: "10px 0",
                  borderBottom: i < closeContactExamples.length - 1 ? "1px solid var(--pio-line)" : "none",
                }}>
                  <span style={{ fontFamily: "var(--font-pio-mono)", fontSize: 12, fontWeight: 500, color: "var(--pio-ink)" }}>{atom1}</span>
                  <span style={{ fontFamily: "var(--font-pio-mono)", fontSize: 12, fontWeight: 500, color: "var(--pio-ink)" }}>{atom2}</span>
                  <span style={{ fontFamily: "var(--font-pio-mono)", fontSize: 12, fontWeight: 600, color: "var(--pio-ink)", textAlign: "right" }}>{dist}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: "center", paddingTop: 24 }}>
            <ChainNodeIcon size={40} color="var(--pio-line-strong)" />
            <p style={{ fontSize: 13.5, color: "var(--pio-graphite)", marginTop: 12 }}>No close contacts detected.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function QualityCheckCard({
  label,
  value,
  description,
  tone,
  fullWidth,
}: {
  label: string;
  value: string | number;
  description: string;
  tone: "amber" | "green" | "neutral";
  fullWidth?: boolean;
}) {
  const bg = tone === "amber" ? "var(--pio-quality-amber-bg)" : tone === "green" ? "var(--pio-quality-green-bg)" : "var(--pio-paper)";
  const labelColor = tone === "amber" ? "var(--pio-quality-amber-fg)" : tone === "green" ? "var(--pio-quality-green-fg)" : "var(--pio-graphite)";
  const valueColor = tone === "amber" ? "var(--pio-quality-amber-fg)" : tone === "green" ? "var(--pio-quality-green-fg)" : "var(--pio-ink)";
  const descColor = tone === "amber" ? "var(--pio-quality-amber-fg-soft)" : tone === "green" ? "var(--pio-quality-green-fg-soft)" : "var(--pio-graphite)";

  return (
    <div style={{ background: bg, borderRadius: 12, padding: "14px 16px", overflow: "hidden", gridColumn: fullWidth ? "1 / -1" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", color: labelColor, lineHeight: 1.3 }}>{label}</p>
        <span style={{ fontSize: 22, fontWeight: 700, color: valueColor, lineHeight: 1.1, marginLeft: 8, flexShrink: 0 }}>{value}</span>
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.5, marginTop: 8, color: descColor }}>{description}</p>
    </div>
  );
}

function ProvenancePanel({ provenance, showExport = true }: { provenance: ProvenanceRecord | null; showExport?: boolean }) {
  if (!provenance) {
    return (
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.015em", color: "var(--pio-ink)" }}>Methods And Provenance</h2>
        <p style={{ fontSize: 13.5, color: "var(--pio-graphite)", lineHeight: 1.5, marginTop: 4 }}>
          Run an analysis to generate reproducibility details for the current structure.
        </p>
      </div>
    );
  }

  const MONO: React.CSSProperties = { fontFamily: "var(--font-pio-mono)", fontSize: 12, fontWeight: 500 };

  type CardDef = { label: string; value: string; style?: React.CSSProperties; faded?: boolean; fullWidth?: boolean };
  const cards: CardDef[] = [
    { label: "INPUT SOURCE", value: provenance.inputSource },
    { label: "SOURCE ID", value: provenance.sourceId, style: { ...MONO, textTransform: "uppercase" } },
    { label: "FILE", value: provenance.fileName, style: MONO },
    { label: "FORMAT", value: provenance.fileFormat, style: MONO },
    { label: "CUTOFF", value: `${provenance.contactCutoffAngstrom} Å`, style: MONO },
    { label: "STRUCTURE TYPE", value: provenance.structureKind.charAt(0).toUpperCase() + provenance.structureKind.slice(1) },
    { label: "PAE SIDECAR", value: provenance.paeProvided ? "Provided" : "Not provided", faded: !provenance.paeProvided },
    { label: "APP VERSION", value: provenance.appVersion, style: MONO },
    { label: "ANALYZED", value: new Date(provenance.analysisTimestamp).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) },
    { label: "PARSER", value: provenance.parser, fullWidth: true },
    { label: "CONTACT METHOD", value: provenance.contactMethod, fullWidth: true },
  ];

  const hasWarnings = provenance.warnings.length > 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.015em", color: "var(--pio-ink)", flex: 1, minWidth: 0 }}>
          Methods And Provenance
        </h2>
        {showExport ? (
          <button
            type="button"
            onClick={() => downloadText(JSON.stringify(provenance, null, 2), `${baseExportName(provenance.fileName) || "analysis"}-provenance.json`, "application/json;charset=utf-8")}
            style={{ background: "var(--pio-line-strong)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 12, color: "var(--pio-ink)" }}
            title="Export provenance JSON"
          >
            <Download size={14} />
          </button>
        ) : null}
      </div>

      <p style={{ fontSize: 13.5, color: "var(--pio-graphite)", lineHeight: 1.5, marginTop: 4 }}>
        Reproducibility details for the current analysis. These values describe how the displayed contacts,
        ligand summaries, confidence warnings, and quality checks were generated.
      </p>
      <p style={{ fontSize: 13, color: "var(--pio-graphite)", marginTop: 10 }}>
        Analysis generated with Gemmi parsing and distance-based contact search.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
        {cards.map((card) => (
          <div key={card.label} style={{
            background: "var(--pio-paper)",
            borderRadius: 12,
            padding: "12px 14px",
            overflow: "hidden",
            gridColumn: card.fullWidth ? "1 / -1" : undefined,
          }}>
            <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", color: "var(--pio-graphite)" }}>{card.label}</p>
            <p style={{
              fontSize: card.style?.fontSize ?? 13,
              fontWeight: card.style?.fontWeight ?? 500,
              fontFamily: card.style?.fontFamily ?? "inherit",
              textTransform: card.style?.textTransform,
              color: card.faded ? "var(--pio-graphite)" : "var(--pio-ink)",
              marginTop: 6,
              overflowWrap: "break-word",
              lineHeight: 1.4,
            }}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 16,
        background: hasWarnings ? "var(--pio-quality-amber-bg)" : "var(--pio-quality-green-bg)",
        border: `1px solid ${hasWarnings ? "var(--pio-quality-amber-border)" : "var(--pio-quality-green-border)"}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}>
        <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", color: hasWarnings ? "var(--pio-quality-amber-fg)" : "var(--pio-quality-green-fg)" }}>
          RECORDED WARNINGS
        </p>
        {hasWarnings ? (
          <ul style={{ marginTop: 6, paddingLeft: 16 }}>
            {provenance.warnings.map((warning) => (
              <li key={warning} style={{ fontSize: 12.5, color: "var(--pio-quality-amber-fg-soft)", lineHeight: 1.5 }}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--pio-quality-green-fg-soft)", lineHeight: 1.5, marginTop: 6 }}>
            No parser, contact, confidence, or PAE warnings were recorded for this analysis.
          </p>
        )}
      </div>
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
  const items: [string, number, string][] = [
    ["ATOMS", summary?.atom_count ?? 0, "Coordinate records parsed from the structure file."],
    ["PROTEIN RESIDUES", summary?.residue_count ?? 0, "Amino acid residues counted across chains."],
    ["CHAINS", summary?.chain_count ?? 0, "Distinct protein chains in the structure."],
    ["LIGANDS", summary?.ligand_count ?? 0, "Non-water hetero residues detected."],
    ["CONTACTS", summary?.contact_count ?? 0, "Residue and ligand contacts under cutoff."],
  ];

  return (
    <div>
      <div className="flex flex-col gap-2">
        {items.map(([label, value, description]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-[12px] bg-[var(--pio-paper)] px-4 py-3"
          >
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">{label}</p>
              <p className="mt-0.5 text-[22px] font-bold leading-none text-[var(--pio-ink)]">{value.toLocaleString()}</p>
            </div>
            <p className="max-w-[160px] text-right text-[12px] leading-[1.4] text-[var(--pio-graphite)]">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDepositedDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw;
}

function MetadataPanel({ metadata }: { metadata: StructureMetadata | null }) {
  if (!metadata || metadata.source === "upload") {
    return null;
  }

  const isAlphaFold = metadata.source === "alphafold";
  type MetaRow = { label: string; value: string | number | null; mono?: boolean };

  const rcsbRows: MetaRow[] = [
    { label: "PDB ID", value: metadata.pdb_id, mono: true },
    { label: "STATUS", value: metadata.status ? toTitleCase(metadata.status) : null },
    { label: "METHOD", value: metadata.method ? toTitleCase(metadata.method) : null },
    {
      label: "RESOLUTION",
      value: metadata.resolution_angstrom != null ? `${metadata.resolution_angstrom.toFixed(2)} Å` : null,
      mono: true,
    },
    { label: "ORGANISM", value: metadata.organism ? toTitleCase(metadata.organism) : null },
    { label: "ENTITIES", value: metadata.entity_count },
    { label: "DEPOSITED", value: formatDepositedDate(metadata.deposition_date), mono: true },
  ];

  const alphaFoldRows: MetaRow[] = [
    { label: "UNIPROT", value: metadata.uniprot_id, mono: true },
    { label: "METHOD", value: metadata.method ? toTitleCase(metadata.method) : null },
    { label: "ORGANISM", value: metadata.organism ? toTitleCase(metadata.organism) : null },
    { label: "MODEL VERSION", value: metadata.model_version, mono: true },
    { label: "MODEL DATE", value: formatDepositedDate(metadata.deposition_date), mono: true },
    { label: "ENTITIES", value: metadata.entity_count },
  ];

  const rows = (isAlphaFold ? alphaFoldRows : rcsbRows).filter((r) => r.value != null);

  return (
    <div>
      {/* Metadata grid */}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}
      >
        {rows.map((row) => (
          <div key={row.label} className="cursor-pointer rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--pio-sky)]">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">{row.label}</p>
            {row.mono ? (
              <p className="mt-0.5 font-mono text-[12px] font-medium text-[var(--pio-ink)]">{row.value}</p>
            ) : (
              <p className="mt-0.5 text-[13px] font-medium text-[var(--pio-ink)]">{row.value}</p>
            )}
          </div>
        ))}
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

function InteractionSummaryPanel({ summary }: { summary: InteractionSummary | null }) {
  if (!summary) return null;

  const MONO: React.CSSProperties = { fontFamily: "var(--font-pio-mono)" };

  const metrics: Array<[string, number]> = [
    ["Protein-Protein", summary.protein_protein_count],
    ["Protein-Ligand", summary.protein_ligand_count],
    ["Protein-Water", summary.protein_water_count],
    ["Ligand-Water", summary.ligand_water_count],
    ["Inter-Chain", summary.inter_chain_count],
    ["Very Close", summary.very_close_contact_count],
  ];

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--pio-ink)", letterSpacing: "-0.015em" }}>Ligand Interaction Summary</h2>
      <p style={{ fontSize: 13.5, color: "var(--pio-graphite)", lineHeight: 1.5, marginTop: 4 }}>
        Distance-based contact categories and top contact participants.
      </p>

      {/* Metric cards — 3-col grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
        {metrics.map(([label, value]) => (
          <div
            key={label}
            style={{ background: "var(--pio-paper)", borderRadius: 10, padding: "12px 14px" }}
          >
            <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--pio-graphite)", textTransform: "uppercase" }}>{label}</p>
            <p style={{ ...MONO, fontSize: 26, fontWeight: 700, color: "var(--pio-ink)", marginTop: 4, lineHeight: 1 }}>
              {value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Top residue lists — 2-col */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <TopContactList title="Top Residues" rows={summary.top_contacting_residues.map((r) => [`${r.chain_id}:${r.residue_name}${r.residue_number}`, r.contact_count])} />
        <TopContactList title="Top Residues" rows={summary.top_contacting_ligands.map((l) => [`${l.name} ${l.chain_id}:${l.residue_number}`, l.contact_count])} />
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
  if (!ligandInteractions.length) return null;

  const MONO: React.CSSProperties = { fontFamily: "var(--font-pio-mono)" };

  return (
    <div>
      {/* Heading row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--pio-ink)" }}>Ligand Interaction Summary</h3>
        <button
          type="button"
          onClick={onExport}
          style={{ background: "var(--pio-sky)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--pio-highlight)" }}
          title="Export ligand CSV"
        >
          <Download size={14} />
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--pio-graphite)", lineHeight: 1.5, marginTop: 4 }}>
        Per-ligand contact counts, closest atom pair, contacting residues, and distance distribution.
      </p>

      {/* Scrollable table */}
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <div style={{ minWidth: 1050 }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "140px 80px 80px 70px 80px 130px 220px 150px", columnGap: 12, borderBottom: "1px solid var(--pio-line)", padding: "8px 0" }}>
            {["LIGAND","CONTACTS","PROTEIN","WATER","VERY CLOSE","CLOSEST","TOP RESIDUES","BUCKETS"].map((col) => (
              <p key={col} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", color: "var(--pio-graphite)" }}>{col}</p>
            ))}
          </div>
          {ligandInteractions.map((ligand, i) => (
            <div key={`${ligand.name}-${ligand.chain_id}-${ligand.residue_number}`}>
              <div style={{ display: "grid", gridTemplateColumns: "140px 80px 80px 70px 80px 130px 220px 150px", columnGap: 12, padding: "10px 0", alignItems: "start" }}>
                <p style={{ ...MONO, fontSize: 12, color: "var(--pio-ink)" }}>{ligand.name} {ligand.chain_id}:{ligand.residue_number}</p>
                <p style={{ ...MONO, fontSize: 13, fontWeight: 500, color: "var(--pio-ink)" }}>{ligand.contact_count}</p>
                <p style={{ ...MONO, fontSize: 13, fontWeight: 500, color: "var(--pio-ink)" }}>{ligand.protein_contact_count}</p>
                <p style={{ ...MONO, fontSize: 13, fontWeight: 500, color: "var(--pio-ink)" }}>{ligand.water_contact_count}</p>
                <p style={{ ...MONO, fontSize: 13, fontWeight: 500, color: "var(--pio-ink)" }}>{ligand.very_close_contact_count}</p>
                <div>
                  {ligand.closest_contact && ligand.closest_distance_angstrom !== null ? (
                    <>
                      <p style={{ ...MONO, fontSize: 11, fontWeight: 700, color: "var(--pio-ink)" }}>{ligand.closest_distance_angstrom.toFixed(3)} Å</p>
                      <p style={{ ...MONO, fontSize: 10, color: "var(--pio-graphite)", marginTop: 2 }}>{ligand.closest_contact.atom_a}–{ligand.closest_contact.atom_b}</p>
                    </>
                  ) : <p style={{ fontSize: 12, color: "var(--pio-graphite)" }}>—</p>}
                </div>
                <p style={{ ...MONO, fontSize: 11, color: "var(--pio-graphite)", maxWidth: 180, overflowWrap: "break-word" }}>
                  {ligand.contacting_residues.length
                    ? ligand.contacting_residues.map(r => `${r.chain_id}:${r.residue_name}${r.residue_number}(${r.contact_count})`).join(", ")
                    : "—"}
                </p>
                <p style={{ ...MONO, fontSize: 11, color: "var(--pio-ink)" }}>
                  {"<2:"}{ligand.distance_distribution.under_2_angstrom}{" / 2–3:"}{ligand.distance_distribution.two_to_3_angstrom}{" / 3–4:"}{ligand.distance_distribution.three_to_4_angstrom}{" / >4:"}{ligand.distance_distribution.over_4_angstrom}
                </p>
              </div>
              {i < ligandInteractions.length - 1 && <div style={{ height: 1, background: "var(--pio-line)" }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopContactList({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  const MONO: React.CSSProperties = { fontFamily: "var(--font-pio-mono)" };
  return (
    <div style={{ background: "var(--pio-paper)", borderRadius: 10, padding: "12px 14px" }}>
      <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--pio-graphite)", textTransform: "uppercase", marginBottom: 8 }}>{title}</p>
      {rows.length ? rows.map(([label, count]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
          <span style={{ ...MONO, fontSize: 12.5, color: "var(--pio-ink)" }}>{label}</span>
          <span style={{ ...MONO, fontSize: 12.5, fontWeight: 700, color: "var(--pio-ink)" }}>{count}</span>
        </div>
      )) : (
        <p style={{ fontSize: 12.5, color: "var(--pio-graphite)" }}>—</p>
      )}
    </div>
  );
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
    ["very-close-contact", "Very close"],
  ];
  if (showLowConfidence) {
    options.push(["low-confidence", "Low-confidence"]);
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          style={{
            borderRadius: 10,
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1,
            border: "none",
            background: value === option ? "rgba(199,217,236,0.5)" : "var(--pio-paper)",
            color: value === option ? "var(--pio-highlight)" : "var(--pio-graphite)",
            transition: "background 150ms, color 150ms",
          }}
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

const CHAIN_GRID = "1fr 1fr 1fr";

function ChainNodeIcon({ size = 20, color = "#636860" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke={color} strokeWidth="1.4" />
      <circle cx="13" cy="13" r="4.5" stroke={color} strokeWidth="1.4" />
      <line x1="7" y1="11.5" x2="13" y2="8.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </svg>
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
    <div className="min-w-0">
      {/* Heading */}
      <h2 className="text-[20px] font-bold text-[var(--pio-ink)]">Chains</h2>
      <p className="mt-1 text-[13.5px] leading-[1.5] text-[var(--pio-graphite)]">Protein residue and atom counts grouped by chain.</p>

      {chains.length ? (
        <div className="mt-4">
          {/* Header row */}
          <div
            className="border-b border-[var(--pio-line)] px-3 pb-2"
            style={{ display: "grid", gridTemplateColumns: CHAIN_GRID }}
          >
            {["CHAIN", "RESIDUES", "ATOMS"].map((col) => (
              <p key={col} className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">{col}</p>
            ))}
          </div>

          {/* Data rows — dividers are separate elements so selection card stays clean */}
          <div className="flex flex-col">
            {chains.map((chain, i) => {
              const selected = selection?.kind === "chain" && selection.chainId === chain.id;
              return (
                <div key={chain.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    onClick={() => onSelect(chain)}
                    onKeyDown={(e) => handleSelectableRowKeyDown(e, () => onSelect(chain))}
                    className={`cursor-pointer rounded-[8px] transition-colors duration-150 ${
                      selected ? "" : "hover:bg-[var(--pio-paper)]"
                    }`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: CHAIN_GRID,
                      alignItems: "center",
                      padding: "12px",
                      border: `2px solid ${selected ? "var(--pio-highlight)" : "transparent"}`,
                      background: selected ? "var(--pio-row-selection-bg)" : undefined,
                    }}
                  >
                    <p className="text-[15px] font-semibold text-[var(--pio-ink)]">{chain.id}</p>
                    <p className="font-mono text-[14px] font-medium text-[var(--pio-ink)]">{chain.residue_count.toLocaleString()}</p>
                    <p className="font-mono text-[14px] font-medium text-[var(--pio-ink)]">{chain.atom_count.toLocaleString()}</p>
                  </div>
                  {i < chains.length - 1 && (
                    <div className="mx-3 h-px bg-[var(--pio-line)]" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center">
          <ChainNodeIcon size={40} color="var(--pio-line-strong)" />
          <p className="mt-3 text-center text-[13.5px] text-[var(--pio-graphite)]">No chains detected in this structure.</p>
        </div>
      )}
    </div>
  );
}

// ─── FloatingLigandPanel ────────────────────────────────────────────────────

function FloatingLigandPanel({
  ligand,
  interaction,
  viewerRef,
  onClose,
  onExport,
}: {
  ligand: LigandSummary;
  interaction: LigandInteractionSummary | null;
  viewerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onExport: (i: LigandInteractionSummary) => void;
}) {
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 });
  const [containerW, setContainerW] = useState(400);
  const dragging = useRef(false);
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);

  const MAX_PANEL_W = 327;
  const SELECTION_BAR_H = 0;
  const SIDE_PAD = 6;
  // Panel width adapts to viewer column so it never overflows at narrow desktop sizes
  const PANEL_W = Math.min(MAX_PANEL_W, containerW - 2 * SIDE_PAD);

  useEffect(() => {
    const container = viewerRef.current;
    if (!container) return;
    setContainerW(container.offsetWidth);
    const ro = new ResizeObserver((entries) => setContainerW(entries[0].contentRect.width));
    ro.observe(container);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    dragOffset.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging.current) return;
    const container = viewerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const panelH = panelRef.current?.offsetHeight ?? 44;
    const pw = Math.min(MAX_PANEL_W, rect.width - 2 * SIDE_PAD);
    const newX = clamp(e.clientX - dragOffset.current.dx, SIDE_PAD, rect.width - pw - SIDE_PAD);
    const newY = clamp(e.clientY - dragOffset.current.dy, SIDE_PAD, rect.height - panelH - SELECTION_BAR_H - SIDE_PAD);
    setPos({ x: newX, y: newY });
  }

  function onMouseUp() {
    dragging.current = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When expanding, re-clamp pos every frame while the height animates so the
  // panel slides up to stay within bounds instead of overflowing into borders.
  useEffect(() => {
    if (minimized) return;
    const container = viewerRef.current;
    if (!container) return;
    let raf: number;
    const loop = () => {
      const panelH = panelRef.current?.offsetHeight ?? 44;
      setPos((p) => ({
        x: clamp(p.x, SIDE_PAD, container.offsetWidth - PANEL_W - SIDE_PAD),
        y: clamp(p.y, SIDE_PAD, container.offsetHeight - panelH - SELECTION_BAR_H - SIDE_PAD),
      }));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // Stop after the expand animation finishes (250ms covers the 220ms transition)
    const stop = setTimeout(() => cancelAnimationFrame(raf), 260);
    return () => { cancelAnimationFrame(raf); clearTimeout(stop); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimized]);

  const buckets = interaction?.distance_distribution ?? {
    under_2_angstrom: 0,
    two_to_3_angstrom: 0,
    three_to_4_angstrom: 0,
    over_4_angstrom: 0,
  };

  const TEXT: React.CSSProperties = { color: "#1A406A" };
  const MONO: React.CSSProperties = { fontFamily: "var(--font-pio-mono)", color: "#1A406A" };

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: 8 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: PANEL_W,
        background: "rgba(217,231,242,0.88)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderRadius: 16,
        border: "1px solid rgba(26,64,106,0.2)",
        boxShadow: "0 8px 32px rgba(26,64,106,0.18)",
        overflow: "hidden",
        zIndex: 30,
        userSelect: "none",
      }}
    >
      {/* Header */}
      <div
        onMouseDown={startDrag}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          cursor: "grab",
        }}
      >
        <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", ...TEXT }}>
          {minimized
            ? `LIGAND DETAILS — ${ligand.name} ${ligand.chain_id}:${ligand.residue_number}`
            : "LIGAND DETAILS"}
        </p>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {/* Minimize */}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              setMinimized((m) => {
                if (!m) {
                  // expanding to full — re-clamp so bottom edge stays in view
                  const container = viewerRef.current;
                  if (container) {
                    const panelH = 509;
                    setPos((p) => ({
                      x: clamp(p.x, SIDE_PAD, container.offsetWidth - PANEL_W - SIDE_PAD),
                      y: clamp(p.y, SIDE_PAD, container.offsetHeight - panelH - SELECTION_BAR_H - SIDE_PAD),
                    }));
                  }
                }
                return !m;
              });
            }}
            style={{
              width: 14, height: 14, borderRadius: "50%",
              background: minimized ? "#4A724C" : "#C09040",
              border: "none", cursor: "pointer",
            }}
            title={minimized ? "Expand" : "Minimize"}
          />
          {/* Close */}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            style={{
              width: 14, height: 14, borderRadius: "50%",
              background: "#6E2A1C",
              border: "none", cursor: "pointer",
            }}
            title="Close"
          />
        </div>
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
      {!minimized && (
        <motion.div
          key="panel-body"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          style={{ overflow: "hidden" }}
        >
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Ligand name heading */}
          <div style={{ borderBottom: "1px solid rgba(26,64,106,0.12)", paddingBottom: 10 }}>
            <p style={{ ...MONO, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>
              {ligand.name} {ligand.chain_id}:{ligand.residue_number}
            </p>
          </div>

          {/* Identity section */}
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", ...TEXT, opacity: 0.5, marginBottom: 5 }}>IDENTITY</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {[
                ["CHAIN", ligand.chain_id],
                ["RESIDUE", String(ligand.residue_number)],
                ["ATOMS", String(ligand.atom_count)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{ background: "rgba(255,255,255,0.7)", borderRadius: 2, padding: "8px 10px" }}
                >
                  <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", ...TEXT, opacity: 0.65 }}>{label}</p>
                  <p style={{ ...MONO, fontSize: 14, fontWeight: 700, marginTop: 2 }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Contact count section */}
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", ...TEXT, opacity: 0.5, marginBottom: 5 }}>CONTACT COUNTS</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {[
                ["PROTEIN", String(interaction?.protein_contact_count ?? 0)],
                ["WATER", String(interaction?.water_contact_count ?? 0)],
                ["VERY CLOSE", String(interaction?.very_close_contact_count ?? 0)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{ background: "rgba(255,255,255,0.7)", borderRadius: 2, padding: "8px 10px" }}
                >
                  <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", ...TEXT, opacity: 0.65 }}>{label}</p>
                  <p style={{ ...MONO, fontSize: 14, fontWeight: 700, marginTop: 2 }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Closest contact + distance buckets */}
          <div>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", ...TEXT, opacity: 0.5, marginBottom: 5 }}>GEOMETRY</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {/* Closest */}
            <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: 2, padding: "8px 10px" }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", ...TEXT, opacity: 0.65 }}>CLOSEST CONTACT</p>
              {interaction?.closest_contact && interaction.closest_distance_angstrom != null ? (
                <>
                  <p style={{ ...MONO, fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                    {interaction.closest_distance_angstrom.toFixed(3)} Å
                  </p>
                  <p style={{ ...MONO, fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                    {interaction.closest_contact.atom_a}–{interaction.closest_contact.atom_b}
                  </p>
                </>
              ) : (
                <p style={{ ...TEXT, fontSize: 13, marginTop: 2, opacity: 0.6 }}>—</p>
              )}
            </div>
            {/* Distance buckets */}
            <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: 2, padding: "8px 10px" }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", ...TEXT, opacity: 0.65 }}>DISTANCE BUCKETS</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 6px", marginTop: 4 }}>
                {[
                  ["<2 Å", buckets.under_2_angstrom],
                  ["2–3 Å", buckets.two_to_3_angstrom],
                  ["3–4 Å", buckets.three_to_4_angstrom],
                  [">4 Å", buckets.over_4_angstrom],
                ].map(([label, val]) => (
                  <div key={String(label)} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10, ...TEXT, opacity: 0.65 }}>{label}</span>
                    <span style={{ ...MONO, fontSize: 10, fontWeight: 700 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </div>

          {/* Contacting residue chips */}
          {interaction?.contacting_residues && interaction.contacting_residues.length > 0 && (
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", ...TEXT, opacity: 0.5, marginBottom: 5 }}>CONTACTING RESIDUES</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {interaction.contacting_residues.map((r) => (
                  <span
                    key={`${r.chain_id}-${r.residue_name}-${r.residue_number}`}
                    style={{
                      background: "rgba(199,217,236,0.6)",
                      borderRadius: 9,
                      padding: "3px 8px",
                      fontFamily: "var(--font-pio-mono)",
                      fontSize: 11,
                      fontWeight: 500,
                      color: "#1A406A",
                    }}
                  >
                    {r.chain_id}:{r.residue_name}{r.residue_number} ({r.contact_count})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Export button */}
          {interaction && (
            <button
              type="button"
              onClick={() => onExport(interaction)}
              style={{
                background: "rgba(26,64,106,0.12)",
                border: "1px solid rgba(26,64,106,0.2)",
                borderRadius: 8,
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                ...TEXT,
                cursor: "pointer",
              }}
            >
              <Download size={13} />
              Export ligand CSV
            </button>
          )}
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── LigandTable ─────────────────────────────────────────────────────────────

const LIGAND_GRID = "2fr 1fr 1fr 1fr";

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
    <div className="min-w-0">
      <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.015em", color: "var(--pio-ink)" }}>Ligands</h2>
      <p style={{ fontSize: 13.5, color: "var(--pio-graphite)", lineHeight: 1.5, marginTop: 4 }}>Non-water hetero residues detected in the structure file.</p>

      {ligands.length ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: LIGAND_GRID, borderBottom: "1px solid var(--pio-line)", padding: "8px 12px", marginTop: 16 }}>
            {["NAME", "CHAIN", "RESIDUE", "ATOMS"].map((col) => (
              <p key={col} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", color: "var(--pio-graphite)" }}>{col}</p>
            ))}
          </div>
          <div style={{ overflow: ligands.length > 6 ? undefined : undefined }}>
            {ligands.map((ligand, i) => {
              const selected =
                selection?.kind === "ligand" &&
                selection.chainId === ligand.chain_id &&
                selection.residueNumber === ligand.residue_number &&
                selection.residueName === ligand.name;
              return (
                <div key={`${ligand.name}-${ligand.chain_id}-${ligand.residue_number}`}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    onClick={() => onSelect(ligand)}
                    onKeyDown={(e) => handleSelectableRowKeyDown(e, () => onSelect(ligand))}
                    style={{
                      display: "grid",
                      gridTemplateColumns: LIGAND_GRID,
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: selected ? "var(--pio-row-selection-bg)" : undefined,
                      border: `2px solid ${selected ? "var(--pio-highlight)" : "transparent"}`,
                      cursor: "pointer",
                    }}
                    className={selected ? "" : "hover:bg-[var(--pio-paper)]"}
                  >
                    <p style={{ fontFamily: "var(--font-pio-mono)", fontSize: 13, fontWeight: 600, color: "var(--pio-ink)" }}>{ligand.name}</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--pio-ink)" }}>{ligand.chain_id}</p>
                    <p style={{ fontFamily: "var(--font-pio-mono)", fontSize: 13, fontWeight: 500, color: "var(--pio-ink)" }}>{ligand.residue_number}</p>
                    <p style={{ fontFamily: "var(--font-pio-mono)", fontSize: 13, fontWeight: 500, color: "var(--pio-ink)" }}>{ligand.atom_count}</p>
                  </div>
                  {i < ligands.length - 1 && <div style={{ height: 1, background: "var(--pio-line)", margin: "0 12px" }} />}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ textAlign: "center", paddingTop: 32 }}>
          <ChainNodeIcon size={40} color="var(--pio-line-strong)" />
          <p style={{ fontSize: 13.5, color: "var(--pio-graphite)", marginTop: 12 }}>No ligands detected in this structure.</p>
        </div>
      )}
    </div>
  );
}

function contactChipStyle(key: string): React.CSSProperties {
  if (key === "protein-protein" || key === "residue-residue")
    return { background: "rgba(202,224,210,0.7)", color: "#1B3D28" };
  if (key === "protein-ligand")
    return { background: "rgba(199,217,236,0.7)", color: "var(--pio-highlight)" };
  if (key === "protein-water")
    return { background: "rgba(199,217,236,0.5)", color: "var(--pio-highlight)" };
  if (key === "ligand-water")
    return { background: "rgba(199,217,236,0.6)", color: "var(--pio-highlight)" };
  if (key === "inter-chain" || key === "intra-chain")
    return { background: "rgba(230,220,255,0.6)", color: "#3D1A6A" };
  if (key === "very-close-contact")
    return { background: "rgba(255,220,210,0.65)", color: "#6A1A1A" };
  return { background: "rgba(199,217,236,0.6)", color: "var(--pio-highlight)" };
}

const CONTACT_GRID = "120px 1fr 100px";

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
    return (
      <div style={{ textAlign: "center", paddingTop: 32 }}>
        <ChainNodeIcon size={40} color="rgba(17,22,16,0.15)" />
        <p style={{ fontSize: 13.5, color: "var(--pio-graphite)", marginTop: 12 }}>No contacts match this filter.</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", marginTop: 16 }}>
    <div style={{ minWidth: 360 }}>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: CONTACT_GRID, columnGap: 8, borderBottom: "1px solid var(--pio-line)", padding: "8px 12px" }}>
        {["TYPE", "CATEGORIES", "RESIDUES"].map((col) => (
          <p key={col} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", color: "var(--pio-graphite)", textAlign: col === "RESIDUES" ? "right" : "left" }}>{col}</p>
        ))}
      </div>
      {/* Rows */}
      {contacts.map((contact, i) => {
        const selected = selection?.kind === "contact" && contactKey(selection.contact) === contactKey(contact);
        const chipBase: React.CSSProperties = { borderRadius: 999, fontWeight: 500, display: "inline-block", whiteSpace: "nowrap" };
        return (
          <div key={contactKey(contact)}>
            <div
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              onClick={() => onSelect(contact)}
              onKeyDown={(e) => handleSelectableRowKeyDown(e, () => onSelect(contact))}
              style={{
                display: "grid",
                gridTemplateColumns: CONTACT_GRID,
                columnGap: 8,
                alignItems: "start",
                padding: "11px 12px",
                borderRadius: 8,
                border: `2px solid ${selected ? "var(--pio-highlight)" : "transparent"}`,
                background: selected ? "var(--pio-row-selection-bg)" : undefined,
                cursor: "pointer",
              }}
              className={selected ? "" : "hover:bg-[var(--pio-paper)]"}
            >
              {/* TYPE */}
              <div>
                <span style={{ ...chipBase, ...contactChipStyle(contact.contact_type), padding: "3px 10px", fontSize: 11.5 }}>
                  {contact.contact_type}
                </span>
              </div>
              {/* CATEGORIES */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {contact.contact_categories.length ? contact.contact_categories.map((cat) => (
                  <span key={cat} style={{ ...chipBase, ...contactChipStyle(cat), padding: "3px 8px", fontSize: 11 }}>{cat}</span>
                )) : <span style={{ fontSize: 12, color: "var(--pio-graphite)" }}>—</span>}
              </div>
              {/* RESIDUES */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
                <span style={{ fontFamily: "var(--font-pio-mono)", fontSize: 12, fontWeight: 500, color: "var(--pio-ink)" }}>
                  {contact.chain_a}:{contact.residue_name_a}{contact.residue_a}
                </span>
                <span style={{ fontFamily: "var(--font-pio-mono)", fontSize: 12, fontWeight: 500, color: "var(--pio-ink)" }}>
                  {contact.chain_b}:{contact.residue_name_b}{contact.residue_b}
                </span>
              </div>
            </div>
            {i < contacts.length - 1 && <div style={{ height: 1, background: "var(--pio-line)" }} />}
          </div>
        );
      })}
      {totalCount > contacts.length ? (
        <p style={{ borderTop: "1px solid var(--pio-line)", paddingTop: 8, paddingBottom: 4, fontSize: 12, color: "var(--pio-graphite)", marginTop: 4 }}>
          Showing first {contacts.length} of {totalCount} contacts. CSV export includes all rows.
        </p>
      ) : null}
    </div>
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
    return <span title={label} className="pio-badge pio-badge-warning">Review pLDDT</span>;
  }
  return <span title={label} className="pio-badge pio-badge-active">pLDDT OK</span>;
}

function handleSelectableRowKeyDown(event: React.KeyboardEvent<HTMLElement>, onSelect: () => void) {
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
