"use client";

import { AlertCircle, CheckCircle2, Download, FileText, FileUp, Loader2, Network, Play, RotateCcw, XCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { buildApiUrl } from "@/lib/api";
import { buildCampaignReportHtml, downloadCampaignReport, type CampaignReportRow } from "@/lib/campaignReport";
import type { BatchAnalysisResponse, BatchClusterResponse, BatchDesignEntry } from "@/lib/types";
import { useWorkspace } from "@/lib/workspaceStore";

type RankedEntry = BatchDesignEntry & { score: number | null; rank: number | null; cluster: number | null };

type SortKey = "filename" | "chains" | "residues" | "contacts" | "plddt" | "bsa" | "iptm" | "ipae" | "pb" | "cluster" | "score";
type SortDir = "asc" | "desc";

// ── Per-design derived metrics ────────────────────────────────────────────────

// Largest interface buried surface area across a design's chain pairs (binder-campaign
// signal). Null for single-chain designs.
function designBsa(a: BatchDesignEntry["analysis"]): number | null {
  const vals = (a?.interface_analysis?.chain_pairs ?? [])
    .map((p) => p.interface_bsa)
    .filter((v): v is number => v != null);
  return vals.length ? Math.max(...vals) : null;
}

// Interface predicted TM (multimer confidence) — from the confidence sidecar.
function designIptm(a: BatchDesignEntry["analysis"]): number | null {
  return a?.global_scores?.iptm ?? null;
}

// Best (lowest) interface PAE across chain pairs. Requires a PAE sidecar. Lower is better.
function designIpae(a: BatchDesignEntry["analysis"]): number | null {
  const vals = (a?.interface_analysis?.chain_pairs ?? [])
    .map((p) => p.interface_pae)
    .filter((v): v is number => v != null);
  return vals.length ? Math.min(...vals) : null;
}

// PoseBusters pass count over scored ligands (requires include_validity). Null if none.
function designPb(a: BatchDesignEntry["analysis"]): { passed: number; total: number } | null {
  const scored = (a?.ligand_validity ?? []).filter((v) => v.pb_valid != null);
  if (!scored.length) return null;
  return { passed: scored.filter((v) => v.pb_valid === true).length, total: scored.length };
}

function densityOf(e: BatchDesignEntry): number {
  const a = e.analysis;
  return a && a.summary.residue_count > 0 ? a.summary.contact_count / a.summary.residue_count : 0;
}

type Signals = { plddt: boolean; bsa: boolean; iptm: boolean; ipae: boolean; pb: boolean };

// Which optional signals appear anywhere in this campaign — drives scoring weights,
// which table columns show, and the score-formula legend.
function activeSignals(entries: BatchDesignEntry[]): Signals {
  const s = entries.filter((e) => e.analysis != null);
  return {
    plddt: s.some((e) => e.analysis!.confidence?.average_plddt != null),
    bsa: s.some((e) => designBsa(e.analysis) != null),
    iptm: s.some((e) => designIptm(e.analysis) != null),
    ipae: s.some((e) => designIpae(e.analysis) != null),
    pb: s.some((e) => designPb(e.analysis) != null),
  };
}

function scoreFormulaText(active: Signals): string {
  const parts: string[] = [];
  if (active.plddt) parts.push("pLDDT confidence");
  parts.push("contact density");
  if (active.bsa) parts.push("interface buried area");
  if (active.iptm) parts.push("ipTM");
  if (active.ipae) parts.push("interface PAE");
  if (active.pb) parts.push("PB-valid");
  return `Score (0–100): ${parts.join(" + ")}, weighted, minus a clash penalty.`;
}

// Component-based composite score. Only signals present in the campaign contribute; their
// relative weights are normalised to 100. A design missing a present signal gets half
// credit for it (so it isn't unfairly zeroed). Clashes subtract up to 10.
const BASE_WEIGHTS = { plddt: 3, density: 1.5, bsa: 2, iptm: 3, ipae: 2, pb: 2 } as const;

function computeRankedEntries(
  entries: BatchDesignEntry[],
  assignments: Record<string, number> | null,
): RankedEntry[] {
  const succeeded = entries.filter((e) => e.analysis != null);
  const maxDensity = Math.max(...succeeded.map(densityOf), 1);
  const maxBsa = Math.max(...succeeded.map((e) => designBsa(e.analysis) ?? 0), 1);
  const active = activeSignals(entries);

  const on: Record<keyof typeof BASE_WEIGHTS, boolean> = {
    plddt: active.plddt, density: true, bsa: active.bsa, iptm: active.iptm, ipae: active.ipae, pb: active.pb,
  };
  const totalW = (Object.keys(BASE_WEIGHTS) as (keyof typeof BASE_WEIGHTS)[])
    .filter((k) => on[k]).reduce((sum, k) => sum + BASE_WEIGHTS[k], 0) || 1;
  const weight = (k: keyof typeof BASE_WEIGHTS) => (on[k] ? (BASE_WEIGHTS[k] / totalW) * 100 : 0);

  const withScores: RankedEntry[] = entries.map((e) => {
    const a = e.analysis;
    const cluster = assignments?.[e.filename] ?? null;
    if (!a) return { ...e, score: null, rank: null, cluster };

    const pb = designPb(a);
    const ipae = designIpae(a);
    const values: Record<keyof typeof BASE_WEIGHTS, number | null> = {
      plddt: a.confidence?.average_plddt != null ? a.confidence.average_plddt / 100 : null,
      density: densityOf(e) / maxDensity,
      bsa: designBsa(a) != null ? (designBsa(a)! / maxBsa) : null,
      iptm: designIptm(a),
      ipae: ipae != null ? Math.max(0, 1 - Math.min(ipae / 30, 1)) : null, // 30 Å ≈ worst
      pb: pb ? (pb.total ? pb.passed / pb.total : 1) : null,
    };

    let score = 0;
    for (const k of Object.keys(BASE_WEIGHTS) as (keyof typeof BASE_WEIGHTS)[]) {
      if (!on[k]) continue;
      const v = values[k];
      score += (v != null ? v : 0.5) * weight(k); // half credit when missing for this design
    }
    const clashes = a.interaction_summary?.possible_clash_count ?? 0;
    const residues = a.summary.residue_count || 1;
    const clashPenalty = Math.min(10, (clashes / residues) * 200);
    return { ...e, score: Math.max(0, score - clashPenalty), rank: null, cluster };
  });

  withScores
    .filter((e) => e.score != null)
    .sort((a, b) => b.score! - a.score!)
    .forEach((e, i) => { e.rank = i + 1; });

  return withScores;
}

function exportCsv(entries: RankedEntry[], active: Signals, cutoff: number) {
  const headers = [
    "Rank", "File", "Score", "Chains", "Residues", "Contacts", "pLDDT", "Interface BSA (A^2)",
    ...(active.iptm ? ["ipTM"] : []),
    ...(active.ipae ? ["Interface PAE (A)"] : []),
    ...(active.pb ? ["PB-valid"] : []),
    "Cluster", "Clashes", "Status", "Error",
  ];
  const rows = entries.map((e) => {
    const a = e.analysis;
    const bsa = designBsa(a);
    const pb = designPb(a);
    const ipae = designIpae(a);
    return [
      e.rank ?? "",
      e.filename,
      e.score != null ? e.score.toFixed(1) : "",
      a?.summary.chain_count ?? "",
      a?.summary.residue_count ?? "",
      a?.summary.contact_count ?? "",
      a?.confidence?.average_plddt?.toFixed(1) ?? "",
      bsa != null ? bsa.toFixed(0) : "",
      ...(active.iptm ? [designIptm(a)?.toFixed(2) ?? ""] : []),
      ...(active.ipae ? [ipae != null ? ipae.toFixed(1) : ""] : []),
      ...(active.pb ? [pb ? `${pb.passed}/${pb.total}` : ""] : []),
      e.cluster ?? "",
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
  // Results live in the workspace store (persisted to IndexedDB) so they survive
  // switching modes — which unmounts this component — and page refreshes.
  const result = useWorkspace((s) => s.batchResult);
  const setResult = useWorkspace((s) => s.setBatchResult);
  const clusterResult = useWorkspace((s) => s.batchCluster);
  const setClusterResult = useWorkspace((s) => s.setBatchCluster);
  const [files, setFiles] = useState<File[]>([]);
  const [sidecars, setSidecars] = useState<File[]>([]);
  const [includeValidity, setIncludeValidity] = useState(false);
  const [cutoff, setCutoff] = useState(4.0);
  const [isLoading, setIsLoading] = useState(false);
  const [isClustering, setIsClustering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const inputRef = useRef<HTMLInputElement>(null);

  const active = useMemo(() => (result ? activeSignals(result.entries) : { plddt: false, bsa: false, iptm: false, ipae: false, pb: false }), [result]);

  const rankedEntries = useMemo(
    () => (result ? computeRankedEntries(result.entries, clusterResult?.assignments ?? null) : []),
    [result, clusterResult],
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
    const accepted = Array.from(incoming).filter((f) => /\.(pdb|cif|mmcif)$/i.test(f.name));
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...accepted.filter((f) => !names.has(f.name))];
    });
  }

  function handleSidecars(incoming: FileList | null) {
    if (!incoming) return;
    const accepted = Array.from(incoming).filter((f) => /\.(json|npz)$/i.test(f.name));
    setSidecars((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...accepted.filter((f) => !names.has(f.name))];
    });
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  function reset() {
    setFiles([]);
    setSidecars([]);
    setResult(null);
    setClusterResult(null);
    setError(null);
  }

  async function analyze() {
    if (files.length === 0) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      for (const f of files) formData.append("files", f, f.name);
      for (const f of sidecars) formData.append("sidecar_files", f, f.name);
      formData.append("cutoff_angstrom", String(cutoff));
      formData.append("include_validity", String(includeValidity));
      const res = await fetch(buildApiUrl("/api/batch/analyze"), { method: "POST", body: formData });
      if (!res.ok) {
        const detail = await res.json().then((j: { detail?: string }) => j.detail).catch(() => null);
        throw new Error(detail ?? `Server error ${res.status}`);
      }
      setResult((await res.json()) as BatchAnalysisResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function cluster() {
    if (files.length === 0) return;
    setIsClustering(true);
    setError(null);
    try {
      const formData = new FormData();
      for (const f of files) formData.append("files", f, f.name);
      formData.append("tm_threshold", "0.5");
      const res = await fetch(buildApiUrl("/api/batch/cluster"), { method: "POST", body: formData });
      if (!res.ok) {
        const detail = await res.json().then((j: { detail?: string }) => j.detail).catch(() => null);
        throw new Error(detail ?? `Server error ${res.status}`);
      }
      setClusterResult((await res.json()) as BatchClusterResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clustering failed.");
    } finally {
      setIsClustering(false);
    }
  }

  function downloadReport() {
    const rows: CampaignReportRow[] = rankedEntries.map((e) => {
      const a = e.analysis;
      const pb = designPb(a);
      return {
        rank: e.rank,
        filename: e.filename,
        score: e.score,
        chains: a?.summary.chain_count ?? null,
        residues: a?.summary.residue_count ?? null,
        contacts: a?.summary.contact_count ?? null,
        plddt: a?.confidence?.average_plddt ?? null,
        bsa: designBsa(a),
        iptm: designIptm(a),
        ipae: designIpae(a),
        pbValid: pb ? `${pb.passed}/${pb.total}` : null,
        clashes: a?.interaction_summary?.possible_clash_count ?? null,
        cluster: e.cluster,
        status: e.error ? "Error" : "OK",
        error: e.error,
      };
    });
    const html = buildCampaignReportHtml({ rows, cutoff, cluster: clusterResult, scoreFormula: scoreFormulaText(active) });
    downloadCampaignReport(html, `campaign-report-${new Date().toISOString().slice(0, 10)}.html`);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Lower interface PAE is better, so default that column ascending.
      setSortDir(key === "filename" || key === "ipae" ? "asc" : "desc");
    }
  }

  const canCluster = files.length > 0; // needs the actual files (not a cache-only result)

  return (
    <div className="h-full flex flex-col overflow-clip rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)]">
      <div className="flex flex-1 min-h-0">
      {/* Sidebar */}
      <aside
        className="scrollbar-thin-panel"
        style={{
          width: 280, flexShrink: 0, background: "var(--pio-white)", borderRight: "1px solid var(--pio-line)",
          display: "flex", flexDirection: "column", overflowY: "auto", padding: "20px 20px 24px", gap: 16,
        }}
      >
        <p className="text-pio-3xl" style={{ fontWeight: 700, color: "var(--pio-ink)", marginBottom: 4 }}>
          Batch Analysis
        </p>

        {/* Drop zone */}
        <label
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: 96, borderRadius: 12, border: "1.5px dashed var(--pio-line-strong)",
            background: "var(--pio-paper)", cursor: "pointer", padding: "12px 16px", textAlign: "center", gap: 6,
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        >
          <FileUp size={16} style={{ color: "var(--pio-graphite)" }} />
          <span className="text-pio-sm" style={{ fontWeight: 600, color: "var(--pio-ink)" }}>
            Drop .pdb / .cif / .mmcif files
          </span>
          <span className="text-pio-xs" style={{ color: "var(--pio-graphite)" }}>
            or click to browse (max 50)
          </span>
          <input ref={inputRef} type="file" accept=".pdb,.cif,.mmcif" multiple className="sr-only" onChange={(e) => handleFiles(e.target.files)} />
        </label>

        {/* File list — live files take priority; fall back to cached entry names */}
        {(files.length > 0 || (result && files.length === 0)) && (() => {
          const fromCache = files.length === 0;
          const names = fromCache ? result!.entries.map((e) => e.filename) : files.map((f) => f.name);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--pio-graphite)" }}>
                  Files ({names.length})
                </p>
                {fromCache && <span className="text-pio-3xs" style={{ color: "var(--pio-graphite)", opacity: 0.6, fontStyle: "italic" }}>cached</span>}
              </div>
              <div className="scrollbar-thin-panel" style={{ maxHeight: 180, overflowY: "auto" }}>
                {names.map((name) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 6px", borderRadius: 6, background: "var(--pio-paper)", marginBottom: 2, gap: 6 }}>
                    <span className="text-pio-xs" style={{ color: "var(--pio-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{name}</span>
                    {!fromCache && (
                      <button type="button" onClick={() => removeFile(name)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--pio-graphite)", flexShrink: 0, lineHeight: 1 }} aria-label={`Remove ${name}`}>×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Optional confidence sidecars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44,
              borderRadius: 10, border: "1.5px dashed var(--pio-line-strong)", background: "var(--pio-paper)",
              cursor: "pointer", padding: "8px 12px", textAlign: "center",
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleSidecars(e.dataTransfer.files); }}
            title="Optional Boltz/Chai/AlphaFold confidence sidecars, named to match each structure (e.g. design_1.json)"
          >
            <FileUp size={13} style={{ color: "var(--pio-graphite)" }} />
            <span className="text-pio-xs" style={{ fontWeight: 600, color: "var(--pio-ink)" }}>
              {sidecars.length > 0 ? `${sidecars.length} sidecar${sidecars.length !== 1 ? "s" : ""} (.json/.npz)` : "Confidence sidecars (optional)"}
            </span>
            <input type="file" accept=".json,.npz" multiple className="sr-only" onChange={(e) => handleSidecars(e.target.files)} />
          </label>
          <p className="text-pio-3xs" style={{ color: "var(--pio-graphite)", opacity: 0.75, lineHeight: 1.5 }}>
            Match filename to structure (design_1.cif → design_1.json) to add ipTM + interface PAE.
          </p>
        </div>

        {/* Validity toggle */}
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={includeValidity} onChange={(e) => setIncludeValidity(e.target.checked)} style={{ marginTop: 2, accentColor: "var(--pio-highlight)" }} />
          <span>
            <span className="text-pio-xs" style={{ fontWeight: 600, color: "var(--pio-ink)", display: "block" }}>Run validity (slower)</span>
            <span className="text-pio-3xs" style={{ color: "var(--pio-graphite)", opacity: 0.75, lineHeight: 1.5 }}>PoseBusters PB-valid + buried area per design.</span>
          </span>
        </label>

        {/* Cutoff */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <label className="text-pio-xs" style={{ fontWeight: 600, color: "var(--pio-graphite)" }}>Distance Cutoff</label>
            <span className="text-pio-xs" style={{ fontFamily: "var(--font-pio-mono)", color: "var(--pio-ink)" }}>{cutoff.toFixed(1)} Å</span>
          </div>
          <input type="number" min={1} max={12} step={0.1} value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))} className="pio-input text-pio-base" style={{ width: "100%", height: 36, padding: "0 12px", fontFamily: "var(--font-pio-mono)" }} />
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <button
            type="button" onClick={() => void analyze()} disabled={files.length === 0 || isLoading}
            style={{
              height: 40, borderRadius: 12, background: "var(--pio-highlight)", color: "var(--pio-highlight-text)", border: "none",
              fontWeight: 600, cursor: files.length === 0 || isLoading ? "not-allowed" : "pointer", opacity: files.length === 0 || isLoading ? 0.45 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Analyze
          </button>
          {(files.length > 0 || result) && (
            <button type="button" onClick={reset} style={{ height: 36, borderRadius: 12, background: "var(--pio-white)", color: "var(--pio-ink)", border: "1px solid var(--pio-highlight)", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <RotateCcw size={13} />
              Reset
            </button>
          )}
        </div>

        {/* Score legend */}
        {result && (
          <div style={{ borderRadius: 10, background: "var(--pio-paper)", padding: "10px 12px" }}>
            <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--pio-graphite)", marginBottom: 6 }}>Score formula</p>
            <p className="text-pio-xs" style={{ color: "var(--pio-graphite)", lineHeight: 1.6 }}>{scoreFormulaText(active)}</p>
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
        {!result && !isLoading && <EmptyState hasFiles={files.length > 0} />}
        {isLoading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 14 }}>
            <Loader2 size={28} className="animate-spin" style={{ color: "var(--pio-highlight)" }} />
            <p className="text-pio-lg" style={{ color: "var(--pio-graphite)" }}>
              Analyzing {files.length} structure{files.length !== 1 ? "s" : ""}{includeValidity ? " with validity" : ""}…
            </p>
          </div>
        )}
        {result && !isLoading && (
          <BatchResultsView
            result={result}
            entries={sortedEntries}
            active={active}
            cluster={clusterResult}
            sortKey={sortKey}
            sortDir={sortDir}
            cutoff={cutoff}
            canCluster={canCluster}
            isClustering={isClustering}
            onSort={toggleSort}
            onExport={() => exportCsv(rankedEntries, active, cutoff)}
            onReport={downloadReport}
            onCluster={() => void cluster()}
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
  if (key === "cluster") return entry.cluster;
  if (!a) return null;
  if (key === "chains") return a.summary.chain_count;
  if (key === "residues") return a.summary.residue_count;
  if (key === "contacts") return a.summary.contact_count;
  if (key === "plddt") return a.confidence?.average_plddt ?? null;
  if (key === "bsa") return designBsa(a);
  if (key === "iptm") return designIptm(a);
  if (key === "ipae") return designIpae(a);
  if (key === "pb") { const pb = designPb(a); return pb ? pb.passed / pb.total : null; }
  return null;
}

const RANK_COLORS: Record<number, { color: string; bg: string }> = {
  1: { color: "var(--pio-amber-deep)", bg: "rgba(217,119,6,0.12)" },
  2: { color: "var(--pio-graphite)", bg: "var(--pio-paper)" },
  3: { color: "#92400e", bg: "rgba(146,64,14,0.10)" },
};

// Distinct, theme-safe hues cycled per cluster id.
const CLUSTER_HUES = [210, 150, 275, 30, 340, 95, 190, 55];
function clusterStyle(id: number): { color: string; bg: string } {
  const h = CLUSTER_HUES[(id - 1) % CLUSTER_HUES.length];
  return { color: `hsl(${h} 55% 34%)`, bg: `hsl(${h} 55% 34% / 0.12)` };
}

type Column = { key: SortKey | "status"; label: string; width: string; sortable: boolean; render: (e: RankedEntry) => React.ReactNode };

function BatchResultsView({
  result, entries, active, cluster, sortKey, sortDir, cutoff, canCluster, isClustering, onSort, onExport, onReport, onCluster,
}: {
  result: BatchAnalysisResponse;
  entries: RankedEntry[];
  active: Signals;
  cluster: BatchClusterResponse | null;
  sortKey: SortKey;
  sortDir: SortDir;
  cutoff: number;
  canCluster: boolean;
  isClustering: boolean;
  onSort: (k: SortKey) => void;
  onExport: () => void;
  onReport: () => void;
  onCluster: () => void;
}) {
  const hasCluster = cluster != null && entries.some((e) => e.cluster != null);

  const columns: Column[] = [
    { key: "filename", label: "File", width: "minmax(0,2fr)", sortable: true, render: (e) => <FileCell entry={e} /> },
    { key: "chains", label: "Chains", width: "58px", sortable: true, render: (e) => <Cell value={e.analysis?.summary.chain_count ?? null} mono /> },
    { key: "residues", label: "Residues", width: "74px", sortable: true, render: (e) => <Cell value={e.analysis?.summary.residue_count?.toLocaleString() ?? null} mono /> },
    { key: "contacts", label: "Contacts", width: "74px", sortable: true, render: (e) => <Cell value={e.analysis?.summary.contact_count?.toLocaleString() ?? null} mono /> },
    { key: "plddt", label: "pLDDT", width: "66px", sortable: true, render: (e) => <PlddtCell a={e.analysis} /> },
    { key: "bsa", label: "Interface BSA", width: "92px", sortable: true, render: (e) => { const b = designBsa(e.analysis); return <Cell value={b != null ? `${b.toLocaleString()} Å²` : null} mono />; } },
  ];
  if (active.iptm) columns.push({ key: "iptm", label: "ipTM", width: "58px", sortable: true, render: (e) => <Cell value={designIptm(e.analysis)?.toFixed(2) ?? null} mono /> });
  if (active.ipae) columns.push({ key: "ipae", label: "iPAE", width: "64px", sortable: true, render: (e) => { const v = designIpae(e.analysis); return <Cell value={v != null ? `${v.toFixed(1)} Å` : null} mono />; } });
  if (active.pb) columns.push({ key: "pb", label: "PB-valid", width: "70px", sortable: true, render: (e) => <PbCell a={e.analysis} /> });
  if (hasCluster) columns.push({ key: "cluster", label: "Cluster", width: "72px", sortable: true, render: (e) => <ClusterCell id={e.cluster} /> });
  columns.push({ key: "score", label: "Score", width: "66px", sortable: true, render: (e) => <ScoreCell entry={e} /> });
  columns.push({ key: "status", label: "Status", width: "72px", sortable: false, render: (e) => <StatusCell error={e.error} /> });

  const gridTemplate = columns.map((c) => c.width).join(" ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      {/* Summary bar + actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <SummaryChip icon={<CheckCircle2 size={13} />} label="Succeeded" value={result.succeeded} color="var(--pio-green-deep)" bg="var(--pio-green-pale)" />
        {result.failed > 0 && <SummaryChip icon={<XCircle size={13} />} label="Failed" value={result.failed} color="var(--pio-coral-deep)" bg="var(--pio-coral-pale)" />}
        <SummaryChip icon={null} label="Total" value={result.total} color="var(--pio-graphite)" bg="var(--pio-paper)" />
        {hasCluster && cluster && <SummaryChip icon={<Network size={13} />} label="Clusters" value={cluster.clusters.length} color="var(--pio-highlight)" bg="var(--pio-row-selection-bg)" />}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <ActionButton onClick={onCluster} disabled={!canCluster || isClustering} title={canCluster ? "Cluster designs by fold (in-house TM-align)" : "Re-upload files to cluster"}>
            {isClustering ? <Loader2 size={12} className="animate-spin" /> : <Network size={12} />}
            {hasCluster ? "Re-cluster" : "Cluster by fold"}
          </ActionButton>
          <ActionButton onClick={onReport} title="Download a self-contained HTML campaign report">
            <FileText size={12} /> Report
          </ActionButton>
          <ActionButton onClick={onExport} title="Export the ranked table as CSV">
            <Download size={12} /> CSV
          </ActionButton>
        </div>
      </div>

      {/* Table */}
      <div style={{ borderRadius: 12, border: "1px solid var(--pio-line)", overflow: "hidden", background: "var(--pio-white)" }}>
        <div style={{ display: "grid", gridTemplateColumns: gridTemplate, background: "var(--pio-paper)", borderBottom: "1px solid var(--pio-line)", padding: "0 12px" }}>
          {columns.map((c) =>
            c.sortable ? (
              <SortableHeader key={c.key} label={c.label} sortKey={c.key as SortKey} active={sortKey === c.key} dir={sortDir} onSort={onSort} />
            ) : (
              <div key={c.key} className="text-pio-3xs" style={{ padding: "8px 0", fontWeight: 700, letterSpacing: "0.08em", color: "var(--pio-graphite)", textTransform: "uppercase" }}>{c.label}</div>
            ),
          )}
        </div>
        {entries.map((entry, i) => (
          <DesignRow key={entry.filename} entry={entry} columns={columns} gridTemplate={gridTemplate} isLast={i === entries.length - 1} />
        ))}
      </div>

      {/* Cluster breakdown */}
      {hasCluster && cluster && <ClusterSummary cluster={cluster} />}

      <p className="text-pio-xs" style={{ color: "var(--pio-graphite)", opacity: 0.7 }}>
        {scoreFormulaText(active)} Cutoff: {cutoff.toFixed(1)} Å.
      </p>
    </div>
  );
}

function ActionButton({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title}
      style={{
        display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 10,
        border: "1px solid var(--pio-line-strong)", background: "var(--pio-white)", color: "var(--pio-ink)",
        fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      }}
      className="text-pio-xs"
    >
      {children}
    </button>
  );
}

function ClusterSummary({ cluster }: { cluster: BatchClusterResponse }) {
  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--pio-line)", background: "var(--pio-white)", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <p className="text-pio-base" style={{ fontWeight: 700, color: "var(--pio-ink)" }}>Structural clusters</p>
        <span className="text-pio-xs" style={{ color: "var(--pio-graphite)" }}>by fold · TM ≥ {cluster.tm_threshold.toFixed(2)} · in-house TM-align</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {cluster.clusters.map((c) => {
          const cs = clusterStyle(c.cluster_id);
          return (
            <div key={c.cluster_id} style={{ border: "1px solid var(--pio-line)", borderRadius: 10, padding: "10px 12px", background: "var(--pio-paper)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span className="text-pio-3xs" style={{ fontWeight: 700, color: cs.color, background: cs.bg, borderRadius: 5, padding: "1px 7px" }}>C{c.cluster_id}</span>
                <span className="text-pio-xs" style={{ fontWeight: 600, color: "var(--pio-ink)" }}>{c.size} design{c.size !== 1 ? "s" : ""}</span>
                <span className="text-pio-3xs" style={{ color: "var(--pio-graphite)", marginLeft: "auto" }}>mean TM {c.mean_tm.toFixed(2)}</span>
              </div>
              <p className="text-pio-3xs" style={{ color: "var(--pio-graphite)", fontFamily: "var(--font-pio-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.representative}>
                rep: {c.representative}
              </p>
            </div>
          );
        })}
      </div>
      {cluster.skipped.length > 0 && (
        <p className="text-pio-3xs" style={{ color: "var(--pio-graphite)", opacity: 0.7, marginTop: 8 }}>
          Skipped (unparseable): {cluster.skipped.join(", ")}
        </p>
      )}
    </div>
  );
}

function SummaryChip({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: number; color: string; bg: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: bg, borderRadius: 8, padding: "5px 12px", color }}>
      {icon}
      <span className="text-pio-sm" style={{ fontWeight: 600 }}>{label}</span>
      <span className="text-pio-lg" style={{ fontFamily: "var(--font-pio-mono)", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function SortableHeader({ label, sortKey, active, dir, onSort }: { label: string; sortKey: SortKey; active: boolean; dir: SortDir; onSort: (k: SortKey) => void }) {
  return (
    <button
      type="button" onClick={() => onSort(sortKey)}
      style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 0", display: "flex", alignItems: "center", gap: 4, fontWeight: 700, letterSpacing: "0.08em", color: active ? "var(--pio-highlight)" : "var(--pio-graphite)", textTransform: "uppercase", textAlign: "left" }}
      className="text-pio-3xs"
    >
      {label}
      {active && <span className="text-pio-3xs" style={{ opacity: 0.8 }}>{dir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

function DesignRow({ entry, columns, gridTemplate, isLast }: { entry: RankedEntry; columns: Column[]; gridTemplate: string; isLast: boolean }) {
  const isTopThree = entry.rank != null && entry.rank <= 3;
  return (
    <div style={{ display: "grid", gridTemplateColumns: gridTemplate, padding: "0 12px", borderBottom: isLast ? "none" : "1px solid var(--pio-line)", alignItems: "center", minHeight: 38, background: isTopThree ? "rgba(199,217,236,0.08)" : undefined }}>
      {columns.map((c) => <div key={c.key} style={{ minWidth: 0, paddingRight: 6 }}>{c.render(entry)}</div>)}
    </div>
  );
}

function FileCell({ entry }: { entry: RankedEntry }) {
  const rankStyle = entry.rank != null ? RANK_COLORS[entry.rank] : null;
  return (
    <div style={{ overflow: "hidden", display: "flex", alignItems: "center", gap: 6 }}>
      {entry.rank != null && (
        <span style={{ flexShrink: 0, fontWeight: 700, fontFamily: "var(--font-pio-mono)", color: rankStyle?.color ?? "var(--pio-graphite)", background: rankStyle?.bg ?? "var(--pio-paper)", borderRadius: 4, padding: "1px 5px", minWidth: 22, textAlign: "center" }} className="text-pio-3xs">#{entry.rank}</span>
      )}
      <div style={{ overflow: "hidden", flex: 1 }}>
        <span className="text-pio-xs" style={{ fontFamily: "var(--font-pio-mono)", color: "var(--pio-ink)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.filename}>{entry.filename}</span>
        {entry.error && <span className="text-pio-3xs" style={{ color: "var(--pio-coral-deep)", display: "block", marginTop: 1 }}>{entry.error}</span>}
      </div>
    </div>
  );
}

function PlddtCell({ a }: { a: BatchDesignEntry["analysis"] }) {
  const plddt = a?.confidence?.average_plddt;
  const color = plddt == null ? "var(--pio-graphite)" : plddt >= 90 ? "var(--pio-green-deep)" : plddt >= 70 ? "var(--pio-ink)" : "var(--pio-coral)";
  return <div className="text-pio-xs" style={{ fontFamily: "var(--font-pio-mono)", fontWeight: 600, color: plddt != null ? color : "var(--pio-graphite)", opacity: plddt != null ? 1 : 0.4 }}>{plddt != null ? plddt.toFixed(1) : "—"}</div>;
}

function PbCell({ a }: { a: BatchDesignEntry["analysis"] }) {
  const pb = designPb(a);
  if (!pb) return <span style={{ color: "var(--pio-graphite)", opacity: 0.4 }} className="text-pio-xs">—</span>;
  const allPass = pb.passed === pb.total;
  return <span className="text-pio-xs" style={{ fontFamily: "var(--font-pio-mono)", fontWeight: 600, color: allPass ? "var(--pio-green-deep)" : "var(--pio-coral-deep)" }}>{pb.passed}/{pb.total}</span>;
}

function ClusterCell({ id }: { id: number | null }) {
  if (id == null) return <span style={{ color: "var(--pio-graphite)", opacity: 0.4 }} className="text-pio-xs">—</span>;
  const cs = clusterStyle(id);
  return <span className="text-pio-3xs" style={{ fontWeight: 700, color: cs.color, background: cs.bg, borderRadius: 5, padding: "1px 7px" }}>C{id}</span>;
}

function ScoreCell({ entry }: { entry: RankedEntry }) {
  return <div className="text-pio-xs" style={{ fontFamily: "var(--font-pio-mono)", fontWeight: entry.rank === 1 ? 700 : 600, color: entry.score != null ? "var(--pio-ink)" : "var(--pio-graphite)", opacity: entry.score != null ? 1 : 0.4 }}>{entry.score != null ? entry.score.toFixed(1) : "—"}</div>;
}

function StatusCell({ error }: { error: string | null }) {
  return error ? (
    <span className="text-pio-3xs" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: "var(--pio-coral-deep)", background: "var(--pio-coral-pale)", borderRadius: 6, padding: "2px 7px" }}><XCircle size={10} /> Error</span>
  ) : (
    <span className="text-pio-3xs" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: "var(--pio-green-deep)", background: "var(--pio-green-pale)", borderRadius: 6, padding: "2px 7px" }}><CheckCircle2 size={10} /> OK</span>
  );
}

function Cell({ value, mono }: { value: string | number | null; mono?: boolean }) {
  return (
    <div className="text-pio-xs" style={{ fontFamily: mono ? "var(--font-pio-mono)" : undefined, color: value != null ? "var(--pio-ink)" : "var(--pio-graphite)", opacity: value != null ? 1 : 0.4 }}>
      {value ?? "—"}
    </div>
  );
}

function EmptyState({ hasFiles }: { hasFiles: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, opacity: 0.5 }}>
      <FileUp size={32} style={{ color: "var(--pio-graphite)" }} />
      <div style={{ textAlign: "center" }}>
        <p className="text-pio-xl" style={{ fontWeight: 600, color: "var(--pio-ink)" }}>{hasFiles ? "Ready to analyze" : "Upload structures to get started"}</p>
        <p className="text-pio-sm" style={{ color: "var(--pio-graphite)", marginTop: 4 }}>{hasFiles ? "Click Analyze to run batch analysis." : "Drop up to 50 .pdb or .cif files in the sidebar."}</p>
      </div>
    </div>
  );
}
