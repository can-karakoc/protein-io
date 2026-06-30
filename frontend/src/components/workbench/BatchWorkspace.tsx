"use client";

import { AlertCircle, CheckCircle2, Download, FileUp, Loader2, Play, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

type RankedEntry = BatchDesignEntry & { score: number | null; rank: number | null };

type SortKey = "filename" | "chains" | "residues" | "contacts" | "plddt" | "score";
type SortDir = "asc" | "desc";

// Score = 70% pLDDT (confidence) + 30% contact density (relative to batch).
// Clashes subtract up to 10 points. Range 0–100.
function computeRankedEntries(entries: BatchDesignEntry[]): RankedEntry[] {
  const succeeded = entries.filter((e) => e.analysis != null);
  const maxDensity = Math.max(
    ...succeeded.map((e) => {
      const a = e.analysis!;
      return a.summary.residue_count > 0 ? a.summary.contact_count / a.summary.residue_count : 0;
    }),
    1,
  );

  const withScores: RankedEntry[] = entries.map((e) => {
    const a = e.analysis;
    if (!a) return { ...e, score: null, rank: null };

    const plddt = a.confidence?.average_plddt;
    const density = a.summary.residue_count > 0 ? a.summary.contact_count / a.summary.residue_count : 0;
    const clashes = a.interaction_summary?.possible_clash_count ?? 0;
    const residues = a.summary.residue_count || 1;

    const plddtPart = plddt != null ? (plddt / 100) * 70 : 35;
    const densityPart = (density / maxDensity) * 30;
    const clashPenalty = Math.min(10, (clashes / residues) * 200);

    return { ...e, score: Math.max(0, plddtPart + densityPart - clashPenalty), rank: null };
  });

  // Assign ranks only to succeeded entries, by descending score
  const scoredOnly = withScores
    .filter((e) => e.score != null)
    .sort((a, b) => b.score! - a.score!);
  scoredOnly.forEach((e, i) => { e.rank = i + 1; });

  return withScores;
}

function exportCsv(entries: RankedEntry[], cutoff: number) {
  const headers = ["Rank", "File", "Score", "Chains", "Residues", "Contacts", "pLDDT", "Clashes", "Status", "Error"];
  const rows = entries.map((e) => {
    const a = e.analysis;
    return [
      e.rank ?? "",
      e.filename,
      e.score != null ? e.score.toFixed(1) : "",
      a?.summary.chain_count ?? "",
      a?.summary.residue_count ?? "",
      a?.summary.contact_count ?? "",
      a?.confidence?.average_plddt?.toFixed(1) ?? "",
      a?.interaction_summary?.possible_clash_count ?? "",
      e.error ? "Error" : "OK",
      e.error ?? "",
    ];
  });
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `batch-analysis-${cutoff.toFixed(1)}A.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BatchWorkspace() {
  const [files, setFiles] = useState<File[]>([]);
  const [cutoff, setCutoff] = useState(4.0);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BatchAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
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

  const rankedEntries = useMemo(
    () => (result ? computeRankedEntries(result.entries) : []),
    [result],
  );

  const sortedEntries = useMemo(() => {
    return [...rankedEntries].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "filename") return dir * a.filename.localeCompare(b.filename);
      const va = entryMetric(a, sortKey);
      const vb = entryMetric(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return dir;
      if (vb == null) return -dir;
      return dir * (va - vb);
    });
  }, [rankedEntries, sortKey, sortDir]);

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
      setSortDir(key === "filename" ? "asc" : "desc");
    }
  }

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
        <p className="text-pio-3xl" style={{ fontWeight: 700, color: "var(--pio-ink)", marginBottom: 4 }}>
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
          <span className="text-pio-sm" style={{ fontWeight: 600, color: "var(--pio-ink)" }}>
            Drop .pdb / .cif / .mmcif files
          </span>
          <span className="text-pio-xs" style={{ color: "var(--pio-graphite)" }}>
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

        {/* File list — live files take priority; fall back to cached entry names */}
        {(files.length > 0 || (result && files.length === 0)) && (() => {
          const fromCache = files.length === 0;
          const names = fromCache ? result!.entries.map(e => e.filename) : files.map(f => f.name);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--pio-graphite)" }}>
                  Files ({names.length})
                </p>
                {fromCache && (
                  <span className="text-pio-3xs" style={{ color: "var(--pio-graphite)", opacity: 0.6, fontStyle: "italic" }}>cached</span>
                )}
              </div>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {names.map((name) => (
                  <div
                    key={name}
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
                    <span className="text-pio-xs" style={{ color: "var(--pio-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {name}
                    </span>
                    {!fromCache && (
                      <button
                        type="button"
                        onClick={() => removeFile(name)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--pio-graphite)", flexShrink: 0, lineHeight: 1 }}
                        aria-label={`Remove ${name}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Cutoff */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <label className="text-pio-xs" style={{ fontWeight: 600, color: "var(--pio-graphite)" }}>
              Distance Cutoff
            </label>
            <span className="text-pio-xs" style={{ fontFamily: "var(--font-pio-mono)", color: "var(--pio-ink)" }}>
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
            className="pio-input text-pio-base"
            style={{ width: "100%", height: 36, padding: "0 12px", fontFamily: "var(--font-pio-mono)" }}
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

        {/* Score legend */}
        {result && (
          <div style={{ borderRadius: 10, background: "var(--pio-paper)", padding: "10px 12px" }}>
            <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--pio-graphite)", marginBottom: 6 }}>
              Score formula
            </p>
            <p className="text-pio-xs" style={{ color: "var(--pio-graphite)", lineHeight: 1.6 }}>
              70% pLDDT confidence + 30% contact density − clash penalty (0–100)
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ borderRadius: 10, background: "var(--pio-coral-pale)", padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertCircle size={14} style={{ color: "var(--pio-coral-deep)", flexShrink: 0, marginTop: 1 }} />
            <span className="text-pio-xs" style={{ color: "var(--pio-coral-deep)" }}>{error}</span>
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
            <p className="text-pio-lg" style={{ color: "var(--pio-graphite)" }}>
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
            cutoff={cutoff}
            onSort={toggleSort}
            onExport={() => exportCsv(rankedEntries, cutoff)}
          />
        )}
      </div>
      </div>
    </div>
  );
}

