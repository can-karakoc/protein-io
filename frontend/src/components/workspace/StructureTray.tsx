"use client";

import { AlertCircle, ChevronDown, FileUp, Layers, Loader2, Play, Search, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";

import { buildApiUrl } from "@/lib/api";
import type { AnalysisResponse } from "@/lib/types";
import { type StructureEntry, type StructureFormat, useWorkspace } from "@/lib/workspaceStore";

const EXAMPLE_FILE = "/sample.pdb";
const TIMING_HEADER = "X-Processing-Ms";

type LoadTab = "file" | "pdb" | "alphafold";

type RcsbPayload = {
  filename: string;
  structure_text: string;
  structure_format: StructureFormat;
  analysis: AnalysisResponse;
};

function displayName(e: StructureEntry): string {
  if (e.source === "rcsb") return e.pdbId || e.name;
  if (e.source === "alphafold") return e.uniprotId || e.name;
  return e.name || "Untitled";
}

function sourceLabel(e: StructureEntry): string {
  if (e.source === "rcsb") return "RCSB";
  if (e.source === "alphafold") return "AlphaFold";
  if (e.source === "sample") return "Sample";
  return "Upload";
}

// ── Structure list item ───────────────────────────────────────────────────────

function StructureCard({
  entry,
  isActive,
  onSelect,
  onRemove,
}: {
  entry: StructureEntry;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "group relative w-full rounded-[10px] border px-3 py-2.5 text-left transition-all",
        isActive
          ? "border-[var(--pio-highlight)] bg-[rgba(199,217,236,0.18)] shadow-[inset_0_0_0_1.5px_var(--pio-highlight)]"
          : "border-[var(--pio-line)] bg-[var(--pio-paper)] hover:border-[var(--pio-line-strong)] hover:bg-[var(--pio-sky)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-pio-sm font-bold text-[var(--pio-ink)]"
            title={displayName(entry)}
          >
            {displayName(entry)}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-70">
              {sourceLabel(entry)}
            </span>
            {entry.analysis && (
              <span className="text-pio-3xs text-[var(--pio-graphite)] opacity-60">
                {entry.analysis.summary.residue_count.toLocaleString()} res ·{" "}
                {entry.analysis.summary.contact_count.toLocaleString()} contacts
              </span>
            )}
            {entry.isAnalyzing && (
              <Loader2 size={9} className="animate-spin text-[var(--pio-highlight)]" />
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            onRemove();
          }}
          className="mt-0.5 shrink-0 rounded-full p-0.5 text-[var(--pio-graphite)] opacity-0 transition-opacity hover:bg-[var(--pio-line)] hover:text-[var(--pio-ink)] group-hover:opacity-60 hover:!opacity-100"
          aria-label={`Remove ${displayName(entry)}`}
        >
          <X size={12} />
        </button>
      </div>
      {entry.error && (
        <p className="mt-1 text-pio-3xs text-[var(--pio-coral)] truncate" title={entry.error}>
          {entry.error}
        </p>
      )}
    </button>
  );
}

// ── Loader section ────────────────────────────────────────────────────────────

function StructureLoader({ onLoaded }: { onLoaded: () => void }) {
  const { addStructure, updateStructure } = useWorkspace();
  const [tab, setTab] = useState<LoadTab>("file");
  const [cutoff, setCutoff] = useState(4.0);
  const [pdbId, setPdbId] = useState("");
  const [uniprotId, setUniprotId] = useState("");
  const [pendingFile, setPendingFile] = useState<{ name: string; text: string; format: StructureFormat } | null>(null);
  const [paeText, setPaeText] = useState("");
  const [paeOpen, setPaeOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const TABS: Array<{ id: LoadTab; label: string }> = [
    { id: "file", label: "File" },
    { id: "pdb", label: "PDB ID" },
    { id: "alphafold", label: "UniProt" },
  ];

  function formatFromName(name: string): StructureFormat {
    return name.toLowerCase().endsWith(".pdb") ? "pdb" : "cif";
  }

  async function handleFileSelect(file: File) {
    setError(null);
    try {
      const text = await file.text();
      setPendingFile({ name: file.name, text, format: formatFromName(file.name) });
    } catch {
      setError("Could not read file.");
    }
  }

  async function analyzeUpload() {
    if (!pendingFile) return;
    setIsLoading(true);
    setError(null);
    const id = addStructure({
      name: pendingFile.name,
      source: "upload",
      pdbId: "",
      uniprotId: "",
      structureText: pendingFile.text,
      structureFormat: pendingFile.format,
      cutoff,
      analysis: null,
      isAnalyzing: true,
      error: null,
    });
    try {
      const fd = new FormData();
      fd.append(
        "file",
        new File([pendingFile.text], pendingFile.name, { type: "chemical/x-pdb" }),
      );
      if (paeText.trim()) fd.append("pae_file", new File([paeText], "pae.json", { type: "application/json" }));
      fd.append("cutoff_angstrom", String(cutoff));
      const res = await fetch(buildApiUrl("/api/analyze"), { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `Analysis failed (${res.status})`);
      }
      const analysis = (await res.json()) as AnalysisResponse;
      updateStructure(id, { analysis, isAnalyzing: false });
      onLoaded();
    } catch (e) {
      updateStructure(id, { isAnalyzing: false, error: e instanceof Error ? e.message : "Analysis failed" });
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSample() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(EXAMPLE_FILE);
      if (!res.ok) throw new Error(`Sample returned ${res.status}`);
      const text = await res.text();
      setPendingFile({ name: "sample.pdb", text, format: "pdb" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load sample");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchRcsb() {
    const id = pdbId.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(id)) {
      setError("Enter a 4-character PDB ID like 1HSG or 2HHB.");
      return;
    }
    setIsLoading(true);
    setError(null);
    const entryId = addStructure({
      name: id,
      source: "rcsb",
      pdbId: id,
      uniprotId: "",
      structureText: "",
      structureFormat: "cif",
      cutoff,
      analysis: null,
      isAnalyzing: true,
      error: null,
    });
    try {
      const res = await fetch(buildApiUrl(`/api/rcsb/${encodeURIComponent(id)}/analyze?cutoff_angstrom=${cutoff}`));
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `RCSB fetch failed (${res.status})`);
      }
      const payload = (await res.json()) as RcsbPayload;
      updateStructure(entryId, {
        structureText: payload.structure_text,
        structureFormat: payload.structure_format,
        analysis: payload.analysis,
        isAnalyzing: false,
      });
      onLoaded();
    } catch (e) {
      updateStructure(entryId, { isAnalyzing: false, error: e instanceof Error ? e.message : "Fetch failed" });
      setError(e instanceof Error ? e.message : "RCSB fetch failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchAlphaFold() {
    const id = uniprotId.trim().toUpperCase();
    if (!/^[A-Z0-9]{6,10}$/.test(id)) {
      setError("Enter a UniProt accession like P69905 or Q8WZ42.");
      return;
    }
    setIsLoading(true);
    setError(null);
    const entryId = addStructure({
      name: id,
      source: "alphafold",
      pdbId: "",
      uniprotId: id,
      structureText: "",
      structureFormat: "cif",
      cutoff,
      analysis: null,
      isAnalyzing: true,
      error: null,
    });
    try {
      const res = await fetch(buildApiUrl(`/api/alphafold/${encodeURIComponent(id)}/analyze?cutoff_angstrom=${cutoff}`));
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `AlphaFold fetch failed (${res.status})`);
      }
      const payload = (await res.json()) as RcsbPayload;
      updateStructure(entryId, {
        structureText: payload.structure_text,
        structureFormat: payload.structure_format,
        analysis: payload.analysis,
        isAnalyzing: false,
      });
      onLoaded();
    } catch (e) {
      updateStructure(entryId, { isAnalyzing: false, error: e instanceof Error ? e.message : "Fetch failed" });
      setError(e instanceof Error ? e.message : "AlphaFold fetch failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Source tabs */}
      <div className="flex gap-1 rounded-[12px] border border-[var(--pio-line)] bg-[var(--pio-paper)] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setError(null); }}
            className={[
              "flex-1 rounded-[8px] py-[5px] text-pio-xs font-semibold transition-colors",
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
        <div className="flex flex-col gap-2">
          <label className="flex min-h-[80px] cursor-pointer flex-col items-center justify-center rounded-[10px] border border-dashed border-[var(--pio-line-strong)] bg-[var(--pio-paper)] px-3 text-center transition-colors hover:bg-[var(--pio-sand)]">
            <FileUp className="mb-1 h-4 w-4 text-[var(--pio-graphite)]" />
            <span className="text-pio-xs font-semibold text-[var(--pio-ink)]">
              {pendingFile ? pendingFile.name : "Drop .pdb / .cif / .mmcif"}
            </span>
            <span className="text-pio-3xs text-[var(--pio-graphite)]">or click to browse</span>
            <input
              ref={fileRef}
              type="file"
              accept=".pdb,.cif,.mmcif"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
            />
          </label>
          <button
            type="button"
            onClick={loadSample}
            className="text-center text-pio-3xs text-[var(--pio-graphite)] transition-colors hover:text-[var(--pio-ink)] hover:underline"
          >
            or load bundled sample →
          </button>

          {/* PAE sidecar */}
          <button
            type="button"
            onClick={() => setPaeOpen((o) => !o)}
            className="flex items-center gap-1 text-pio-3xs text-[var(--pio-graphite)] opacity-70 hover:opacity-100"
          >
            <ChevronDown size={10} className={paeOpen ? "rotate-180" : ""} />
            PAE sidecar (optional)
          </button>
          {paeOpen && (
            <label className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-dashed border-[var(--pio-line)] bg-[var(--pio-paper)] px-3 py-2">
              <FileUp size={11} className="text-[var(--pio-graphite)]" />
              <span className="text-pio-3xs text-[var(--pio-graphite)]">
                {paeText ? "PAE JSON loaded" : "Upload PAE .json"}
              </span>
              <input
                type="file"
                accept=".json"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setPaeText(await f.text());
                }}
              />
            </label>
          )}

          <button
            type="button"
            onClick={analyzeUpload}
            disabled={!pendingFile || isLoading}
            className="flex items-center justify-center gap-2 rounded-[10px] bg-[var(--pio-highlight)] py-2 text-pio-sm font-semibold text-[var(--pio-highlight-text)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Analyze
          </button>
        </div>
      )}

      {/* PDB ID tab */}
      {tab === "pdb" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={pdbId}
              onChange={(e) => setPdbId(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && fetchRcsb()}
              placeholder="e.g. 1HSG"
              className="pio-input flex-1 text-pio-sm font-mono"
              style={{ height: 34, padding: "0 10px" }}
            />
            <button
              type="button"
              onClick={fetchRcsb}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-[10px] bg-[var(--pio-highlight)] px-3 py-1.5 text-pio-xs font-semibold text-[var(--pio-highlight-text)] transition-opacity disabled:opacity-40"
            >
              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              Fetch
            </button>
          </div>
          <p className="text-pio-3xs text-[var(--pio-graphite)] opacity-70">
            Fetches from RCSB PDB and analyzes immediately.
          </p>
        </div>
      )}

      {/* AlphaFold tab */}
      {tab === "alphafold" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={uniprotId}
              onChange={(e) => setUniprotId(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && fetchAlphaFold()}
              placeholder="e.g. P69905"
              className="pio-input flex-1 text-pio-sm font-mono"
              style={{ height: 34, padding: "0 10px" }}
            />
            <button
              type="button"
              onClick={fetchAlphaFold}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-[10px] bg-[var(--pio-highlight)] px-3 py-1.5 text-pio-xs font-semibold text-[var(--pio-highlight-text)] transition-opacity disabled:opacity-40"
            >
              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              Fetch
            </button>
          </div>
          <p className="text-pio-3xs text-[var(--pio-graphite)] opacity-70">
            Fetches the AlphaFold DB model and includes pLDDT confidence.
          </p>
        </div>
      )}

      {/* Cutoff */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-pio-3xs font-semibold text-[var(--pio-graphite)]">
          Cutoff
        </label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={12}
            step={0.1}
            value={cutoff}
            onChange={(e) => setCutoff(Number(e.target.value))}
            className="pio-input w-16 text-center font-mono text-pio-xs"
            style={{ height: 26, padding: "0 6px" }}
          />
          <span className="text-pio-3xs text-[var(--pio-graphite)]">Å</span>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-[8px] bg-[var(--pio-coral-pale)] p-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0 text-[var(--pio-coral-deep)]" />
          <p className="text-pio-3xs text-[var(--pio-coral-deep)]">{error}</p>
        </div>
      )}
    </div>
  );
}

// ── Main StructureTray ────────────────────────────────────────────────────────

export function StructureTray() {
  const { structures, activeId, setActiveId, removeStructure, setContextTab } = useWorkspace();
  const [loaderOpen, setLoaderOpen] = useState(structures.length === 0);

  return (
    <aside className="relative z-[1] flex h-full flex-col bg-[var(--pio-white)] shadow-[8px_0_24px_rgba(17,22,16,0.07)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--pio-line)] px-4 py-3">
        <Layers size={14} className="text-[var(--pio-highlight)] opacity-70" />
        <p className="text-pio-sm font-bold text-[var(--pio-ink)]">Structures</p>
        <span className="ml-auto rounded-full bg-[var(--pio-sky)] px-2 py-0.5 text-pio-3xs font-semibold text-[var(--pio-blue-deep)]">
          {structures.length}
        </span>
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-3 py-3 gap-2 scrollbar-thin-panel">
        {/* Structure list */}
        {structures.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {structures.map((e) => (
              <StructureCard
                key={e.id}
                entry={e}
                isActive={e.id === activeId}
                onSelect={() => {
                  setActiveId(e.id);
                  setContextTab("overview");
                }}
                onRemove={() => removeStructure(e.id)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {structures.length === 0 && !loaderOpen && (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-2 opacity-50">
            <Layers size={24} className="text-[var(--pio-graphite)]" />
            <p className="text-pio-xs text-[var(--pio-graphite)]">No structures loaded</p>
          </div>
        )}

        {/* Loader toggle */}
        <button
          type="button"
          onClick={() => setLoaderOpen((o) => !o)}
          className="flex items-center gap-2 rounded-[10px] border border-dashed border-[var(--pio-line-strong)] bg-[var(--pio-paper)] px-3 py-2 text-pio-xs font-semibold text-[var(--pio-graphite)] transition-colors hover:bg-[var(--pio-sand)] hover:text-[var(--pio-ink)]"
        >
          <FileUp size={12} />
          {loaderOpen ? "Hide loader" : structures.length === 0 ? "Load structure" : "Load another"}
          <ChevronDown
            size={11}
            className={["ml-auto transition-transform", loaderOpen ? "rotate-180" : ""].join(" ")}
          />
        </button>

        {loaderOpen && (
          <div className="rounded-[10px] border border-[var(--pio-line)] bg-[var(--pio-paper)] p-3">
            <StructureLoader onLoaded={() => { if (structures.length > 0) setLoaderOpen(false); }} />
          </div>
        )}
      </div>
    </aside>
  );
}
