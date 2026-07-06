"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ChevronDown, ChevronsLeft, Download, FileUp, GitCompare, Layers, Loader2, Play, Search, Trash2, Upload, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

import { ease, listItem, spring, stagger } from "@/lib/motion";

// Accordion body that re-flows with its (possibly nested) content via CSS grid-rows.
// framer-motion's `height: auto` animation locks a measured pixel height and clips
// with `overflow: hidden` when inner content later grows — which collapsed the sidebar
// content height and broke scrolling. grid-rows 0fr↔1fr has no such lock.
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transition: "grid-template-rows 0.26s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease",
      }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

import { buildApiUrl } from "@/lib/api";
import { buildSessionBundle, downloadSessionBundle, parseSessionBundle } from "@/lib/sessionBundle";
import type { AnalysisResponse, StructureComparisonResponse } from "@/lib/types";
import { type StructureEntry, type StructureFormat, useWorkspace } from "@/lib/workspaceStore";


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
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      className={[
        "group relative w-full cursor-pointer rounded-[10px] border px-3 py-2.5 text-left transition-all",
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
          <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
            <span className="shrink-0 text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-70">
              {sourceLabel(entry)}
            </span>
            {entry.isAnalyzing && (
              <Loader2 size={9} className="shrink-0 animate-spin text-[var(--pio-highlight)]" />
            )}
            {entry.analysis && (
              <span className="truncate text-pio-3xs text-[var(--pio-graphite)] opacity-60">
                · {entry.analysis.summary.residue_count.toLocaleString()} res · {entry.analysis.summary.contact_count.toLocaleString()} ct
              </span>
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
    </div>
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
  const [sidecarFile, setSidecarFile] = useState<File | null>(null);
  const [paeFileName, setPaeFileName] = useState("");
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
      foldseekResult: null,
      isAnalyzing: true,
      error: null,
    });
    try {
      const fd = new FormData();
      fd.append(
        "file",
        new File([pendingFile.text], pendingFile.name, { type: "chemical/x-pdb" }),
      );
      if (sidecarFile) {
        fd.append("confidence_file", sidecarFile, sidecarFile.name);
      } else if (paeText.trim()) {
        fd.append("confidence_file", new File([paeText], paeFileName || "confidence.json", { type: "application/json" }));
      }
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
      foldseekResult: null,
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
      foldseekResult: null,
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
          {/* Confidence sidecar (AlphaFold PAE / Boltz JSON / Chai NPZ) */}
          <button
            type="button"
            onClick={() => setPaeOpen((o) => !o)}
            className="flex items-center gap-1 text-pio-xs text-[var(--pio-graphite)] opacity-70 hover:opacity-100"
          >
            <ChevronDown size={10} className={paeOpen ? "rotate-180" : ""} />
            Confidence sidecar (optional)
          </button>
          <Collapsible open={paeOpen}>
                <label className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-dashed border-[var(--pio-line)] bg-[var(--pio-paper)] px-3 py-2">
                  <FileUp size={11} className="text-[var(--pio-graphite)]" />
                  <span className="text-pio-xs text-[var(--pio-graphite)]">
                    {paeFileName || "Upload .json or .npz"}
                  </span>
                  <input
                    type="file"
                    accept=".json,.npz,application/json"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setPaeFileName(f.name);
                      if (f.name.toLowerCase().endsWith(".npz")) {
                        setSidecarFile(f);
                        setPaeText("");
                      } else {
                        setPaeText(await f.text());
                        setSidecarFile(null);
                      }
                    }}
                  />
                </label>
          </Collapsible>

          <motion.button
            type="button"
            onClick={analyzeUpload}
            disabled={!pendingFile || isLoading}
            whileTap={!pendingFile || isLoading ? undefined : { scale: 0.97 }}
            transition={spring.press}
            className="flex items-center justify-center gap-2 rounded-[10px] bg-[var(--pio-highlight)] py-2 text-pio-sm font-semibold text-[var(--pio-highlight-text)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Analyze
          </motion.button>
        </div>
      )}

      {/* PDB ID tab */}
      {tab === "pdb" && (
        <div className="flex flex-col gap-2">
          <label className="pio-label" htmlFor="tray-pdb-id">PDB ID</label>
          <input
            id="tray-pdb-id"
            type="text"
            value={pdbId}
            maxLength={4}
            onChange={(e) => setPdbId(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && fetchRcsb()}
            placeholder="e.g. 2HHB"
            className="pio-input h-9 w-full bg-[var(--pio-paper)] px-3 font-[family-name:var(--font-pio-mono)] text-pio-sm uppercase"
          />
          <motion.button
            type="button"
            onClick={fetchRcsb}
            disabled={isLoading || !pdbId.trim()}
            whileTap={isLoading || !pdbId.trim() ? undefined : { scale: 0.97 }}
            transition={spring.press}
            className="flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-[var(--pio-line)] py-2 text-pio-base font-semibold text-[var(--pio-ink)] transition-colors hover:bg-[var(--pio-line-strong)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            Fetch
          </motion.button>
          <p className="text-pio-xs text-[var(--pio-graphite)]">Fetches mmCIF from RCSB.</p>
        </div>
      )}

      {/* AlphaFold tab */}
      {tab === "alphafold" && (
        <div className="flex flex-col gap-2">
          <label className="pio-label" htmlFor="tray-uniprot-id">UniProt accession</label>
          <input
            id="tray-uniprot-id"
            type="text"
            value={uniprotId}
            maxLength={10}
            onChange={(e) => setUniprotId(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && fetchAlphaFold()}
            placeholder="e.g. P69905"
            className="pio-input h-9 w-full bg-[var(--pio-paper)] px-3 font-[family-name:var(--font-pio-mono)] text-pio-sm uppercase"
          />
          <motion.button
            type="button"
            onClick={fetchAlphaFold}
            disabled={isLoading || !uniprotId.trim()}
            whileTap={isLoading || !uniprotId.trim() ? undefined : { scale: 0.97 }}
            transition={spring.press}
            className="flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-[var(--pio-line)] py-2 text-pio-base font-semibold text-[var(--pio-ink)] transition-colors hover:bg-[var(--pio-line-strong)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            Fetch
          </motion.button>
          <p className="text-pio-xs text-[var(--pio-graphite)]">Fetches AlphaFold predicted model via UniProt accession.</p>
        </div>
      )}

      {/* Cutoff — matches original ExploreSidebar design */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="pio-label" htmlFor="tray-cutoff">Distance Cutoff</label>
          <span className="font-[family-name:var(--font-pio-mono)] text-pio-xs text-[var(--pio-ink)]">{cutoff.toFixed(1)} Å</span>
        </div>
        <input
          id="tray-cutoff"
          type="number"
          min={1}
          max={12}
          step={0.1}
          value={cutoff}
          onChange={(e) => setCutoff(Number(e.target.value))}
          className="pio-input h-9 w-full bg-[var(--pio-paper)] px-3 font-[family-name:var(--font-pio-mono)] text-pio-sm"
        />
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

// ── Compare panel (shown when ≥2 structures loaded) ───────────────────────────

function displayLabel(e: StructureEntry) {
  return e.pdbId || e.uniprotId || e.name || "Untitled";
}

function ComparePanel() {
  const {
    structures, compareIds, setCompareId,
    compareIsLoading, compareError, setComparison, setCompareLoading, setContextTab,
  } = useWorkspace();

  const [open, setOpen] = useState(false);

  const idA = compareIds[0];
  const idB = compareIds[1];
  const ready = idA && idB && idA !== idB;
  const entA = structures.find((s) => s.id === idA);
  const entB = structures.find((s) => s.id === idB);

  async function runCompare() {
    if (!entA || !entB) return;
    if (!entA.structureText || !entB.structureText) {
      setComparison(null, "3D structure data is still loading — please wait a moment and try again.");
      return;
    }
    setCompareLoading(true);
    setContextTab("compare");
    const ext = (e: StructureEntry) => e.structureFormat === "cif" ? ".cif" : ".pdb";
    const toFile = (e: StructureEntry) =>
      new File([e.structureText], `${displayLabel(e)}${ext(e)}`, { type: "text/plain" });

    const fd = new FormData();
    fd.append("file_a", toFile(entA));
    fd.append("file_b", toFile(entB));
    fd.append("cutoff_angstrom", String(Math.max(entA.cutoff ?? 4, entB.cutoff ?? 4)));

    try {
      const res = await fetch(buildApiUrl("/api/compare"), { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { detail?: string } | null;
        throw new Error(body?.detail ?? `Compare failed (${res.status})`);
      }
      const data = (await res.json()) as StructureComparisonResponse;
      setComparison(data);
    } catch (e) {
      setComparison(null, e instanceof Error ? e.message : "Comparison failed");
    }
  }

  return (
    <div className="border-t border-[var(--pio-line)] mx-3" >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-1 py-2.5 text-pio-xs font-semibold text-[var(--pio-graphite)] hover:text-[var(--pio-ink)] transition-colors"
      >
        <GitCompare size={12} />
        Compare
        <ChevronDown size={11} className={["ml-auto transition-transform", open ? "rotate-180" : ""].join(" ")} />
      </button>

      <Collapsible open={open}>
            <div className="flex flex-col gap-2 pb-4 px-1">
              {([0, 1] as const).map((slot) => (
                <div key={slot}>
                  <p className="mb-1 text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">
                    Structure {slot === 0 ? "A" : "B"}
                  </p>
                  <select
                    value={compareIds[slot] ?? ""}
                    onChange={(e) => {
                      const newId = e.target.value || null;
                      setCompareId(slot, newId);
                      const otherId = slot === 0 ? compareIds[1] : compareIds[0];
                      if (newId && otherId && newId !== otherId) void runCompare();
                    }}
                    className="pio-input w-full text-pio-xs"
                    style={{ height: 32, padding: "0 8px" }}
                  >
                    <option value="">— select —</option>
                    {structures.map((s) => (
                      <option key={s.id} value={s.id}>{displayLabel(s)}</option>
                    ))}
                  </select>
                </div>
              ))}

              {compareIsLoading && (
                <div className="flex items-center justify-center gap-2 py-1 text-pio-3xs text-[var(--pio-graphite)]">
                  <Loader2 size={11} className="animate-spin" /> Comparing…
                </div>
              )}

              {compareError && (
                <div className="flex items-start gap-2 rounded-[8px] bg-[var(--pio-coral-pale)] p-2">
                  <AlertCircle size={11} className="mt-0.5 shrink-0 text-[var(--pio-coral-deep)]" />
                  <p className="text-pio-3xs text-[var(--pio-coral-deep)]">{compareError}</p>
                </div>
              )}
            </div>
      </Collapsible>
    </div>
  );
}

// ── Session export / import ───────────────────────────────────────────────────

function SessionControls() {
  const { structures, addStructure, setActiveId, setContextTab } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function exportSession() {
    setError(null);
    downloadSessionBundle(buildSessionBundle(structures), `protein-io-session-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function importSession(file: File) {
    setError(null);
    try {
      const items = parseSessionBundle(await file.text());
      let firstId: string | null = null;
      for (const s of items) {
        const id = addStructure({ ...s, isAnalyzing: false, error: null });
        firstId ??= id;
      }
      if (firstId) { setActiveId(firstId); setContextTab("overview"); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import session.");
    }
  }

  const btn = "flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-[var(--pio-line)] bg-[var(--pio-paper)] py-1.5 text-pio-xs font-semibold text-[var(--pio-graphite)] hover:border-[var(--pio-line-strong)] hover:text-[var(--pio-ink)] transition-colors";

  return (
    <div className="border-t border-[var(--pio-line)] mx-3 flex flex-col gap-2 pt-3 pb-4">
      <p className="px-1 text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-70">Session</p>
      <div className="flex gap-2 px-1">
        {structures.length > 0 && (
          <button type="button" onClick={exportSession} className={btn} title="Save all loaded structures + analyses to a file">
            <Download size={12} /> Export
          </button>
        )}
        <button type="button" onClick={() => inputRef.current?.click()} className={btn} title="Restore a saved session file">
          <Upload size={12} /> Import
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importSession(f); e.target.value = ""; }}
        />
      </div>
      {error && (
        <div className="flex items-start gap-1.5 rounded-[8px] bg-[var(--pio-coral-pale)] px-2 py-1.5 mx-1">
          <AlertCircle size={11} className="mt-0.5 shrink-0 text-[var(--pio-coral-deep)]" />
          <p className="text-pio-3xs text-[var(--pio-coral-deep)]">{error}</p>
        </div>
      )}
    </div>
  );
}

// ── Main StructureTray ────────────────────────────────────────────────────────

export function StructureTray({ onCollapse }: { onCollapse?: () => void } = {}) {
  const { structures, activeId, setActiveId, removeStructure, setContextTab } = useWorkspace();
  const [loaderOpen, setLoaderOpen] = useState(structures.length === 0);

  return (
    <aside className="flex flex-1 min-h-0 flex-col bg-[var(--pio-white)]">
      {/* Header — only visible when structures are loaded */}
      {structures.length > 0 && (
        <div className="flex items-center gap-2 border-b border-[var(--pio-line)] px-4 py-3 flex-shrink-0">
          <Layers size={14} className="text-[var(--pio-highlight)] opacity-70 shrink-0" />
          <p className="text-pio-sm font-bold text-[var(--pio-ink)]">Structures</p>
          <span className="ml-auto rounded-full bg-[var(--pio-sky)] px-2 py-0.5 text-pio-3xs font-semibold text-[var(--pio-blue-deep)] shrink-0">
            {structures.length}
          </span>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[var(--pio-graphite)] hover:bg-[var(--pio-sky)] hover:text-[var(--pio-ink)] transition-colors"
              title="Collapse panel"
            >
              <ChevronsLeft size={12} />
            </button>
          )}
        </div>
      )}

      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto scrollbar-thin-report">
        {/* Empty state: loader fills full width with sidebar-matching padding */}
        {structures.length === 0 && (
          <>
            <div className="px-6 py-5">
              <p className="mb-4 text-pio-3xl font-bold text-[var(--pio-ink)]">Load Structure</p>
              <StructureLoader onLoaded={() => {}} />
            </div>
            <SessionControls />
          </>
        )}

        {/* Loaded state: list + collapsible "Load another" */}
        {structures.length > 0 && (
          <>
            <motion.div
              className="flex flex-col gap-1.5 px-3 py-3"
              initial="hidden"
              animate="show"
              variants={stagger}
            >
              <AnimatePresence>
                {structures.map((e) => (
                  <motion.div
                    key={e.id}
                    variants={listItem}
                    exit={{ opacity: 0, y: -6, transition: { duration: 0.15, ease: ease.inOut } }}
                    layout
                  >
                    <StructureCard
                      entry={e}
                      isActive={e.id === activeId}
                      onSelect={() => {
                        setActiveId(e.id);
                        setContextTab("overview");
                      }}
                      onRemove={() => removeStructure(e.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>

            {/* Load another toggle */}
            <div className="border-t border-[var(--pio-line)] mx-3" />
            <button
              type="button"
              onClick={() => setLoaderOpen((o) => !o)}
              className="flex items-center gap-2 px-4 py-2.5 text-pio-xs font-semibold text-[var(--pio-graphite)] hover:text-[var(--pio-ink)] transition-colors"
            >
              <FileUp size={12} />
              {loaderOpen ? "Hide loader" : "Load another"}
              <ChevronDown
                size={11}
                className={["ml-auto transition-transform", loaderOpen ? "rotate-180" : ""].join(" ")}
              />
            </button>

            <Collapsible open={loaderOpen}>
              <div className="px-6 pb-5">
                <StructureLoader onLoaded={() => setLoaderOpen(false)} />
              </div>
            </Collapsible>

            {/* Compare panel — only when ≥2 structures are loaded */}
            {structures.length >= 2 && <ComparePanel />}

            {/* Session export / import */}
            <SessionControls />
          </>
        )}
      </div>
    </aside>
  );
}