function entryMetric(entry: RankedEntry, key: SortKey): number | null {
  const a = entry.analysis;
  if (key === "score") return entry.score;
  if (!a) return null;
  if (key === "chains") return a.summary.chain_count;
  if (key === "residues") return a.summary.residue_count;
  if (key === "contacts") return a.summary.contact_count;
  if (key === "plddt") return a.confidence?.average_plddt ?? null;
  return null;
}

const RANK_COLORS: Record<number, { color: string; bg: string }> = {
  1: { color: "var(--pio-amber-deep)", bg: "rgba(217,119,6,0.12)" },
  2: { color: "var(--pio-graphite)", bg: "var(--pio-paper)" },
  3: { color: "#92400e", bg: "rgba(146,64,14,0.10)" },
};

function BatchResultsView({
  result,
  entries,
  sortKey,
  sortDir,
  cutoff,
  onSort,
  onExport,
}: {
  result: BatchAnalysisResponse;
  entries: RankedEntry[];
  sortKey: SortKey;
  sortDir: SortDir;
  cutoff: number;
  onSort: (k: SortKey) => void;
  onExport: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      {/* Summary bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <SummaryChip icon={<CheckCircle2 size={13} />} label="Succeeded" value={result.succeeded} color="var(--pio-green-deep)" bg="var(--pio-green-pale)" />
        {result.failed > 0 && (
          <SummaryChip icon={<XCircle size={13} />} label="Failed" value={result.failed} color="var(--pio-coral-deep)" bg="var(--pio-coral-pale)" />
        )}
        <SummaryChip icon={null} label="Total" value={result.total} color="var(--pio-graphite)" bg="var(--pio-paper)" />
        <div style={{ marginLeft: "auto" }}>
          <button
            type="button"
            onClick={onExport}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 32,
              padding: "0 14px",
              borderRadius: 10,
              border: "1px solid var(--pio-line-strong)",
              background: "var(--pio-white)",
              color: "var(--pio-ink)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Download size={12} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ borderRadius: 12, border: "1px solid var(--pio-line)", overflow: "hidden", background: "var(--pio-white)" }}>
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,2fr) 60px 80px 80px 72px 72px 72px",
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
              ["score", "Score"],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <SortableHeader key={key} label={label} sortKey={key} active={sortKey === key} dir={sortDir} onSort={onSort} />
          ))}
          <div className="text-pio-3xs" style={{ padding: "8px 0", fontWeight: 700, letterSpacing: "0.08em", color: "var(--pio-graphite)", textTransform: "uppercase" }}>
            Status
          </div>
        </div>

        {/* Rows */}
        {entries.map((entry, i) => (
          <DesignRow key={entry.filename} entry={entry} isLast={i === entries.length - 1} />
        ))}
      </div>

      <p className="text-pio-xs" style={{ color: "var(--pio-graphite)", opacity: 0.7 }}>
        Score = 70% pLDDT + 30% contact density (relative to batch) − clash penalty. Cutoff: {cutoff.toFixed(1)} Å.
      </p>
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
      <span className="text-pio-sm" style={{ fontWeight: 600 }}>{label}</span>
      <span className="text-pio-lg" style={{ fontFamily: "var(--font-pio-mono)", fontWeight: 700 }}>{value}</span>
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
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: active ? "var(--pio-highlight)" : "var(--pio-graphite)",
        textTransform: "uppercase",
        textAlign: "left",
      }}
      className="text-pio-3xs"
    >
      {label}
      {active && <span className="text-pio-3xs" style={{ opacity: 0.8 }}>{dir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

function DesignRow({ entry, isLast }: { entry: RankedEntry; isLast: boolean }) {
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

  const rankStyle = entry.rank != null ? RANK_COLORS[entry.rank] : null;
  const isTopThree = entry.rank != null && entry.rank <= 3;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,2fr) 60px 80px 80px 72px 72px 72px",
        padding: "0 12px",
        borderBottom: isLast ? "none" : "1px solid var(--pio-line)",
        alignItems: "center",
        minHeight: 38,
        background: isTopThree ? "rgba(199,217,236,0.08)" : undefined,
      }}
    >
      {/* Filename + rank badge */}
      <div style={{ paddingRight: 8, overflow: "hidden", display: "flex", alignItems: "center", gap: 6 }}>
        {entry.rank != null && (
          <span
            style={{
              flexShrink: 0,
              fontWeight: 700,
              fontFamily: "var(--font-pio-mono)",
              color: rankStyle?.color ?? "var(--pio-graphite)",
              background: rankStyle?.bg ?? "var(--pio-paper)",
              borderRadius: 4,
              padding: "1px 5px",
              minWidth: 22,
              textAlign: "center",
            }}
          >
            #{entry.rank}
          </span>
        )}
        <div style={{ overflow: "hidden", flex: 1 }}>
          <span
            className="text-pio-xs"
            style={{
              fontFamily: "var(--font-pio-mono)",
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
            <span className="text-pio-3xs" style={{ color: "var(--pio-coral-deep)", display: "block", marginTop: 1 }}>
              {entry.error}
            </span>
          )}
        </div>
      </div>

      {/* Chains */}
      <Cell value={a?.summary.chain_count ?? null} mono />
      {/* Residues */}
      <Cell value={a?.summary.residue_count?.toLocaleString() ?? null} mono />
      {/* Contacts */}
      <Cell value={a?.summary.contact_count?.toLocaleString() ?? null} mono />
      {/* pLDDT */}
      <div className="text-pio-xs" style={{ fontFamily: "var(--font-pio-mono)", fontWeight: 600, color: plddt != null ? plddtColor : "var(--pio-graphite)", opacity: plddt != null ? 1 : 0.4 }}>
        {plddt != null ? plddt.toFixed(1) : "—"}
      </div>
      {/* Score */}
      <div className="text-pio-xs" style={{ fontFamily: "var(--font-pio-mono)", fontWeight: entry.rank === 1 ? 700 : 600, color: entry.score != null ? "var(--pio-ink)" : "var(--pio-graphite)", opacity: entry.score != null ? 1 : 0.4 }}>
        {entry.score != null ? entry.score.toFixed(1) : "—"}
      </div>

      {/* Status */}
      <div>
        {entry.error ? (
          <span className="text-pio-3xs" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: "var(--pio-coral-deep)", background: "var(--pio-coral-pale)", borderRadius: 6, padding: "2px 7px" }}>
            <XCircle size={10} /> Error
          </span>
        ) : (
          <span className="text-pio-3xs" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: "var(--pio-green-deep)", background: "var(--pio-green-pale)", borderRadius: 6, padding: "2px 7px" }}>
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
      className="text-pio-xs"
      style={{
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
        <p className="text-pio-xl" style={{ fontWeight: 600, color: "var(--pio-ink)" }}>
          {hasFiles ? "Ready to analyze" : "Upload structures to get started"}
        </p>
        <p className="text-pio-sm" style={{ color: "var(--pio-graphite)", marginTop: 4 }}>
          {hasFiles
            ? "Click Analyze to run batch analysis."
            : "Drop up to 50 .pdb or .cif files in the sidebar."}
        </p>
      </div>
    </div>
  );
}
