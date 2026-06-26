"use client";

import { AlertCircle, CheckCircle2, FileUp, Loader2, Play, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buildApiUrl } from "@/lib/api";
import type { AnalysisResponse } from "@/lib/types";

const BATCH_CACHE_KEY = "pio_batch_cache_v1";

function loadBatchCache(): BatchAnalysisResponse | null {
  try {
    const raw = localStorage.getItem(BATCH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version: 1; result: BatchAnalysisResponse };
    if (parsed.version !== 1 || !parsed.result?.entries) return null;
    return parsed.result;
  } catch {
    return null;
  }
}

function saveBatchCache(result: BatchAnalysisResponse) {
  try {
    localStorage.setItem(BATCH_CACHE_KEY, JSON.stringify({ version: 1, result }));
  } catch {
    // QuotaExceededError on very large batches — silently skip
  }
}

type BatchDesignEntry = {
  filename: string;
  analysis: AnalysisResponse | null;
  error: string | null;
};

type BatchAnalysisResponse = {
  entries: BatchDesignEntry[];
  total: number;
  succeeded: number;
  failed: number;
};

type SortKey = "filename" | "chains" | "residues" | "contacts" | "plddt";
type SortDir = "asc" | "desc";

export function BatchWorkspace() {
  const [files, setFiles] = useState<File[]>([]);
  const [cutoff, setCutoff] = useState(4.0);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BatchAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("filename");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore cached results on mount
  useEffect(() => {
    const cached = loadBatchCache();
    if (cached) setResult(cached);
  }, []);

  // Persist results whenever they change
  useEffect(() => {
    if (result) saveBatchCache(result);
  }, [result]);

  function handleFiles(incoming: FileList | null) {
    if (!incoming) return;
    const accepted = Array.from(incoming).filter((f) =>
      /\.(pdb|cif|mmcif)$/i.test(f.name)
    );
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...accepted.filter((f) => !names.has(f.name))];
    });
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  function reset() {
    setFiles([]);
    setResult(null);
    setError(null);
    try { localStorage.removeItem(BATCH_CACHE_KEY); } catch { /* ignore */ }
  }

  async function analyze() {
    if (files.length === 0) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      for (const f of files) formData.append("files", f, f.name);
      formData.append("cutoff_angstrom", String(cutoff));
      const res = await fetch(buildApiUrl("/api/batch/analyze"), {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const detail = await res.json().then((j: { detail?: string }) => j.detail).catch(() => null);
        throw new Error(detail ?? `Server error ${res.status}`);
      }
      const data = (await res.json()) as BatchAnalysisResponse;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedEntries = result
    ? [...result.entries].sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortKey === "filename") return dir * a.filename.localeCompare(b.filename);
        const va = entryMetric(a, sortKey);
        const vb = entryMetric(b, sortKey);
        if (va == null && vb == null) return 0;
        if (va == null) return dir;
        if (vb == null) return -dir;
        return dir * (va - vb);
      })
    : [];

  return (
    <div className="h-full flex flex-col overflow-clip rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)]">
      <div className="flex flex-1 min-h-0">
      {/* Sidebar */}
      <aside
        style={{
          width: 280,
          flexShrink: 0,
          background: "var(--pio-white)",
          borderRight: "1px solid var(--pio-line)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          padding: "20px 20px 24px",
          gap: 16,
        }}
      >
        <p style={{ fontSize: 20, fontWeight: 700, color: "var(--pio-ink)", marginBottom: 4 }}>
          Batch Analysis
        </p>

        {/* Drop zone */}
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 96,
            borderRadius: 12,
            border: "1.5px dashed var(--pio-line-strong)",
            background: "var(--pio-paper)",
            cursor: "pointer",
            padding: "12px 16px",
            textAlign: "center",
            gap: 6,
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
        >
          <FileUp size={16} style={{ color: "var(--pio-graphite)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--pio-ink)" }}>
            Drop .pdb / .cif / .mmcif files
          </span>
          <span style={{ fontSize: 11, color: "var(--pio-graphite)" }}>
            or click to browse (max 50)
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".pdb,.cif,.mmcif"
            multiple
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>

        {/* File list */}
        {files.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--pio-graphite)", marginBottom: 2 }}>
              Files ({files.length})
            </p>
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {files.map((f) => (
                <div
                  key={f.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "3px 6px",
                    borderRadius: 6,
                    background: "var(--pio-paper)",
                    marginBottom: 2,
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 10.5, color: "var(--pio-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {f.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(f.name)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--pio-graphite)", flexShrink: 0, lineHeight: 1 }}
                    aria-label={`Remove ${f.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cutoff */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--pio-graphite)" }}>
              Distance Cutoff
            </label>
            <span style={{ fontFamily: "var(--font-pio-mono)", fontSize: 11, color: "var(--pio-ink)" }}>
              {cutoff.toFixed(1)} Å
            </span>
          </div>
          <input
            type="number"
            min={1}
            max={12}
            step={0.1}
            value={cutoff}
            onChange={(e) => setCutoff(Number(e.target.value))}
            className="pio-input"
            style={{ width: "100%", height: 36, padding: "0 12px", fontFamily: "var(--font-pio-mono)", fontSize: 13 }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={files.length === 0 || isLoading}
            style={{
              height: 40,
              borderRadius: 12,
              background: "var(--pio-highlight)",
              color: "var(--pio-highlight-text)",
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              cursor: files.length === 0 || isLoading ? "not-allowed" : "pointer",
              opacity: files.length === 0 || isLoading ? 0.45 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Analyze
          </button>
          {(files.length > 0 || result) && (
            <button
              type="button"
              onClick={reset}
              style={{
                height: 36,
                borderRadius: 12,
                background: "var(--pio-white)",
                color: "var(--pio-ink)",
                border: "1px solid var(--pio-highlight)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
              }}
            >
              <RotateCcw size={13} />
              Reset
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ borderRadius: 10, background: "var(--pio-coral-pale)", padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertCircle size={14} style={{ color: "var(--pio-coral-deep)", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11, color: "var(--pio-coral-deep)" }}>{error}</span>
          </div>
        )}
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: "20px 24px", overflowY: "auto" }}>
        {!result && !isLoading && (
          <EmptyState hasFiles={files.length > 0} />
        )}
        {isLoading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 14 }}>
            <Loader2 size={28} className="animate-spin" style={{ color: "var(--pio-highlight)" }} />
            <p style={{ fontSize: 14, color: "var(--pio-graphite)" }}>
              Analyzing {files.length} structure{files.length !== 1 ? "s" : ""}…
            </p>
          </div>
        )}
        {result && !isLoading && (
          <BatchResultsView
            result={result}
            entries={sortedEntries}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
          />
        )}
      </div>
      </div>
    </div>
  );
}

function entryMetric(entry: BatchDesignEntry, key: SortKey): number | null {
  const a = entry.analysis;
  if (!a) return null;
  if (key === "chains") return a.summary.chain_count;
  if (key === "residues") return a.summary.residue_count;
  if (key === "contacts") return a.summary.contact_count;
  if (key === "plddt") return a.confidence?.average_plddt ?? null;
  return null;
}

function BatchResultsView({
  result,
  entries,
  sortKey,
  sortDir,
  onSort,
}: {
  result: BatchAnalysisResponse;
  entries: BatchDesignEntry[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      {/* Summary bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <SummaryChip icon={<CheckCircle2 size={13} />} label="Succeeded" value={result.succeeded} color="var(--pio-green-deep)" bg="var(--pio-green-pale)" />
        {result.failed > 0 && (
          <SummaryChip icon={<XCircle size={13} />} label="Failed" value={result.failed} color="var(--pio-coral-deep)" bg="var(--pio-coral-pale)" />
        )}
        <SummaryChip icon={null} label="Total" value={result.total} color="var(--pio-graphite)" bg="var(--pio-paper)" />
      </div>

      {/* Table */}
      <div style={{ borderRadius: 12, border: "1px solid var(--pio-line)", overflow: "hidden", background: "var(--pio-white)" }}>
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,2fr) 60px 80px 80px 80px 80px",
            background: "var(--pio-paper)",
            borderBottom: "1px solid var(--pio-line)",
            padding: "0 12px",
          }}
        >
          {(
            [
              ["filename", "File"],
              ["chains", "Chains"],
              ["residues", "Residues"],
              ["contacts", "Contacts"],
              ["plddt", "pLDDT"],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <SortableHeader key={key} label={label} sortKey={key} active={sortKey === key} dir={sortDir} onSort={onSort} />
          ))}
          <div style={{ padding: "8px 0", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--pio-graphite)", textTransform: "uppercase" }}>
            Status
          </div>
        </div>

        {/* Rows */}
        {entries.map((entry, i) => (
          <DesignRow key={entry.filename} entry={entry} isLast={i === entries.length - 1} />
        ))}
      </div>
    </div>
  );
}

function SummaryChip({
  icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: bg,
        borderRadius: 8,
        padding: "5px 12px",
        color,
      }}
    >
      {icon}
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-pio-mono)", fontSize: 14, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "8px 0",
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: active ? "var(--pio-highlight)" : "var(--pio-graphite)",
        textTransform: "uppercase",
        textAlign: "left",
      }}
    >
      {label}
      {active && <span style={{ fontSize: 9, opacity: 0.8 }}>{dir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

function DesignRow({ entry, isLast }: { entry: BatchDesignEntry; isLast: boolean }) {
  const a = entry.analysis;
  const plddt = a?.confidence?.average_plddt;
  const plddtColor =
    plddt == null
      ? "var(--pio-graphite)"
      : plddt >= 90
      ? "var(--pio-green-deep)"
      : plddt >= 70
      ? "var(--pio-ink)"
      : "var(--pio-coral)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,2fr) 60px 80px 80px 80px 80px",
        padding: "0 12px",
        borderBottom: isLast ? "none" : "1px solid var(--pio-line)",
        alignItems: "center",
        minHeight: 38,
      }}
    >
      {/* Filename */}
      <div style={{ paddingRight: 8, overflow: "hidden" }}>
        <span
          style={{
            fontFamily: "var(--font-pio-mono)",
            fontSize: 11,
            color: "var(--pio-ink)",
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={entry.filename}
        >
          {entry.filename}
        </span>
        {entry.error && (
          <span style={{ fontSize: 10, color: "var(--pio-coral-deep)", display: "block", marginTop: 1 }}>
            {entry.error}
          </span>
        )}
      </div>

      {/* Chains */}
      <Cell value={a?.summary.chain_count ?? null} mono />
      {/* Residues */}
      <Cell value={a?.summary.residue_count?.toLocaleString() ?? null} mono />
      {/* Contacts */}
      <Cell value={a?.summary.contact_count?.toLocaleString() ?? null} mono />
      {/* pLDDT */}
      <div style={{ fontSize: 11, fontFamily: "var(--font-pio-mono)", fontWeight: 600, color: plddt != null ? plddtColor : "var(--pio-graphite)", opacity: plddt != null ? 1 : 0.4 }}>
        {plddt != null ? plddt.toFixed(1) : "—"}
      </div>

      {/* Status */}
      <div>
        {entry.error ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "var(--pio-coral-deep)", background: "var(--pio-coral-pale)", borderRadius: 6, padding: "2px 7px" }}>
            <XCircle size={10} /> Error
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "var(--pio-green-deep)", background: "var(--pio-green-pale)", borderRadius: 6, padding: "2px 7px" }}>
            <CheckCircle2 size={10} /> OK
          </span>
        )}
      </div>
    </div>
  );
}

function Cell({ value, mono }: { value: string | number | null; mono?: boolean }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontFamily: mono ? "var(--font-pio-mono)" : undefined,
        color: value != null ? "var(--pio-ink)" : "var(--pio-graphite)",
        opacity: value != null ? 1 : 0.4,
      }}
    >
      {value ?? "—"}
    </div>
  );
}

function EmptyState({ hasFiles }: { hasFiles: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 12,
        opacity: 0.5,
      }}
    >
      <FileUp size={32} style={{ color: "var(--pio-graphite)" }} />
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--pio-ink)" }}>
          {hasFiles ? "Ready to analyze" : "Upload structures to get started"}
        </p>
        <p style={{ fontSize: 12, color: "var(--pio-graphite)", marginTop: 4 }}>
          {hasFiles
            ? "Click Analyze to run batch analysis."
            : "Drop up to 50 .pdb or .cif files in the sidebar."}
        </p>
      </div>
    </div>
  );
}
