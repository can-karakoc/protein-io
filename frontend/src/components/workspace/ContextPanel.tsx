"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  FlaskConical,
  GitCompare,
  Info,
  Loader2,
  Shield,
  Sparkle,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ease, listItem, spring, stagger, tabContent } from "@/lib/motion";

import { buildApiUrl } from "@/lib/api";
import { downloadComparisonReportPdf } from "@/lib/comparisonReport";
import { buildChimeraxScript, buildPymolScript, downloadSessionScript } from "@/lib/sessionExport";
import { downloadMethodsReport } from "@/lib/methodsReport";
import { buildReviewVerdict, type VerdictTone } from "@/lib/reviewVerdict";
import { METRIC_EXPLAINERS, type MetricKey } from "@/lib/metricExplainers";
import { CHAT_ENABLED } from "@/lib/features";
import type { AnalysisResponse, AntibodyCdr, ChainSecondaryStructure, ChemblTargetSummary, ContactDifference, ContactRecord, FoldseekHit, FoldseekSearchResult, InterfaceConfidence, LigandInteractionSummary, LigandSummary, LigandValidity, PaeMatrix, Pocket, RcsbAnalysisResponse, ResidueConfidence, SSType } from "@/lib/types";
import type { ContextTab, StructureEntry } from "@/lib/workspaceStore";
import { useWorkspace } from "@/lib/workspaceStore";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function fmtDist(d: number) {
  return `${d.toFixed(2)} Å`;
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDepositedDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw;
}

function plddtColor(v: number) {
  if (v >= 90) return "var(--pio-green-deep)";
  if (v >= 70) return "var(--pio-highlight)";
  if (v >= 50) return "var(--pio-amber)";
  return "var(--pio-coral)";
}

function plddtLabel(v: number) {
  if (v >= 90) return "Very high";
  if (v >= 70) return "Confident";
  if (v >= 50) return "Low";
  return "Very low";
}

// ── Shared micro-components ───────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">
        {label}
      </span>
      <span className="font-[family-name:var(--font-pio-mono)] text-pio-2xl font-bold leading-none text-[var(--pio-ink)]">{value}</span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 border-b border-[var(--pio-line)] last:border-0">
      <span className="text-pio-xs text-[var(--pio-graphite)]">{label}</span>
      <span className="text-pio-xs font-semibold text-[var(--pio-ink)]">{value}</span>
    </div>
  );
}

function TopContactList({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div style={{ background: "var(--pio-paper)", borderRadius: 10, padding: "12px 14px" }}>
      <p className="text-pio-2xs mb-2 font-bold uppercase tracking-[0.08em] text-[var(--pio-graphite)]">{title}</p>
      {rows.length ? rows.map(([label, count]) => (
        <div key={label} className="flex items-center justify-between py-[3px]">
          <span className="font-[family-name:var(--font-pio-mono)] text-pio-sm text-[var(--pio-ink)]">{label}</span>
          <span className="font-[family-name:var(--font-pio-mono)] text-pio-sm font-bold text-[var(--pio-ink)]">{count}</span>
        </div>
      )) : (
        <p className="text-pio-sm text-[var(--pio-graphite)]">—</p>
      )}
    </div>
  );
}

function InteractionSummaryPanel({ summary }: { summary: NonNullable<AnalysisResponse["interaction_summary"]> }) {
  const metrics: Array<[string, number]> = [
    ["Protein–Protein", summary.protein_protein_count ?? 0],
    ["Protein–Ligand",  summary.protein_ligand_count  ?? 0],
    ["Protein–Water",   summary.protein_water_count   ?? 0],
    ["Ligand–Water",    summary.ligand_water_count    ?? 0],
    ["Inter-Chain",     summary.inter_chain_count     ?? 0],
    ["Possible Clashes",summary.possible_clash_count  ?? 0],
  ];

  return (
    <div>
      <h2 className="text-pio-2xl font-bold text-[var(--pio-ink)] tracking-[-0.015em] leading-[1.15]">Ligand Interaction Summary</h2>
      <p className="mt-1 text-pio-md leading-[1.5] text-[var(--pio-graphite)]">
        Distance-based contact categories and top contact participants.
      </p>

      {/* Metric cards — reflow 3→2 cols as the panel narrows */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8, marginTop: 16 }}>
        {metrics.map(([label, value]) => (
          <div key={label} style={{ background: "var(--pio-paper)", borderRadius: 10, padding: "12px 14px" }}>
            <p className="text-pio-2xs font-bold uppercase tracking-[0.08em] text-[var(--pio-graphite)]">{label}</p>
            <p className="font-[family-name:var(--font-pio-mono)] text-pio-3xl font-bold leading-none text-[var(--pio-ink)] mt-1">
              {value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Top residue lists — 2-col */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <TopContactList
          title="Top Residues"
          rows={summary.top_contacting_residues.map((r) => [`${r.chain_id}:${r.residue_name}${r.residue_number}`, r.contact_count])}
        />
        <TopContactList
          title="Top Residues"
          rows={summary.top_contacting_ligands.map((l) => [`${l.name} ${l.chain_id}:${l.residue_number}`, l.contact_count])}
        />
      </div>
    </div>
  );
}

function MetaBadge({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="pio-badge pio-badge-metadata flex gap-1">
      <span className="opacity-60">{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-pio-xs font-bold uppercase tracking-[0.09em] text-[var(--pio-graphite)] opacity-70 mb-2 mt-4 first:mt-0">
      {children}
    </h3>
  );
}

function WarningBanner({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="flex flex-col gap-1 rounded-[10px] bg-[var(--pio-amber-pale)] border border-[var(--pio-amber)] p-3">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[var(--pio-amber-deep)]" />
          <p className="text-pio-xs leading-[1.5] text-[var(--pio-amber-deep)]">{w}</p>
        </div>
      ))}
    </div>
  );
}

// ── Explain this metric (inline popover) ──────────────────────────────────────

const METRIC_POPOVER_W = 250;

function MetricInfo({ metric }: { metric: MetricKey }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const e = METRIC_EXPLAINERS[metric];

  function toggle(ev: React.MouseEvent) {
    ev.stopPropagation();
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      // Clamp within the viewport so a header near the panel edge doesn't clip.
      const left = Math.max(12, Math.min(r.left, window.innerWidth - METRIC_POPOVER_W - 12));
      setPos({ top: r.bottom + 6, left });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      const t = ev.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    }
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={`Explain ${e.label}`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full align-middle text-[var(--pio-graphite)] opacity-50 transition-opacity hover:opacity-100"
      >
        <Info size={12} />
      </button>
      {/* Portal to <body> so no ancestor overflow/stacking context can clip it. */}
      {open && pos && createPortal(
        <div
          ref={popRef}
          onClick={(ev) => ev.stopPropagation()}
          className="fixed z-[9999] rounded-[12px] border border-[var(--pio-line)] bg-[var(--pio-white)] p-3 text-left shadow-[0_8px_28px_rgba(17,22,16,0.20)]"
          style={{ top: pos.top, left: pos.left, width: METRIC_POPOVER_W }}
        >
          <p className="text-pio-xs font-bold text-[var(--pio-ink)]">{e.label}</p>
          <p className="mt-1 text-pio-2xs leading-[1.55] text-[var(--pio-graphite)]">{e.what}</p>
          <p className="mt-1.5 text-pio-2xs leading-[1.55] text-[var(--pio-ink)]">{e.read}</p>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Review verdict (deterministic copilot) ────────────────────────────────────

const VERDICT_STYLE: Record<VerdictTone, { bg: string; fg: string; Icon: typeof CheckCircle2 }> = {
  good: { bg: "var(--pio-green-pale)", fg: "var(--pio-green-deep)", Icon: CheckCircle2 },
  caution: { bg: "var(--pio-amber-pale)", fg: "var(--pio-amber-deep)", Icon: AlertTriangle },
  warn: { bg: "var(--pio-coral-pale)", fg: "var(--pio-coral-deep)", Icon: AlertCircle },
};
const DOT_COLOR: Record<VerdictTone, string> = {
  good: "var(--pio-green-deep)",
  caution: "var(--pio-amber-deep)",
  warn: "var(--pio-coral-deep)",
};

function ReviewVerdictCard({ analysis }: { analysis: AnalysisResponse }) {
  const verdict = useMemo(() => buildReviewVerdict(analysis), [analysis]);
  if (!verdict) return null;
  const s = VERDICT_STYLE[verdict.tone];
  return (
    <div style={{ background: s.bg, borderRadius: 14, padding: "14px 16px" }}>
      <div className="mb-2 flex items-center gap-2">
        <s.Icon size={15} style={{ color: s.fg }} />
        <p className="text-pio-2xs font-bold uppercase tracking-[0.08em]" style={{ color: s.fg }}>Review verdict</p>
      </div>
      <p className="text-pio-base font-semibold leading-snug text-[var(--pio-ink)]">{verdict.headline}</p>
      <div className="mt-3 flex flex-col gap-2">
        {verdict.points.map((p, i) => (
          <div key={i} className="flex items-start gap-2">
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: DOT_COLOR[p.tone], marginTop: 6, flexShrink: 0 }} />
            <p className="text-pio-sm leading-[1.5] text-[var(--pio-graphite)]">
              <span className="font-bold text-[var(--pio-ink)]">{p.label}.</span> {p.detail}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-pio-2xs text-[var(--pio-graphite)] opacity-60">
        Rule-based summary of the computed metrics — a review aid, not a substitute for expert judgment.
      </p>
    </div>
  );
}

// ── AI review (LLM narration — local only) ────────────────────────────────────

function CopilotReview({ analysis }: { analysis: AnalysisResponse }) {
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true); setError(null); setReview(null);
    try {
      const res = await fetch(buildApiUrl("/api/copilot/review"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.detail ?? `Server error ${res.status}`); return; }
      if (data?.error) { setError(data.error); return; }
      setReview(data?.review ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[14px] p-4" style={{ background: "var(--pio-lavender-pale)" }}>
      <div className="mb-2 flex items-center gap-2">
        <Sparkle size={15} style={{ color: "var(--pio-lavender-deep)" }} />
        <p className="text-pio-2xs font-bold uppercase tracking-[0.08em]" style={{ color: "var(--pio-lavender-deep)" }}>AI review</p>
      </div>

      {!review && !loading && !error && (
        <p className="text-pio-sm leading-[1.5]" style={{ color: "var(--pio-lavender-deep)", opacity: 0.8 }}>
          Narrate the metrics above into a plain-English verdict and a suggested next experiment — strictly over the
          computed numbers. Uses your local Anthropic key.
        </p>
      )}
      {error && <p className="text-pio-sm text-[var(--pio-coral-deep)]">{error}</p>}
      {review && (
        <div className="pio-markdown text-pio-sm leading-[1.55] text-[var(--pio-ink)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{review}</ReactMarkdown>
        </div>
      )}

      <div className="mt-3">
        {review && !loading ? (
          <button
            type="button"
            onClick={() => void run()}
            className="inline-flex items-center gap-1.5 text-pio-2xs font-semibold transition-opacity hover:opacity-70"
            style={{ color: "var(--pio-lavender-deep)" }}
          >
            Regenerate
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void run()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-[12px] px-3.5 py-1.5 text-pio-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: "var(--pio-lavender-deep)", color: "var(--pio-highlight-text)" }}
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            {loading ? "Thinking…" : "Generate review"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ entry }: { entry: StructureEntry }) {
  const analysis = entry.analysis;
  if (!analysis) return null;
  const metadata = analysis.metadata ?? null;
  const s = analysis.summary;
  const isAlphaFold = metadata?.source === "alphafold";
  const isBoltz = metadata?.source === "boltz";
  const isChai = metadata?.source === "chai";
  const isPredictedUpload = isBoltz || isChai;
  const isUpload = !metadata || metadata.source === "upload";
  const sourceLabel = isBoltz ? "Boltz-1" : isChai ? "Chai-1" : null;

  // Title: de-capitalize from ALL CAPS + strip resolution suffix
  const rawTitle = metadata?.title ?? metadata?.pdb_id ?? metadata?.uniprot_id ?? null;
  const title = rawTitle
    ? toTitleCase(rawTitle.replace(/\s+at\s+[\d.]+\s+angstroms?\s+resolution\s*$/i, "").trim())
    : null;
  const entryUrl = isAlphaFold ? metadata?.alphafold_url : metadata?.rcsb_url;

  // Metadata rows (old MetadataPanel style)
  type MetaRow = { label: string; value: string | number | null; mono?: boolean };
  const rcsbRows: MetaRow[] = [
    { label: "PDB ID",      value: metadata?.pdb_id ?? null,                                           mono: true },
    { label: "STATUS",      value: metadata?.status    ? toTitleCase(metadata.status)    : null },
    { label: "METHOD",      value: metadata?.method    ? toTitleCase(metadata.method)    : null },
    { label: "RESOLUTION",  value: metadata?.resolution_angstrom != null ? `${metadata.resolution_angstrom.toFixed(2)} Å` : null, mono: true },
    { label: "ORGANISM",    value: metadata?.organism  ? toTitleCase(metadata.organism)  : null },
    { label: "ENTITIES",    value: metadata?.entity_count ?? null },
    { label: "DEPOSITED",   value: formatDepositedDate(metadata?.deposition_date),                      mono: true },
  ];
  const alphaFoldRows: MetaRow[] = [
    { label: "UNIPROT",     value: metadata?.uniprot_id ?? null,            mono: true },
    { label: "METHOD",      value: "Predicted model" },
    { label: "ORGANISM",    value: metadata?.organism ? toTitleCase(metadata.organism) : null },
    { label: "MODEL VERSION", value: metadata?.model_version ?? null,       mono: true },
    { label: "MODEL DATE",  value: formatDepositedDate(metadata?.deposition_date), mono: true },
    { label: "ENTITIES",    value: metadata?.entity_count ?? null },
  ];
  const boltzChaiRows: MetaRow[] = [
    { label: "SOURCE",  value: sourceLabel },
    { label: "METHOD",  value: "Predicted model" },
  ];
  const metaRows = (
    isPredictedUpload ? boltzChaiRows : isAlphaFold ? alphaFoldRows : rcsbRows
  ).filter((r) => r.value != null);

  // Summary card items
  const summaryItems: [string, number | string, string][] = [
    ["ATOMS",            s.atom_count,    "Coordinate records parsed from the structure file."],
    ["PROTEIN RESIDUES", s.residue_count, "Amino acid residues counted across chains."],
    ["CHAINS",           s.chain_count,   "Distinct protein chains in the structure."],
    ["LIGANDS",          s.ligand_count,  "Non-water hetero residues detected."],
    ["CONTACTS",         s.contact_count, "Residue and ligand contacts under cutoff."],
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Boltz / Chai header badge */}
      {isPredictedUpload && (
        <div className="flex items-center gap-2">
          <span className="pio-badge pio-badge-predicted">{sourceLabel}</span>
          <span className="text-pio-xs text-[var(--pio-graphite)]">Predicted structure</span>
        </div>
      )}

      {/* Title + link button (RCSB and AlphaFold DB entries have a title) */}
      {!isUpload && !isPredictedUpload && title && (
        <div className="flex items-start gap-3">
          <h2 className="pio-section-title flex-1">{title}</h2>
          {entryUrl && (
            <a
              href={entryUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={isAlphaFold ? "AlphaFold DB entry" : "RCSB entry"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32, borderRadius: "50%",
                background: "var(--pio-highlight)", color: "var(--pio-highlight-text)",
                flexShrink: 0, textDecoration: "none",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2.5 11.5L11.5 2.5M11.5 2.5H6M11.5 2.5V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          )}
        </div>
      )}

      {/* Review verdict — synthesis of the computed metrics */}
      <ReviewVerdictCard analysis={analysis} />

      {/* AI review — LLM narration on top of the verdict (local only) */}
      {CHAT_ENABLED && <CopilotReview analysis={analysis} />}

      {/* UniProt function */}
      {analysis.uniprot_annotations?.function && (
        <FunctionPanel text={analysis.uniprot_annotations.function} />
      )}

      {/* Known binders from ChEMBL (targets with a UniProt accession) */}
      {metadata?.uniprot_id && <ChemblPanel uniprotId={metadata.uniprot_id} />}

      {/* Metadata key-value grid */}
      {!isUpload && metaRows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}>
          {metaRows.map((row) => (
            <div key={row.label} className="rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--pio-sky)] cursor-pointer">
              <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">{row.label}</p>
              {row.mono ? (
                <p className="mt-0.5 font-[family-name:var(--font-pio-mono)] text-pio-sm font-medium text-[var(--pio-ink)]">{row.value}</p>
              ) : (
                <p className="mt-0.5 text-pio-base font-medium text-[var(--pio-ink)]">{row.value}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary cards — full-width stacked, value left + description right */}
      <div className="flex flex-col gap-2">
        {summaryItems.map(([label, value, description]) => (
          <div key={label} className="flex items-center justify-between rounded-[12px] bg-[var(--pio-paper)] px-4 py-3">
            <div>
              <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">{label}</p>
              <p className="mt-0.5 font-[family-name:var(--font-pio-mono)] text-pio-2xl font-bold leading-none text-[var(--pio-ink)]">
                {typeof value === "number" ? value.toLocaleString() : value}
              </p>
            </div>
            <p className="max-w-[160px] text-right text-pio-xs leading-[1.4] text-[var(--pio-graphite)]">{description}</p>
          </div>
        ))}
      </div>

      {/* Global model scores (Boltz / Chai / AlphaFold) */}
      {analysis.global_scores && (
        <GlobalScoresSection scores={analysis.global_scores} />
      )}

      {/* Interaction summary */}
      {analysis.interaction_summary && (
        <InteractionSummaryPanel summary={analysis.interaction_summary} />
      )}

      <WarningBanner warnings={analysis.warnings ?? []} />
    </div>
  );
}

// ── UniProt function (expandable) ─────────────────────────────────────────────

function FunctionPanel({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // Only offer a toggle when the text is long enough to be worth collapsing.
  const isLong = text.length > 320;
  return (
    <div className="rounded-[10px] bg-[var(--pio-paper)] px-[14px] py-3">
      <p className="text-pio-2xs font-bold uppercase tracking-[0.08em] text-[var(--pio-graphite)]">Function</p>
      <p
        className={[
          "mt-1 text-pio-xs leading-[1.6] text-[var(--pio-ink)]",
          isLong && !expanded ? "line-clamp-4" : "",
        ].join(" ")}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-1 text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-highlight)] hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
            style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
          >
            <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── ChEMBL known-binder context ───────────────────────────────────────────────

function ChemblPanel({ uniprotId }: { uniprotId: string }) {
  const [data, setData] = useState<ChemblTargetSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(buildApiUrl(`/api/chembl/${encodeURIComponent(uniprotId)}/summary`))
      .then((r) => (r.ok ? r.json() : null))
      .then((j: ChemblTargetSummary | null) => { if (!cancelled) { setData(j); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uniprotId]);

  if (loading) {
    return (
      <div className="rounded-[14px] bg-[var(--pio-paper)] p-4">
        <div className="flex items-center gap-2">
          <span className="pio-badge pio-badge-metadata text-pio-xs">ChEMBL</span>
          <span className="text-pio-sm font-semibold text-[var(--pio-ink)]">Known binders</span>
        </div>
        <p className="mt-2 text-pio-xs text-[var(--pio-graphite)] opacity-70">Looking up target bioactivity…</p>
      </div>
    );
  }
  if (!data) return null; // target not in ChEMBL — hide silently

  const fmtValue = (c: ChemblTargetSummary["top_compounds"][number]) =>
    [c.standard_type, c.standard_value != null ? `${c.standard_value}${c.standard_units ? ` ${c.standard_units}` : ""}` : null]
      .filter(Boolean)
      .join(" ");

  return (
    <div className="rounded-[14px] bg-[var(--pio-paper)] p-4">
      {/* Header: badge + target link */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="pio-badge pio-badge-metadata text-pio-xs">ChEMBL</span>
          <span className="text-pio-sm font-semibold text-[var(--pio-ink)]">Known binders</span>
        </div>
        <a
          href={`https://www.ebi.ac.uk/chembl/target_report_card/${data.target_chembl_id}/`}
          target="_blank" rel="noreferrer"
          className="flex items-center gap-1 font-[family-name:var(--font-pio-mono)] text-pio-2xs text-[var(--pio-highlight)] hover:underline shrink-0"
        >
          {data.target_chembl_id}
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2.5 11.5L11.5 2.5M11.5 2.5H6M11.5 2.5V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      {/* Target name + bioactivity stat */}
      {data.pref_name && <p className="mt-2 text-pio-sm font-semibold text-[var(--pio-ink)]">{data.pref_name}</p>}
      {data.bioactivity_count > 0 ? (
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="font-[family-name:var(--font-pio-mono)] text-pio-2xl font-bold leading-none text-[var(--pio-ink)]">{data.bioactivity_count.toLocaleString()}</span>
          <span className="text-pio-2xs text-[var(--pio-graphite)]">potent bioactivity measurements</span>
        </p>
      ) : (
        <p className="mt-1.5 text-pio-xs leading-[1.5] text-[var(--pio-graphite)]">
          No known small-molecule binders in ChEMBL.
        </p>
      )}

      {data.top_compounds.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">Most potent compounds</p>
          <div className="flex flex-col gap-1">
            {data.top_compounds.slice(0, 6).map((c) => (
              <a
                key={c.molecule_chembl_id}
                href={`https://www.ebi.ac.uk/chembl/compound_report_card/${c.molecule_chembl_id}/`}
                target="_blank" rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-[8px] px-2.5 py-1.5 hover:bg-[var(--pio-sky)] transition-colors"
              >
                <span className="font-[family-name:var(--font-pio-mono)] text-pio-xs font-medium text-[var(--pio-highlight)] shrink-0">{c.molecule_chembl_id}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {fmtValue(c) && <span className="text-pio-2xs text-[var(--pio-graphite)] truncate">{fmtValue(c)}</span>}
                  {c.pchembl_value != null && (
                    <span className="pio-badge pio-badge-neutral text-pio-2xs shrink-0">pChEMBL {c.pchembl_value.toFixed(1)}</span>
                  )}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Global scores (ptm / iptm / pde) ─────────────────────────────────────────

function GlobalScoresSection({ scores }: { scores: import("@/lib/types").GlobalModelScores }) {
  type ScoreItem = { label: string; value: number | null; tip: string; unit?: string };
  const items: ScoreItem[] = [
    { label: "pTM",      value: scores.ptm,      tip: "Template modelling score for the full complex (0–1; higher is better)." },
    { label: "ipTM",     value: scores.iptm,     tip: "Interface template modelling score — quality of predicted inter-chain contacts (0–1)." },
    { label: "mean PDE", value: scores.pde_mean, tip: "Mean predicted distance error across all residue pairs (Å; lower is better).", unit: "Å" },
  ].filter((i) => i.value != null);

  if (!items.length) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1 text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">Global scores <MetricInfo metric="iptm" /></p>
      <div className="flex gap-2">
        {items.map(({ label, value, tip, unit }) => (
          <div
            key={label}
            title={tip}
            className="flex flex-1 flex-col rounded-[12px] bg-[var(--pio-lavender-pale)] px-3 py-2.5"
          >
            <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-lavender-deep)]">{label}</p>
            <p className="mt-0.5 font-[family-name:var(--font-pio-mono)] text-pio-xl font-bold leading-none text-[var(--pio-ink)]">
              {value != null ? value.toFixed(3) : "—"}
              {unit && <span className="ml-0.5 text-pio-2xs font-normal text-[var(--pio-graphite)]">{unit}</span>}
            </p>
          </div>
        ))}
      </div>
      {Object.keys(scores.chain_iptm ?? {}).length > 1 && (
        <div className="rounded-[10px] bg-[var(--pio-paper)] px-3 py-2">
          <p className="mb-1.5 text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">Per-chain ipTM</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(scores.chain_iptm).map(([chain, val]) => (
              <span key={chain} className="pio-badge pio-badge-predicted">
                {chain}: {val.toFixed(3)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Chains ───────────────────────────────────────────────────────────────

function ChainsTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  const { selection, setSelection } = useWorkspace();
  if (!analysis) return null;

  if (!analysis.chains.length) {
    return (
      <div className="mt-8 flex flex-col items-center">
        <ChainNodeIcon size={40} color="var(--pio-line-strong)" />
        <p className="mt-3 text-center text-pio-md text-[var(--pio-graphite)]">No chains detected in this structure.</p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <h2 className="pio-section-title">Chains</h2>
      <p className="pio-section-copy mt-1">Protein residue and atom counts grouped by chain.</p>

      <div>
        {/* Header row */}
        <div
          className="border-b border-[var(--pio-line)] px-3 pb-2"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}
        >
          {["CHAIN", "RESIDUES", "ATOMS"].map((col) => (
            <p key={col} className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">{col}</p>
          ))}
        </div>

        {/* Data rows — thin dividers between rows, no box wrappers */}
        <motion.div className="flex flex-col" initial="hidden" animate="show" variants={stagger}>
          {analysis.chains.map((c, i) => {
            const isSelected = selection?.kind === "chain" && selection.chainId === c.id;
            return (
              <motion.div key={c.id} variants={listItem}>
                <motion.div
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() =>
                    setSelection(
                      isSelected ? null : { kind: "chain", chainId: c.id, label: `Chain ${c.id}` },
                    )
                  }
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelection(isSelected ? null : { kind: "chain", chainId: c.id, label: `Chain ${c.id}` }); } }}
                  whileTap={{ scale: 0.98 }}
                  transition={spring.snappy}
                  className={`cursor-pointer rounded-[8px] transition-colors duration-150 ${isSelected ? "" : "hover:bg-[var(--pio-paper)]"}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    alignItems: "center",
                    padding: "16px 12px",
                    border: `2px solid ${isSelected ? "var(--pio-highlight)" : "transparent"}`,
                    background: isSelected ? "var(--pio-row-selection-bg)" : undefined,
                  }}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(199,217,236,0.4)] text-pio-sm font-bold text-[var(--pio-highlight)]">
                    {c.id}
                  </div>
                  <p className="font-[family-name:var(--font-pio-mono)] text-pio-lg font-medium text-[var(--pio-ink)]">{c.residue_count.toLocaleString()}</p>
                  <p className="font-[family-name:var(--font-pio-mono)] text-pio-lg font-medium text-[var(--pio-ink)]">{c.atom_count.toLocaleString()}</p>
                </motion.div>
                {i < analysis.chains.length - 1 && (
                  <div className="mx-3 h-px bg-[var(--pio-line)]" />
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}

// ── Tab: Ligands ──────────────────────────────────────────────────────────────

function LigandsTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  const { selection, setSelection, floatingLigandKey, setFloatingLigandKey } = useWorkspace();
  if (!analysis) return null;

  if (!analysis.ligands.length) {
    return (
      <p className="text-pio-sm text-[var(--pio-graphite)] opacity-60">
        No ligands detected in this structure.
      </p>
    );
  }

  const hasCofactorNote = (analysis.ligand_validity ?? []).some((v) => v.note);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="pio-section-title">Ligands</h2>
        <p className="pio-section-copy mt-1">
          Chemistry, physical-validity checks, and binding contacts for each bound ligand.
        </p>
      </div>
      <motion.div className="flex flex-col gap-3" initial="hidden" animate="show" variants={stagger}>
        {analysis.ligands.map((lig) => {
          const key = `${lig.chain_id}:${lig.residue_number}`;
          const isFloating = floatingLigandKey === key;
          const isSelected =
            selection?.kind === "ligand" &&
            selection.chainId === lig.chain_id &&
            selection.residueNumber === lig.residue_number;
          const interaction = analysis.ligand_interactions.find(
            (li) => li.name === lig.name && li.chain_id === lig.chain_id,
          );
          const validity = (analysis.ligand_validity ?? []).find(
            (v) => v.name === lig.name && v.chain_id === lig.chain_id && v.residue_number === lig.residue_number,
          );

          function toggle() {
            if (isFloating) {
              setFloatingLigandKey(null);
              setSelection(null);
            } else {
              setFloatingLigandKey(key);
              setSelection({ kind: "ligand", chainId: lig.chain_id, residueName: lig.name, residueNumber: lig.residue_number, label: lig.name });
            }
          }

          return (
            <LigandCard
              key={`${lig.name}-${lig.chain_id}-${lig.residue_number}`}
              lig={lig}
              interaction={interaction}
              validity={validity}
              isFloating={isFloating}
              isSelected={!!isSelected}
              onToggle={toggle}
            />
          );
        })}
      </motion.div>

      {hasCofactorNote && (
        <p className="text-pio-xs text-[var(--pio-graphite)] opacity-70">
          Pose-validity (PoseBusters) checks apply only to organic small-molecule ligands.
          Ions, small cofactors, and metal-containing groups such as heme show chemistry from
          the PDB Chemical Component Dictionary where available.
        </p>
      )}
    </div>
  );
}

function LigandCard({
  lig, interaction, validity, isFloating, isSelected, onToggle,
}: {
  lig: LigandSummary;
  interaction: LigandInteractionSummary | undefined;
  validity: LigandValidity | undefined;
  isFloating: boolean;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const chem = validity?.chemistry ?? null;

  // Verdict badge in the header: pose validity for small molecules, else a class tag.
  let verdict: { cls: string; label: string } | null = null;
  if (chem && validity) {
    verdict =
      validity.pb_valid === true ? { cls: "pio-badge-active", label: "PB-valid" }
      : validity.pb_valid === false ? { cls: "pio-badge-warning", label: "invalid pose" }
      : { cls: "pio-badge-neutral", label: "not checked" };
  } else if (validity && !validity.is_small_molecule) {
    verdict = { cls: "pio-badge-neutral", label: "ion / cofactor" };
  } else if (validity && validity.is_small_molecule && !chem) {
    verdict = { cls: "pio-badge-neutral", label: "chemistry unavailable" };
  }

  const STAT_COLS = ["Atoms", "Contacts", "Protein", "Closest"] as const;
  const statValues: Record<string, string | number> = {
    Atoms:    lig.atom_count,
    Contacts: interaction?.contact_count ?? "—",
    Protein:  interaction?.protein_contact_count ?? "—",
    Closest:  interaction?.closest_distance_angstrom != null ? fmtDist(interaction.closest_distance_angstrom) : "—",
  };

  const CHEM_STATS: { label: string; value: string | number | null }[] = chem ? [
    { label: "MW", value: chem.molecular_weight },
    { label: "LogP", value: chem.logp },
    { label: "HBD", value: chem.h_bond_donors },
    { label: "HBA", value: chem.h_bond_acceptors },
    { label: "TPSA", value: chem.tpsa },
    { label: "Rot", value: chem.rotatable_bonds },
    { label: "Rings", value: chem.ring_count },
    { label: "QED", value: chem.qed },
  ] : [];

  const residues = interaction?.contacting_residues ?? [];
  const RESIDUE_CAP = 8;
  const failing = (validity?.checks ?? []).filter((ch) => !ch.passed);
  const checkCount = validity?.checks.length ?? 0;
  const passCount = checkCount - failing.length;

  return (
    <motion.div
      variants={listItem}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      whileHover={!isSelected ? { y: -2 } : undefined}
      whileTap={{ scale: 0.98 }}
      transition={spring.snappy}
      className={[
        "rounded-[14px] p-4 transition-colors cursor-pointer",
        isSelected ? "" : "bg-[var(--pio-paper)] hover:bg-[var(--pio-sky)]",
      ].join(" ")}
      style={{
        border: `2px solid ${isSelected ? "var(--pio-highlight)" : "transparent"}`,
        background: isSelected ? "var(--pio-row-selection-bg)" : undefined,
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <p className="text-pio-md font-bold text-[var(--pio-ink)] truncate">{lig.name}</p>
          <span className="shrink-0 font-[family-name:var(--font-pio-mono)] text-pio-xs text-[var(--pio-graphite)]">
            {lig.chain_id}:{lig.residue_number}
          </span>
          {verdict && <span className={`pio-badge ${verdict.cls} text-pio-xs shrink-0`}>{verdict.label}</span>}
          {interaction && interaction.possible_clash_count > 0 && (
            <span className="pio-badge pio-badge-warning text-pio-xs shrink-0">
              {interaction.possible_clash_count} clash{interaction.possible_clash_count > 1 ? "es" : ""}
            </span>
          )}
        </div>
        <motion.button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          whileTap={{ scale: 0.90 }}
          transition={spring.press}
          className={[
            "shrink-0 rounded-[8px] px-2.5 py-1 text-pio-xs font-semibold transition-colors",
            isFloating
              ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)]"
              : "bg-[var(--pio-sky)] text-[var(--pio-highlight)] hover:bg-[var(--pio-highlight)] hover:text-[var(--pio-highlight-text)]",
          ].join(" ")}
        >
          {isFloating ? "Close" : "View"}
        </motion.button>
      </div>

      {/* ── Chemistry: 2D depiction + properties ── */}
      {chem && (
        <div className="mb-4 flex gap-4">
          {chem.depiction_svg && (
            <div
              className="w-[124px] shrink-0 self-start rounded-[10px] [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: chem.depiction_svg }}
            />
          )}
          <div className="min-w-0 flex-1">
            {chem.formula && (
              <p className="mb-2 font-[family-name:var(--font-pio-mono)] text-pio-xs text-[var(--pio-graphite)] truncate">
                {chem.formula}
              </p>
            )}
            <div className="grid grid-cols-4 gap-x-4 gap-y-3">
              {CHEM_STATS.map((s) => (
                <div key={s.label} className="min-w-0">
                  <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] mb-0.5">{s.label}</p>
                  <p className="font-[family-name:var(--font-pio-mono)] text-pio-sm font-bold text-[var(--pio-ink)]">
                    {s.value == null ? "—" : s.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className={`pio-badge text-pio-xs ${chem.lipinski_pass ? "pio-badge-active" : "pio-badge-caution"}`}>
                {chem.lipinski_pass ? "Lipinski ✓" : `Lipinski ${chem.lipinski_violations ?? 0} viol.`}
              </span>
              {chem.pains_alerts != null && (
                <span className={`pio-badge text-pio-xs ${chem.pains_alerts > 0 ? "pio-badge-warning" : "pio-badge-active"}`}>
                  {chem.pains_alerts > 0 ? `${chem.pains_alerts} PAINS` : "no PAINS"}
                </span>
              )}
              {validity?.strain_energy != null && (
                <span className={`pio-badge text-pio-xs ${validity.strain_energy > 10 ? "pio-badge-caution" : "pio-badge-neutral"}`}>
                  strain {validity.strain_energy} kcal/mol
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Binding stats — always 4 columns ── */}
      <div className="grid grid-cols-4 gap-x-3 mb-4">
        {STAT_COLS.map((col) => (
          <div key={col} className="min-w-0">
            <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] mb-0.5">{col}</p>
            <p className="font-[family-name:var(--font-pio-mono)] text-pio-lg font-bold text-[var(--pio-ink)] truncate">{statValues[col]}</p>
          </div>
        ))}
      </div>

      {/* ── Contacting residues ── */}
      <div>
        <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] mb-1.5">
          Contacting residues
        </p>
        {residues.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {residues.slice(0, RESIDUE_CAP).map((r) => (
              <span key={`${r.chain_id}-${r.residue_number}`} className="pio-badge pio-badge-neutral" style={{ fontFamily: "var(--font-pio-mono)", fontSize: "var(--text-pio-xs)" }}>
                {r.chain_id}:{r.residue_name}{r.residue_number}
              </span>
            ))}
            {residues.length > RESIDUE_CAP && (
              <span className="pio-badge pio-badge-neutral" style={{ fontFamily: "var(--font-pio-mono)", fontSize: "var(--text-pio-xs)" }}>
                +{residues.length - RESIDUE_CAP}
              </span>
            )}
          </div>
        ) : (
          <p className="text-pio-sm text-[var(--pio-graphite)] opacity-50">—</p>
        )}
      </div>

      {/* ── Physical-validity checks / note ── */}
      {checkCount > 0 && (
        <div className="mt-4 border-t border-[var(--pio-line)] pt-3">
          <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] mb-1.5">
            PoseBusters {passCount}/{checkCount} checks passed
          </p>
          {failing.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {failing.map((ch) => (
                <span key={ch.name} className="pio-badge pio-badge-warning text-pio-xs" title={ch.description}>
                  ✗ {ch.description}
                </span>
              ))}
            </div>
          ) : (
            <span className="pio-badge pio-badge-active text-pio-xs">✓ All checks passed</span>
          )}
        </div>
      )}

    </motion.div>
  );
}

// ── Contacts helpers ──────────────────────────────────────────────────────────

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

const CONTACT_TRUST_BADGE: Record<string, string> = {
  "high-confidence":    "pio-badge-active",
  "inspect-manually":   "pio-badge-caution",
  "low-confidence":     "pio-badge-warning",
  "possible-clash":     "pio-badge-warning",
  "no-confidence-data": "pio-badge-neutral",
};
const CONTACT_TRUST_SHORT: Record<string, string> = {
  "high-confidence":    "high conf",
  "inspect-manually":   "inspect",
  "low-confidence":     "low conf",
  "possible-clash":     "clash",
  "no-confidence-data": "no data",
};
const COMPACT_BADGE: React.CSSProperties = { padding: "2px 7px", whiteSpace: "nowrap", fontFamily: "var(--font-pio-mono)", fontSize: "var(--text-pio-xs)" };

const CONTACT_INTERACTION_BADGE: Record<string, { cls: string; label: string }> = {
  "h-bond":       { cls: "pio-badge-predicted", label: "H-bond" },
  "salt-bridge":  { cls: "pio-badge-caution",   label: "salt bridge" },
  "aromatic":     { cls: "pio-badge-metadata",  label: "aromatic" },
  "pi-cation":    { cls: "pio-badge-metadata",  label: "π-cation" },
  "hydrophobic":  { cls: "pio-badge-active",    label: "hydrophobic" },
  "halogen-bond": { cls: "pio-badge-warning",   label: "halogen" },
};

function InteractionClassPill({ contact }: { contact: ContactRecord }) {
  const cls = contact.interaction_class;
  if (!cls || cls === "unclassified") return null;
  const badge = CONTACT_INTERACTION_BADGE[cls];
  if (!badge) return null;
  return <span className={`pio-badge ${badge.cls}`} style={COMPACT_BADGE}>{badge.label}</span>;
}

function ContactConfidencePill({ contact }: { contact: ContactRecord }) {
  const confidences = [contact.source_residue_confidence, contact.target_residue_confidence].filter(
    (c): c is ResidueConfidence => Boolean(c),
  );
  const tooltip = confidences.length
    ? confidences.map((c) => `${c.chain_id}:${c.residue_name}${c.residue_number} ${c.plddt.toFixed(1)}`).join(" / ")
    : undefined;

  if (contact.trust_label) {
    const cls = CONTACT_TRUST_BADGE[contact.trust_label] ?? "pio-badge-neutral";
    return <span title={tooltip} className={`pio-badge ${cls}`} style={COMPACT_BADGE}>{CONTACT_TRUST_SHORT[contact.trust_label] ?? contact.trust_label}</span>;
  }
  if (!confidences.length) return null;
  if (contact.confidence_warning)
    return <span title={tooltip} className="pio-badge pio-badge-warning" style={COMPACT_BADGE}>review</span>;
  return <span title={tooltip} className="pio-badge pio-badge-active" style={COMPACT_BADGE}>ok</span>;
}

function handleSelectableRowKeyDown(e: React.KeyboardEvent<HTMLElement>, fn: () => void) {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
}

// ── Tab: Contacts ─────────────────────────────────────────────────────────────

function ContactsTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  const { selection, setSelection } = useWorkspace();
  if (!analysis) return null;

  const [filter, setFilter] = useState<"all" | "protein-protein" | "protein-ligand" | "protein-water" | "ligand-water" | "inter-chain" | "clashes">("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const FILTERS = [
    { id: "all" as const,            label: "All" },
    { id: "protein-protein" as const, label: "Protein-protein" },
    { id: "protein-ligand" as const,  label: "Protein-ligand" },
    { id: "protein-water" as const,   label: "Protein-water" },
    { id: "ligand-water" as const,    label: "Ligand-water" },
    { id: "inter-chain" as const,     label: "Inter-chain" },
    { id: "clashes" as const,         label: "Clashes" },
  ];

  const filtered = analysis.contacts.filter((c) => {
    if (filter === "protein-protein") return c.contact_categories.includes("protein-protein");
    if (filter === "protein-ligand")  return c.contact_categories.includes("protein-ligand");
    if (filter === "protein-water")   return c.contact_categories.includes("protein-water");
    if (filter === "ligand-water")    return c.contact_categories.includes("ligand-water");
    if (filter === "inter-chain")     return c.contact_categories.includes("inter-chain") || (c.chain_a !== c.chain_b);
    if (filter === "clashes")         return c.trust_label === "possible-clash";
    return true;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const showConfidence = filtered.some((c) => c.trust_label != null || c.source_residue_confidence != null);
  const GRID = showConfidence
    ? "minmax(120px,1fr) minmax(150px,1.5fr) minmax(100px,1fr) minmax(80px,0.7fr)"
    : "minmax(120px,1fr) minmax(150px,1.5fr) minmax(100px,1fr)";
  const headers = showConfidence ? ["TYPE / CLASS", "CATEGORIES", "RESIDUES", "CONF"] : ["TYPE / CLASS", "CATEGORIES", "RESIDUES"];

  const chipBase: React.CSSProperties = { borderRadius: 999, fontWeight: 500, display: "inline-block", whiteSpace: "nowrap", fontFamily: "var(--font-pio-mono)", fontSize: "var(--text-pio-xs)" };

  return (
    <div className="flex flex-col gap-5">
      {/* Section header */}
      <div>
        <h2 className="pio-section-title">Contacts <MetricInfo metric="trust_label" /></h2>
        <p className="pio-section-copy mt-1">
          All residue and ligand contacts detected within the distance cutoff, grouped by interaction type.
        </p>
      </div>

      {/* Filter strip — individual pills, no container box */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => { setFilter(f.id); setPage(0); }}
            style={{
              borderRadius: 10,
              padding: "8px 18px",
              fontWeight: 500,
              fontSize: "var(--text-pio-xs)",
              lineHeight: 1,
              border: "none",
              cursor: "pointer",
              background: filter === f.id ? "rgba(199,217,236,0.5)" : "var(--pio-paper)",
              color: filter === f.id ? "var(--pio-highlight)" : "var(--pio-graphite)",
              transition: "background 150ms, color 150ms",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-pio-sm text-[var(--pio-graphite)]">
        {filtered.length.toLocaleString()} contacts
      </p>

      {/* Table — zero horizontal padding everywhere; row wrapper absorbs selection border */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: showConfidence ? 520 : 360 }}>
          {/* Header — horizontal padding matches row inner so columns align */}
          <div style={{ display: "grid", gridTemplateColumns: GRID, columnGap: 16, borderBottom: "1px solid var(--pio-line)", padding: "8px 10px" }}>
            {headers.map((col) => (
              <p key={col} className="text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]" style={{ textAlign: "left" }}>
                {col}
              </p>
            ))}
          </div>

          {/* Rows */}
          {paginated.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-pio-md text-[var(--pio-graphite)]">No contacts match this filter.</p>
            </div>
          ) : paginated.map((c, i) => {
            const isSelected = selection?.kind === "contact" && contactKey(selection.contact) === contactKey(c);
            const label = `${c.chain_a}:${c.residue_name_a}${c.residue_a}–${c.chain_b}:${c.residue_name_b}${c.residue_b}`;
            return (
              /* outline (not border) so the indicator is drawn outside the box — doesn't affect grid column widths */
              <div key={contactKey(c)}>
                <motion.div
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => setSelection(isSelected ? null : { kind: "contact", contact: c, label })}
                  onKeyDown={(e) => handleSelectableRowKeyDown(e, () => setSelection(isSelected ? null : { kind: "contact", contact: c, label }))}
                  whileTap={{ scale: 0.98 }}
                  transition={spring.snappy}
                  style={{
                    display: "grid",
                    gridTemplateColumns: GRID,
                    columnGap: 16,
                    alignItems: "start",
                    padding: "15px 10px",
                    borderRadius: 8,
                    outline: isSelected ? `2px solid var(--pio-highlight)` : "2px solid transparent",
                    outlineOffset: -2,
                    background: isSelected ? "var(--pio-row-selection-bg)" : undefined,
                    cursor: "pointer",
                  }}
                  className={isSelected ? "" : "hover:bg-[rgba(17,22,16,0.04)]"}
                >
                  {/* TYPE / CLASS — items-start prevents chips from stretching full column width */}
                  <div className="flex flex-col items-start gap-1">
                    <span style={{ ...chipBase, ...contactChipStyle(c.contact_type), padding: "2px 8px" }}>
                      {c.contact_type}
                    </span>
                    <InteractionClassPill contact={c} />
                  </div>

                  {/* CATEGORIES — wrap but hug content */}
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 4 }}>
                    {c.contact_categories.length ? c.contact_categories.map((cat) => (
                      <span key={cat} style={{ ...chipBase, ...contactChipStyle(cat), padding: "2px 8px" }}>{cat}</span>
                    )) : <span className="text-pio-xs text-[var(--pio-graphite)]">—</span>}
                  </div>

                  {/* RESIDUES */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span className="text-pio-xs font-[family-name:var(--font-pio-mono)] font-medium text-[var(--pio-ink)]">
                      {c.chain_a}:{c.residue_name_a}{c.residue_a}
                    </span>
                    <span className="text-pio-xs font-[family-name:var(--font-pio-mono)] font-medium text-[var(--pio-ink)]">
                      {c.chain_b}:{c.residue_name_b}{c.residue_b}
                    </span>
                  </div>

                  {/* CONF */}
                  {showConfidence && (
                    <div className="flex items-start">
                      <ContactConfidencePill contact={c} />
                    </div>
                  )}
                </motion.div>
                {i < paginated.length - 1 && <div style={{ height: 1, background: "var(--pio-line)" }} />}
              </div>
            );
          })}

          {filtered.length > PAGE_SIZE && (
            <p className="text-pio-sm text-[var(--pio-graphite)] border-t border-[var(--pio-line)] pt-2 mt-1">
              Showing {paginated.length} of {filtered.length.toLocaleString()} contacts.
            </p>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <motion.button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            whileTap={page !== 0 ? { scale: 0.92 } : undefined}
            transition={spring.press}
            style={{
              borderRadius: 8,
              padding: "7px 14px",
              fontWeight: 500,
              fontSize: "var(--text-pio-xs)",
              border: "none",
              cursor: page === 0 ? "default" : "pointer",
              background: "var(--pio-paper)",
              color: "var(--pio-highlight)",
              opacity: page === 0 ? 0.35 : 1,
              transition: "opacity 150ms",
            }}
          >← Prev</motion.button>
          <span className="text-pio-xs text-[var(--pio-graphite)]">{page + 1} / {totalPages}</span>
          <motion.button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            whileTap={page < totalPages - 1 ? { scale: 0.92 } : undefined}
            transition={spring.press}
            style={{
              borderRadius: 8,
              padding: "7px 14px",
              fontWeight: 500,
              fontSize: "var(--text-pio-xs)",
              border: "none",
              cursor: page >= totalPages - 1 ? "default" : "pointer",
              background: "var(--pio-paper)",
              color: "var(--pio-highlight)",
              opacity: page >= totalPages - 1 ? 0.35 : 1,
              transition: "opacity 150ms",
            }}
          >Next →</motion.button>
        </div>
      )}
    </div>
  );
}

// ── Tab: Interfaces ───────────────────────────────────────────────────────────

// ── Interface contact map ─────────────────────────────────────────────────────

const IMAP_CELL = 12;
const IMAP_LABEL_W = 46;
const IMAP_LABEL_H = 44;
const IMAP_MAX = 24; // max residues per axis

const IMAP_CLASS_COLOR: Record<string, string> = {
  "h-bond":      "var(--pio-lavender-deep, #6B5FCF)",
  "salt-bridge": "var(--pio-amber, #E08C18)",
  "aromatic":    "var(--pio-highlight, #1A406A)",
  "pi-cation":   "var(--pio-highlight, #1A406A)",
  "hydrophobic": "var(--pio-green-deep, #276945)",
  "halogen-bond":"var(--pio-coral, #C94F3A)",
};

function InterfaceContactMap({
  contacts,
  residuesA,
  residuesB,
  chainA,
  chainB,
}: {
  contacts: ContactRecord[];
  residuesA: { chain_id: string; residue_number: string; residue_name: string }[];
  residuesB: { chain_id: string; residue_number: string; residue_name: string }[];
  chainA: string;
  chainB: string;
}) {
  // Spatial order: sort by residue number numerically
  const rowRes = [...residuesA]
    .sort((a, b) => parseInt(a.residue_number) - parseInt(b.residue_number))
    .slice(0, IMAP_MAX);
  const colRes = [...residuesB]
    .sort((a, b) => parseInt(a.residue_number) - parseInt(b.residue_number))
    .slice(0, IMAP_MAX);

  if (!rowRes.length || !colRes.length) return null;

  const rowIdx = new Map(rowRes.map((r, i) => [r.residue_number, i]));
  const colIdx = new Map(colRes.map((r, i) => [r.residue_number, i]));

  // Collect dots: one per residue-pair (pick closest contact for color)
  const dots = new Map<string, { ri: number; ci: number; cls: string; dist: number }>();
  for (const c of contacts) {
    const aIsA = c.chain_a === chainA;
    const rNumA = aIsA ? c.residue_a : c.residue_b;
    const rNumB = aIsA ? c.residue_b : c.residue_a;
    const ri = rowIdx.get(rNumA);
    const ci = colIdx.get(rNumB);
    if (ri === undefined || ci === undefined) continue;
    const key = `${ri}-${ci}`;
    const existing = dots.get(key);
    if (!existing || c.distance_angstrom < existing.dist) {
      dots.set(key, { ri, ci, cls: c.interaction_class ?? "", dist: c.distance_angstrom });
    }
  }

  const svgW = IMAP_LABEL_W + colRes.length * IMAP_CELL;
  const svgH = IMAP_LABEL_H + rowRes.length * IMAP_CELL;

  return (
    <div className="mt-4">
      <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] mb-2">Contact map</p>
      <div className="overflow-x-auto">
        <svg width={svgW} height={svgH} style={{ display: "block", minWidth: svgW }}>
          {/* Column labels (chain B residues — rotated) */}
          {colRes.map((r, ci) => (
            <text
              key={r.residue_number}
              x={IMAP_LABEL_W + ci * IMAP_CELL + IMAP_CELL / 2}
              y={IMAP_LABEL_H - 4}
              textAnchor="start"
              fontSize={8}
              fontFamily="var(--font-pio-mono)"
              fill="var(--pio-graphite)"
              transform={`rotate(-55, ${IMAP_LABEL_W + ci * IMAP_CELL + IMAP_CELL / 2}, ${IMAP_LABEL_H - 4})`}
            >
              {r.residue_name}{r.residue_number}
            </text>
          ))}

          {/* Row labels (chain A residues) */}
          {rowRes.map((r, ri) => (
            <text
              key={r.residue_number}
              x={IMAP_LABEL_W - 4}
              y={IMAP_LABEL_H + ri * IMAP_CELL + IMAP_CELL / 2 + 3}
              textAnchor="end"
              fontSize={8}
              fontFamily="var(--font-pio-mono)"
              fill="var(--pio-graphite)"
            >
              {r.residue_name}{r.residue_number}
            </text>
          ))}

          {/* Grid background cells */}
          {rowRes.map((_, ri) =>
            colRes.map((_, ci) => (
              <rect
                key={`cell-${ri}-${ci}`}
                x={IMAP_LABEL_W + ci * IMAP_CELL}
                y={IMAP_LABEL_H + ri * IMAP_CELL}
                width={IMAP_CELL}
                height={IMAP_CELL}
                fill={ri % 2 === 0 ? "var(--pio-paper)" : "transparent"}
                stroke="var(--pio-line)"
                strokeWidth={0.4}
              />
            ))
          )}

          {/* Contact dots */}
          {[...dots.values()].map(({ ri, ci, cls }) => {
            const color = IMAP_CLASS_COLOR[cls] ?? "var(--pio-graphite)";
            const rowR = rowRes[ri];
            const colR = colRes[ci];
            return (
              <circle
                key={`dot-${ri}-${ci}`}
                cx={IMAP_LABEL_W + ci * IMAP_CELL + IMAP_CELL / 2}
                cy={IMAP_LABEL_H + ri * IMAP_CELL + IMAP_CELL / 2}
                r={IMAP_CELL / 2 - 1.5}
                fill={color}
                opacity={0.85}
              >
                <title>{rowR?.residue_name}{rowR?.residue_number} – {colR?.residue_name}{colR?.residue_number}{cls ? ` (${cls})` : ""}</title>
              </circle>
            );
          })}

          {/* Axis chain labels */}
          <text x={IMAP_LABEL_W - 4} y={12} textAnchor="end" fontSize={9} fontWeight={700} fill="var(--pio-highlight)" fontFamily="var(--font-pio-mono)">
            {chainA}
          </text>
          <text
            x={IMAP_LABEL_W + colRes.length * IMAP_CELL / 2}
            y={8}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            fill="var(--pio-highlight)"
            fontFamily="var(--font-pio-mono)"
          >
            {chainB}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(IMAP_CLASS_COLOR).map(([cls, color]) => (
          <span key={cls} className="flex items-center gap-1 text-pio-3xs text-[var(--pio-graphite)]">
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
            {cls}
          </span>
        ))}
        <span className="flex items-center gap-1 text-pio-3xs text-[var(--pio-graphite)]">
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--pio-graphite)", opacity: 0.45, flexShrink: 0 }} />
          other
        </span>
      </div>
    </div>
  );
}

// ── InterfacesTab ─────────────────────────────────────────────────────────────

function interfaceConfBadge(conf: InterfaceConfidence): { cls: string; label: string } {
  if (conf === "high") return { cls: "pio-badge-active", label: "High confidence" };
  if (conf === "moderate") return { cls: "pio-badge-caution", label: "Moderate confidence" };
  return { cls: "pio-badge-warning", label: "Low confidence" };
}

function InterfacesTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  const { selection, setSelection } = useWorkspace();
  const [expandedPairs, setExpandedPairs] = useState<Set<string>>(new Set());

  if (!analysis) return null;
  const ia = analysis.interface_analysis;

  if (!ia || !ia.chain_pairs.length) {
    return (
      <p className="text-pio-xs text-[var(--pio-graphite)] opacity-60">
        {analysis.summary.chain_count < 2
          ? "Single-chain structure — no chain interfaces."
          : "No chain interfaces detected."}
      </p>
    );
  }

  function toggleExpand(pairKey: string, e: React.MouseEvent) {
    e.stopPropagation();
    setExpandedPairs((prev) => {
      const next = new Set(prev);
      if (next.has(pairKey)) next.delete(pairKey); else next.add(pairKey);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="pio-section-title">Interfaces <MetricInfo metric="interface_confidence" /></h2>
        <p className="pio-section-copy mt-1">
          Chain-pair contact interfaces — inter-chain contacts and participating residues.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Inter-chain contacts", value: ia.inter_chain_contact_count },
          { label: "Intra-chain contacts", value: ia.intra_chain_contact_count },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-[10px] bg-[var(--pio-paper)] px-[14px] py-3">
            <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">{label}</p>
            <p className="mt-1 font-[family-name:var(--font-pio-mono)] text-pio-2xl font-bold leading-none text-[var(--pio-ink)]">
              {value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {ia.chain_pairs.map((cp) => {
          const pairKey = `${cp.chain_a}-${cp.chain_b}`;
          const isSelected = selection?.kind === "interface" && selection.chainA === cp.chain_a && selection.chainB === cp.chain_b;
          const isExpanded = expandedPairs.has(pairKey);

          // Contacts for this pair (both orientations)
          const pairContacts = analysis.contacts.filter((c) =>
            (c.chain_a === cp.chain_a && c.chain_b === cp.chain_b) ||
            (c.chain_a === cp.chain_b && c.chain_b === cp.chain_a),
          );

          return (
            <motion.div
              key={pairKey}
              role="button"
              tabIndex={0}
              onClick={() => setSelection(isSelected ? null : { kind: "interface", chainA: cp.chain_a, chainB: cp.chain_b, label: `Chain ${cp.chain_a}–${cp.chain_b}` })}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelection(isSelected ? null : { kind: "interface", chainA: cp.chain_a, chainB: cp.chain_b, label: `Chain ${cp.chain_a}–${cp.chain_b}` }); } }}
              whileHover={!isSelected ? { y: -2 } : undefined}
              whileTap={{ scale: 0.98 }}
              transition={spring.snappy}
              className={[
                "rounded-[14px] overflow-hidden cursor-pointer transition-colors",
                isSelected ? "" : "bg-[var(--pio-paper)] hover:bg-[var(--pio-sky)]",
              ].join(" ")}
              style={{
                border: `2px solid ${isSelected ? "var(--pio-highlight)" : "transparent"}`,
                background: isSelected ? "var(--pio-row-selection-bg)" : undefined,
              }}
            >
              {/* Header row — layout only, click handled by card wrapper */}
              <div className="flex items-center gap-2 p-4">
                <div className="flex items-center gap-1.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(199,217,236,0.4)] text-pio-sm font-bold text-[var(--pio-highlight)]">
                    {cp.chain_a}
                  </div>
                  <ChevronRight size={11} className="text-[var(--pio-graphite)]" />
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(199,217,236,0.4)] text-pio-sm font-bold text-[var(--pio-highlight)]">
                    {cp.chain_b}
                  </div>
                </div>
                <span className="text-pio-xs text-[var(--pio-graphite)]">
                  {cp.contact_count.toLocaleString()} contacts
                </span>
                {cp.interface_confidence && (
                  <span className={`pio-badge ${interfaceConfBadge(cp.interface_confidence).cls} text-pio-xs shrink-0`}>
                    {interfaceConfBadge(cp.interface_confidence).label}
                  </span>
                )}
                {/* Expand toggle — stops propagation so it doesn't trigger 3D selection */}
                <motion.button
                  type="button"
                  onClick={(e) => toggleExpand(pairKey, e)}
                  whileTap={{ scale: 0.85 }}
                  transition={spring.press}
                  className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--pio-graphite)] hover:bg-[var(--pio-line)] transition-colors"
                  aria-label={isExpanded ? "Collapse details" : "Expand details"}
                >
                  <ChevronRight size={14} className={["transition-transform", isExpanded ? "rotate-90" : "rotate-0"].join(" ")} />
                </motion.button>
              </div>

              {/* Interface metrics — PAE confidence + buried surface area */}
              {(cp.interface_pae != null || cp.interface_bsa != null) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-3">
                  {cp.interface_pae != null && (
                    <span className="text-pio-xs text-[var(--pio-graphite)]">
                      Interface PAE{" "}
                      <span className="font-[family-name:var(--font-pio-mono)] font-bold text-[var(--pio-ink)]">{cp.interface_pae.toFixed(1)} Å</span>
                    </span>
                  )}
                  {cp.cross_pae_mean != null && (
                    <span className="text-pio-xs text-[var(--pio-graphite)]">
                      Cross-PAE{" "}
                      <span className="font-[family-name:var(--font-pio-mono)] font-bold text-[var(--pio-ink)]">{cp.cross_pae_mean.toFixed(1)} Å</span>
                    </span>
                  )}
                  {cp.interface_bsa != null && (
                    <span className="text-pio-xs text-[var(--pio-graphite)]">
                      Buried area{" "}
                      <span className="font-[family-name:var(--font-pio-mono)] font-bold text-[var(--pio-ink)]">{cp.interface_bsa.toLocaleString()} Å²</span>
                    </span>
                  )}
                </div>
              )}

              {/* Per-chain summary row */}
              <div className="grid grid-cols-2 gap-3 px-4 pb-4">
                {[
                  { chain: cp.chain_a, count: cp.interface_residue_count_a, plddt: cp.mean_plddt_a },
                  { chain: cp.chain_b, count: cp.interface_residue_count_b, plddt: cp.mean_plddt_b },
                ].map(({ chain, count, plddt }) => (
                  <div key={chain}>
                    <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] mb-1">Chain {chain}</p>
                    <p className="text-pio-sm text-[var(--pio-ink)]">{count} residues</p>
                    {plddt != null && (
                      <p className="text-pio-xs mt-0.5" style={{ color: plddtColor(plddt) }}>
                        mean pLDDT {plddt.toFixed(1)}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Expandable: per-residue confidence + contact map */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    key="details"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: ease.inOut }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className="border-t border-[var(--pio-line)] px-4 pb-5 pt-4">

                      {/* Per-residue confidence — two columns */}
                      <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] mb-2">Interface residues</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {/* Chain A column */}
                        <div className="flex flex-col gap-1">
                          <p className="text-pio-3xs font-bold uppercase tracking-[0.08em] text-[var(--pio-highlight)] mb-1 opacity-60">Chain {cp.chain_a}</p>
                          {cp.interface_residues_a.map((r) => (
                            <div key={`${r.chain_id}-${r.residue_number}`} className="flex items-center gap-1.5">
                              <span className="text-pio-3xs font-[family-name:var(--font-pio-mono)] text-[var(--pio-ink)] min-w-0 truncate" title={`${r.residue_name}${r.residue_number}`}>
                                {r.residue_name}{r.residue_number}
                              </span>
                              <span className="ml-auto shrink-0 text-pio-3xs font-[family-name:var(--font-pio-mono)] text-[var(--pio-graphite)]">
                                {r.contact_count}×
                              </span>
                              {r.plddt != null && (
                                <span
                                  className="shrink-0 rounded-[4px] px-1 text-pio-3xs font-bold leading-none"
                                  style={{
                                    color: plddtColor(r.plddt),
                                    background: plddtColor(r.plddt) + "22",
                                    padding: "2px 4px",
                                  }}
                                >
                                  {r.plddt.toFixed(0)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        {/* Chain B column */}
                        <div className="flex flex-col gap-1">
                          <p className="text-pio-3xs font-bold uppercase tracking-[0.08em] text-[var(--pio-highlight)] mb-1 opacity-60">Chain {cp.chain_b}</p>
                          {cp.interface_residues_b.map((r) => (
                            <div key={`${r.chain_id}-${r.residue_number}`} className="flex items-center gap-1.5">
                              <span className="text-pio-3xs font-[family-name:var(--font-pio-mono)] text-[var(--pio-ink)] min-w-0 truncate" title={`${r.residue_name}${r.residue_number}`}>
                                {r.residue_name}{r.residue_number}
                              </span>
                              <span className="ml-auto shrink-0 text-pio-3xs font-[family-name:var(--font-pio-mono)] text-[var(--pio-graphite)]">
                                {r.contact_count}×
                              </span>
                              {r.plddt != null && (
                                <span
                                  className="shrink-0 rounded-[4px] px-1 text-pio-3xs font-bold leading-none"
                                  style={{
                                    color: plddtColor(r.plddt),
                                    background: plddtColor(r.plddt) + "22",
                                    padding: "2px 4px",
                                  }}
                                >
                                  {r.plddt.toFixed(0)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Contact map */}
                      {pairContacts.length > 0 && (
                        <InterfaceContactMap
                          contacts={pairContacts}
                          residuesA={cp.interface_residues_a}
                          residuesB={cp.interface_residues_b}
                          chainA={cp.chain_a}
                          chainB={cp.chain_b}
                        />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab: Confidence ───────────────────────────────────────────────────────────

function ConfidenceTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  if (!analysis) return null;
  const conf = analysis.confidence;

  if (!conf) {
    return (
      <p className="text-pio-xs text-[var(--pio-graphite)] opacity-60">
        No pLDDT confidence data in this structure. AlphaFold or predicted structures include pLDDT values.
      </p>
    );
  }

  const total = conf.residue_count;
  const bands = [
    { label: "Very high (≥90)", count: conf.very_high_count, color: "var(--pio-green-deep)" },
    { label: "Confident (70–90)", count: conf.confident_count, color: "var(--pio-highlight)" },
    { label: "Low (50–70)", count: conf.low_count, color: "var(--pio-amber)" },
    { label: "Very low (<50)", count: conf.very_low_count, color: "var(--pio-coral)" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="pio-section-title">Confidence (pLDDT) <MetricInfo metric="plddt" /></h2>
        <p className="pio-section-copy mt-1">
          Per-residue pLDDT — how confident the model is in each residue&apos;s predicted position (0–100).
          Treat low and very-low regions cautiously.
        </p>
      </div>
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[12px] bg-[var(--pio-paper)] px-4 py-3">
          <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">Average pLDDT</p>
          <p className="font-[family-name:var(--font-pio-mono)] text-pio-2xl font-bold leading-none mt-1" style={{ color: plddtColor(conf.average_plddt) }}>
            {conf.average_plddt.toFixed(1)}
          </p>
          <p className="text-pio-xs mt-1" style={{ color: plddtColor(conf.average_plddt) }}>
            {plddtLabel(conf.average_plddt)}
          </p>
        </div>
        <div className="rounded-[12px] bg-[var(--pio-paper)] px-4 py-3">
          <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">Residues</p>
          <p className="font-[family-name:var(--font-pio-mono)] text-pio-2xl font-bold leading-none mt-1 text-[var(--pio-ink)]">{total.toLocaleString()}</p>
        </div>
      </div>

      {/* Band breakdown */}
      <div className="flex flex-col gap-2">
        {bands.map((b) => {
          const w = pct(b.count, total);
          return (
            <div key={b.label}>
              <div className="flex justify-between mb-1">
                <span className="text-pio-xs text-[var(--pio-graphite)]">{b.label}</span>
                <span className="text-pio-xs font-semibold text-[var(--pio-ink)]">
                  {b.count.toLocaleString()} ({w}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--pio-line)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${w}%`, background: b.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab: PAE ──────────────────────────────────────────────────────────────────

// PAE colour scale (AlphaFold-style Greens_r): low error = confident = dark green,
// high error = uncertain = pale. Data-driven, so it reads on both themes.
function paeColor(value: number, max: number): string {
  const t = Math.max(0, Math.min(1, value / (max || 1)));
  const stops: [number, [number, number, number]][] = [
    [0.0, [0, 68, 27]],
    [0.5, [65, 171, 93]],
    [1.0, [247, 252, 245]],
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const f = (t - lo[0]) / ((hi[0] - lo[0]) || 1);
  const c = [0, 1, 2].map((k) => Math.round(lo[1][k] + (hi[1][k] - lo[1][k]) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function plotPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  const rr = (ctx as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect;
  if (typeof rr === "function") rr.call(ctx, x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function PaeHeatmap({ matrix }: { matrix: PaeMatrix }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const D = matrix.down_size;
  const max = matrix.max_error || 30;
  const blocks = matrix.chain_blocks;
  const N = matrix.size;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const SIZE = 340;
    const PAD_L = 34, PAD_B = 30, PAD_T = 8, PAD_R = 8;
    const plotW = SIZE - PAD_L - PAD_R;
    const plotH = SIZE - PAD_T - PAD_B;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, SIZE, SIZE);

    const ink = getComputedStyle(document.documentElement).getPropertyValue("--pio-graphite").trim() || "#888";
    const fam = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    const cx = plotW / D;
    const cy = plotH / D;
    const R = 10;

    // cells + boundary lines, clipped to a rounded plot region
    ctx.save();
    plotPath(ctx, PAD_L, PAD_T, plotW, plotH, R);
    ctx.clip();
    for (let i = 0; i < D; i++) {
      for (let j = 0; j < D; j++) {
        ctx.fillStyle = paeColor(matrix.values[i][j], max);
        ctx.fillRect(PAD_L + j * cx, PAD_T + i * cy, Math.ceil(cx), Math.ceil(cy));
      }
    }
    if (blocks.length > 1) {
      ctx.strokeStyle = "rgba(128,128,128,0.55)";
      ctx.lineWidth = 0.75;
      for (const b of blocks.slice(1)) {
        const px = PAD_L + b.start * cx;
        const py = PAD_T + b.start * cy;
        ctx.beginPath(); ctx.moveTo(px, PAD_T); ctx.lineTo(px, PAD_T + plotH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(PAD_L, py); ctx.lineTo(PAD_L + plotW, py); ctx.stroke();
      }
    }
    ctx.restore();

    // rounded plot outline
    ctx.strokeStyle = "rgba(128,128,128,0.3)";
    ctx.lineWidth = 1;
    plotPath(ctx, PAD_L, PAD_T, plotW, plotH, R);
    ctx.stroke();

    // labels — sized to the font-size token scale (2xs = 9px, 3xs = 8px)
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (blocks.length > 1) {
      ctx.font = `600 9px ${fam}`;
      for (const b of blocks) {
        const mid = (b.start + b.end) / 2;
        ctx.fillText(b.chain_id, PAD_L + mid * cx, PAD_T + plotH + 12);           // x-axis
        ctx.fillText(b.chain_id, PAD_L - 14, PAD_T + mid * cy);                    // y-axis
      }
    }
    ctx.font = `600 8px ${fam}`;
    ctx.fillText("Scored residue" + (blocks.length > 1 ? " (by chain)" : ""), PAD_L + plotW / 2, SIZE - 2);
    ctx.save();
    ctx.translate(8, PAD_T + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Aligned residue", 0, 0);
    ctx.restore();
  }, [matrix, D, max, N, blocks]);

  return (
    <div className="flex flex-col gap-2">
      <canvas ref={ref} className="w-full" style={{ aspectRatio: "1 / 1" }} />
      <div className="flex items-center gap-2">
        <span className="text-pio-2xs text-[var(--pio-graphite)]">0 Å · confident</span>
        <div
          className="h-2 flex-1 rounded-full"
          style={{ background: `linear-gradient(90deg, ${paeColor(0, max)}, ${paeColor(max / 2, max)}, ${paeColor(max, max)})` }}
        />
        <span className="text-pio-2xs text-[var(--pio-graphite)]">{max.toFixed(0)} Å · uncertain</span>
      </div>
    </div>
  );
}

function PaeTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  if (!analysis) return null;
  const pae = analysis.pae;

  if (!pae) {
    return (
      <p className="text-pio-xs text-[var(--pio-graphite)] opacity-60">
        No PAE data. Upload a confidence sidecar (.json or .npz) alongside a predicted structure to enable this tab.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="pio-section-title">Predicted Aligned Error <MetricInfo metric="pae" /></h2>
        <p className="pio-section-copy mt-1">
          Expected error in the relative position of every residue pair. Off-diagonal blocks show how
          confidently the chains are placed relative to one another.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Residues",    value: pae.residue_count.toLocaleString() },
          { label: "Mean PAE",    value: `${pae.mean_predicted_aligned_error.toFixed(1)} Å` },
          { label: "Max PAE",     value: `${pae.max_predicted_aligned_error.toFixed(1)} Å` },
          { label: `High-error pairs (≥${pae.high_error_threshold}Å)`, value: pae.high_error_pair_count.toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-[12px] bg-[var(--pio-paper)] px-4 py-3">
            <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">{label}</p>
            <p className="font-[family-name:var(--font-pio-mono)] text-pio-2xl font-bold leading-none mt-1 text-[var(--pio-ink)]">{value}</p>
          </div>
        ))}
      </div>
      {analysis.pae_matrix ? (
        <div>
          <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] mb-2">Predicted aligned error</p>
          <PaeHeatmap matrix={analysis.pae_matrix} />
          <p className="mt-2 text-pio-xs text-[var(--pio-graphite)] opacity-70">
            Expected position error between every residue pair. Green blocks off the diagonal mean
            the two chains are confidently placed relative to each other; pale blocks mean the
            relative orientation is uncertain.
          </p>
        </div>
      ) : (
        <p className="text-pio-xs text-[var(--pio-graphite)] opacity-60">
          PAE matrix could not be aligned to the structure (token count mismatch).
        </p>
      )}
    </div>
  );
}

// ── Quality helpers ───────────────────────────────────────────────────────────

function ChainNodeIcon({ size = 20, color = "#636860" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke={color} strokeWidth="1.4" />
      <circle cx="13" cy="13" r="4.5" stroke={color} strokeWidth="1.4" />
      <line x1="7" y1="11.5" x2="13" y2="8.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function contactKey(c: { contact_type?: string; chain_a: string; residue_a: string; residue_name_a: string; atom_a: string; chain_b: string; residue_b: string; residue_name_b: string; atom_b: string }) {
  return [c.contact_type, c.chain_a, c.residue_a, c.residue_name_a, c.atom_a, c.chain_b, c.residue_b, c.residue_name_b, c.atom_b].join("|");
}

function QualityCheckCard({
  label, value, description, tone, fullWidth,
}: {
  label: string;
  value: string | number;
  description: string;
  tone: "amber" | "green" | "neutral";
  fullWidth?: boolean;
}) {
  const bg         = tone === "amber" ? "var(--pio-quality-amber-bg)" : tone === "green" ? "var(--pio-quality-green-bg)" : "var(--pio-paper)";
  const labelColor = tone === "amber" ? "var(--pio-quality-amber-fg)" : tone === "green" ? "var(--pio-quality-green-fg)" : "var(--pio-graphite)";
  const valueColor = tone === "amber" ? "var(--pio-quality-amber-fg)" : tone === "green" ? "var(--pio-quality-green-fg)" : "var(--pio-ink)";
  const descColor  = tone === "amber" ? "var(--pio-quality-amber-fg-soft)" : tone === "green" ? "var(--pio-quality-green-fg-soft)" : "var(--pio-graphite)";
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "14px 16px", overflow: "hidden", gridColumn: fullWidth ? "1 / -1" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <p className="text-pio-3xs" style={{ fontWeight: 600, letterSpacing: "0.07em", color: labelColor, lineHeight: 1.3 }}>{label}</p>
        <span className="text-pio-4xl" style={{ fontWeight: 700, color: valueColor, lineHeight: 1.1, marginLeft: 8, flexShrink: 0 }}>{value}</span>
      </div>
      <p className="text-pio-sm" style={{ lineHeight: 1.5, marginTop: 8, color: descColor }}>{description}</p>
    </div>
  );
}

// ── Tab: Quality ──────────────────────────────────────────────────────────────

function QualityTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  if (!analysis) return null;

  const veryCloseContacts = analysis.interaction_summary?.possible_clash_count ?? 0;
  const lowConfidence = analysis.confidence?.low_confidence_count ?? 0;
  const paeProvided = Boolean(analysis.pae);
  const hasLigands = analysis.summary.ligand_count > 0;

  const cards: Array<{ label: string; value: string | number; description: string; tone: "amber" | "green" | "neutral"; fullWidth?: boolean }> = [
    {
      label: "VERY CLOSE CONTACTS",
      value: veryCloseContacts,
      description: "Atom pairs under 2 Å are review flags. They may include expected covalent geometry and are not proof of a steric clash.",
      tone: "amber",
    },
    {
      label: "LIGAND STATE",
      value: hasLigands ? analysis.summary.ligand_count : "None",
      description: hasLigands ? "Ligands are available for interaction review." : "No non-water ligands were detected in this structure.",
      tone: "green",
    },
    {
      label: "LOW-CONFIDENCE RESIDUES",
      value: analysis.confidence ? lowConfidence : "N/A",
      description: analysis.confidence ? "Low or very low pLDDT regions should not be over-interpreted." : "No pLDDT confidence data was detected for this structure.",
      tone: "green",
    },
    {
      label: "PAE SIDECAR",
      value: paeProvided ? "Provided" : "N/A",
      description: paeProvided ? "PAE summary is available in the PAE tab." : "PAE is usually relevant for AlphaFold-style predicted structures.",
      tone: "neutral",
      fullWidth: true,
    },
  ];

  const closeContactExamples = [
    ...(analysis.interaction_summary?.possible_clashes ?? []),
    ...analysis.contacts.filter((c) => c.distance_angstrom < 2),
  ]
    .filter((c, i, rows) => rows.findIndex((r) => contactKey(r) === contactKey(c)) === i)
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="pio-section-title">Quality</h2>
        <p className="pio-section-copy mt-1">
          Practical validation signals from existing contact, ligand, confidence, and PAE data.
        </p>
      </div>

      <div style={{ background: "var(--pio-quality-amber-bg)", border: "1px solid var(--pio-quality-amber-border)", borderRadius: 10, padding: "10px 14px" }}>
        <p className="text-pio-sm" style={{ fontWeight: 400, color: "var(--pio-quality-amber-fg)", lineHeight: 1.5 }}>
          These are screening/review signals, not full crystallographic validation or chemical perception.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {cards.map((card) => <QualityCheckCard key={card.label} {...card} />)}
      </div>

      {/* Close-contact examples */}
      <div>
        <h3 className="text-pio-2xl font-bold leading-[1.15]" style={{ letterSpacing: "-0.01em", color: "var(--pio-ink)" }}>Close-Contact Examples</h3>
        <p className="text-pio-md mt-1" style={{ color: "var(--pio-graphite)" }}>
          Representative atom pairs under 2 Å. Review them in context before drawing a chemical conclusion.
        </p>

        {closeContactExamples.length ? (
          <div className="mt-3">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid var(--pio-line)", paddingBottom: 8 }}>
              {["ATOM 1", "ATOM 2", "DIST"].map((col) => (
                <p key={col} className="text-pio-3xs" style={{ fontWeight: 600, letterSpacing: "0.07em", color: "var(--pio-graphite)", textAlign: "left" }}>{col}</p>
              ))}
            </div>
            {closeContactExamples.map((c, i) => (
              <div key={contactKey(c)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "9px 0", borderBottom: i < closeContactExamples.length - 1 ? "1px solid var(--pio-line)" : "none" }}>
                <span className="text-pio-sm" style={{ fontFamily: "var(--font-pio-mono)", fontWeight: 500, color: "var(--pio-ink)", textAlign: "left" }}>
                  {c.chain_a}:{c.residue_name_a}{c.residue_a}.{c.atom_a}
                </span>
                <span className="text-pio-sm" style={{ fontFamily: "var(--font-pio-mono)", fontWeight: 500, color: "var(--pio-ink)", textAlign: "left" }}>
                  {c.chain_b}:{c.residue_name_b}{c.residue_b}.{c.atom_b}
                </span>
                <span className="text-pio-sm" style={{ fontFamily: "var(--font-pio-mono)", fontWeight: 600, color: "var(--pio-ink)", textAlign: "left" }}>
                  {parseFloat(String(c.distance_angstrom)).toFixed(3)} Å
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 flex flex-col items-center gap-3 opacity-60">
            <ChainNodeIcon size={40} color="var(--pio-line-strong)" />
            <p className="text-pio-md" style={{ color: "var(--pio-graphite)" }}>No close contacts detected.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Compare ──────────────────────────────────────────────────────────────

function DeltaBadge({ value, unit = "" }: { value: number; unit?: string }) {
  const sign = value > 0 ? "+" : "";
  const color =
    value > 0 ? "var(--pio-active)" : value < 0 ? "var(--pio-coral)" : "var(--pio-graphite)";
  return (
    <span style={{ color, fontFamily: "var(--font-pio-mono)", fontSize: "var(--text-pio-xs)", fontWeight: 600 }}>
      {sign}{value.toLocaleString()}{unit}
    </span>
  );
}

const DIFF_CHIP_BASE: React.CSSProperties = {
  borderRadius: 999,
  fontWeight: 500,
  display: "inline-block",
  whiteSpace: "nowrap",
  fontFamily: "var(--font-pio-mono)",
  fontSize: "var(--text-pio-2xs)",
  padding: "2px 8px",
};

const DIFF_PAGE_SIZE = 10;

function ContactDiffTable({ rows, emptyLabel }: { rows: ContactDifference[]; emptyLabel: string }) {
  const [page, setPage] = useState(0);

  if (rows.length === 0) {
    return <p className="py-3 text-center text-pio-3xs text-[var(--pio-graphite)] opacity-50">{emptyLabel}</p>;
  }

  const totalPages = Math.ceil(rows.length / DIFF_PAGE_SIZE);
  const pageRows = rows.slice(page * DIFF_PAGE_SIZE, (page + 1) * DIFF_PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--pio-line)]">
              <th className="py-1.5 pr-3 text-pio-xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">Contact</th>
              <th className="py-1.5 pr-3 text-pio-xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">Type</th>
              <th className="py-1.5 text-pio-xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">Dist A / B</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={page * DIFF_PAGE_SIZE + i} className="border-b border-[var(--pio-line)] last:border-0">
                <td className="py-2 pr-3 text-pio-xs text-[var(--pio-ink)] font-[family-name:var(--font-pio-mono)]">{r.label}</td>
                <td className="py-2 pr-3">
                  <span style={{ ...DIFF_CHIP_BASE, ...contactChipStyle(r.contact_type) }}>
                    {r.contact_type}
                  </span>
                </td>
                <td className="py-2 text-pio-3xs font-[family-name:var(--font-pio-mono)] text-[var(--pio-graphite)]">
                  {r.distance_a_angstrom != null ? r.distance_a_angstrom.toFixed(2) : "—"}
                  {" / "}
                  {r.distance_b_angstrom != null ? r.distance_b_angstrom.toFixed(2) : "—"} Å
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-between border-t border-[var(--pio-line)] pt-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-[8px] px-2.5 py-1 text-pio-3xs font-semibold text-[var(--pio-graphite)] hover:bg-[var(--pio-paper)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-pio-3xs text-[var(--pio-graphite)] opacity-60">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-[8px] px-2.5 py-1 text-pio-3xs font-semibold text-[var(--pio-graphite)] hover:bg-[var(--pio-paper)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function compareDisplayLabel(e: StructureEntry) {
  return e.pdbId || e.uniprotId || e.name || "Untitled";
}

function CompareTab() {
  const {
    comparison, compareIsLoading, compareError, compareIds, structures,
    setCompareId, setComparison, setCompareLoading, setContextTab,
  } = useWorkspace();
  const [diffTab, setDiffTab] = useState<"shared" | "gained" | "lost">("shared");
  const [openSlot, setOpenSlot] = useState<0 | 1 | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const entA = structures.find((s) => s.id === compareIds[0]);
  const entB = structures.find((s) => s.id === compareIds[1]);

  // Close dropdown on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenSlot(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Default the compare pair to the two most-recently-loaded structures whenever the
  // current selection isn't a valid, distinct, loaded pair — so Compare works as soon
  // as two structures are present, without needing manual pill selection.
  useEffect(() => {
    const loaded = structures.filter((s) => s.structureText && !s.isAnalyzing);
    if (loaded.length < 2) return;
    const isValid = (id: string | null) => !!id && loaded.some((s) => s.id === id);
    if (!isValid(compareIds[0]) || !isValid(compareIds[1]) || compareIds[0] === compareIds[1]) {
      const [a, b] = loaded.slice(-2);
      setCompareId(0, a.id);
      setCompareId(1, b.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structures, compareIds]);

  // Auto-run the comparison once both selected structures have loaded. Retries when
  // structure text finishes downloading; each distinct pair runs at most once.
  const lastRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!entA?.structureText || !entB?.structureText || entA.id === entB.id) return;
    const key = `${entA.id}::${entB.id}`;
    if (lastRunRef.current === key) return;
    lastRunRef.current = key;
    void runCompareWith(entA.id, entB.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entA?.id, entB?.id, entA?.structureText, entB?.structureText]);

  async function runCompareWith(idA: string | null, idB: string | null) {
    const a = structures.find((s) => s.id === idA);
    const b = structures.find((s) => s.id === idB);
    if (!a || !b || idA === idB) return;
    if (!a.structureText || !b.structureText) {
      setComparison(null, "Structure data is still loading — please wait a moment and try again.");
      return;
    }
    setCompareLoading(true);
    setContextTab("compare");
    const ext = (e: StructureEntry) => e.structureFormat === "cif" ? ".cif" : ".pdb";
    const toFile = (e: StructureEntry) =>
      new File([e.structureText!], `${compareDisplayLabel(e)}${ext(e)}`, { type: "text/plain" });
    const fd = new FormData();
    fd.append("file_a", toFile(a));
    fd.append("file_b", toFile(b));
    fd.append("cutoff_angstrom", String(Math.max(a.cutoff ?? 4, b.cutoff ?? 4)));
    try {
      const res = await fetch(buildApiUrl("/api/compare"), { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { detail?: string } | null;
        throw new Error(body?.detail ?? `Compare failed (${res.status})`);
      }
      setComparison(await res.json());
    } catch (e) {
      setComparison(null, e instanceof Error ? e.message : "Comparison failed");
    }
  }

  function handleSlotSelect(slot: 0 | 1, id: string) {
    setOpenSlot(null);
    setCompareId(slot, id);
    // The auto-run effect fires the comparison once both slots reference loaded
    // structures — no need to trigger it here.
  }

  function handleSlotClear(slot: 0 | 1) {
    setOpenSlot(null);
    setCompareId(slot, null);
  }

  // ── Pill header — always visible when ≥2 structures ──────────────────────
  function pillHeader() {
    const labelA = entA ? compareDisplayLabel(entA) : "—";
    const labelB = entB ? compareDisplayLabel(entB) : "—";

    function Pill({ slot, label, ent }: { slot: 0 | 1; label: string; ent: StructureEntry | undefined }) {
      const isOpen = openSlot === slot;
      return (
        <div className="relative min-w-0 flex-1" ref={isOpen ? dropdownRef : undefined}>
          {/* Single pill button — equal width regardless of loaded state */}
          <motion.button
            type="button"
            onClick={() => setOpenSlot(isOpen ? null : slot)}
            whileTap={{ scale: 0.95 }}
            transition={spring.press}
            className="group relative flex w-full min-w-0 items-center gap-1 rounded-[8px] bg-[var(--pio-sky)] px-3 py-1 text-pio-sm font-bold text-[var(--pio-highlight)] transition-colors hover:brightness-95"
          >
            <span className="truncate">{label}</span>
            {/* Trailing icon area: fixed 18×18 box so width never shifts */}
            <span className="relative ml-auto h-[18px] w-[18px] shrink-0">
              {/* Chevron — fades out on hover when a structure is loaded */}
              <ChevronRight
                size={11}
                className={[
                  "absolute inset-0 m-auto transition-opacity",
                  ent ? "group-hover:opacity-0" : "",
                  isOpen ? "rotate-90" : "rotate-0",
                ].join(" ")}
              />
              {/* X — fades in on hover, only when a structure is loaded */}
              {ent && (
                <span
                  role="button"
                  aria-label={`Remove structure ${slot === 0 ? "A" : "B"}`}
                  className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); handleSlotClear(slot); }}
                >
                  <X size={10} />
                </span>
              )}
            </span>
          </motion.button>
          {isOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-[10px] border border-[var(--pio-line)] bg-[var(--pio-white)] shadow-[0_4px_16px_rgba(17,22,16,0.12)]">
              {structures.map((s) => {
                const isCurrent = compareIds[slot] === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSlotSelect(slot, s.id)}
                    className={[
                      "flex w-full items-center px-3 py-2 text-left text-pio-xs font-semibold transition-colors",
                      isCurrent
                        ? "bg-[var(--pio-sky)] text-[var(--pio-highlight)]"
                        : "text-[var(--pio-ink)] hover:bg-[var(--pio-paper)]",
                    ].join(" ")}
                  >
                    {compareDisplayLabel(s)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Pill slot={0} label={labelA} ent={entA} />
        <GitCompare size={14} className="shrink-0 text-[var(--pio-graphite)] opacity-40" />
        <Pill slot={1} label={labelB} ent={entB} />
      </div>
    );
  }

  // ── Not enough structures ─────────────────────────────────────────────────
  if (structures.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--pio-sky)]">
            <span className="text-pio-sm font-bold text-[var(--pio-highlight)]">A</span>
          </div>
          <GitCompare size={16} className="text-[var(--pio-graphite)] opacity-30" />
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-[var(--pio-line-strong)] bg-[var(--pio-paper)]">
            <span className="text-pio-sm font-bold text-[var(--pio-graphite)] opacity-40">B</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-pio-xl font-bold leading-[1.15] tracking-[-0.01em] text-[var(--pio-ink)]">Load a second structure</p>
          <p className="text-pio-sm leading-relaxed text-[var(--pio-graphite)]">
            Use the <strong>Load another</strong> panel on the left to add a second structure, then run a comparison.
          </p>
        </div>
      </div>
    );
  }

  // ── No comparison result yet ──────────────────────────────────────────────
  if (!comparison && !compareIsLoading && !compareError) {
    return (
      <div className="flex flex-col gap-5">
        {pillHeader()}
        <div className="flex flex-col items-center justify-center gap-4 py-14 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--pio-sky)]">
            <GitCompare size={24} className="text-[var(--pio-highlight)]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-pio-xl font-bold leading-[1.15] tracking-[-0.01em] text-[var(--pio-ink)]">Ready to compare</p>
            <p className="text-pio-sm leading-relaxed text-[var(--pio-graphite)]">
              Select two structures using the pills above — comparison runs automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (compareIsLoading) {
    return (
      <div className="flex flex-col gap-5">
        {pillHeader()}
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 size={22} className="animate-spin text-[var(--pio-highlight)]" />
          <p className="text-pio-xs text-[var(--pio-graphite)]">Comparing structures…</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (compareError) {
    return (
      <div className="flex flex-col gap-4">
        {pillHeader()}
        <div className="flex items-start gap-2.5 rounded-[10px] bg-[var(--pio-coral-pale)] p-4">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--pio-coral-deep)]" />
          <div>
            <p className="text-pio-xs font-semibold text-[var(--pio-coral-deep)]">Comparison failed</p>
            <p className="mt-1 text-pio-3xs text-[var(--pio-coral-deep)] opacity-80">{compareError}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────
  const { delta, contacts, tm_align, lddt, lddt_pli, dockq } = comparison!;
  const DELTA_ROWS: Array<{ label: string; value: number }> = [
    { label: "Residues", value: delta.residue_count_delta },
    { label: "Chains",   value: delta.chain_count_delta },
    { label: "Ligands",  value: delta.ligand_count_delta },
    { label: "Contacts", value: delta.contact_count_delta },
    { label: "Atoms",    value: delta.atom_count_delta },
  ];
  const DIFF_TABS: Array<{ id: "shared" | "gained" | "lost"; label: string; count: number }> = [
    { id: "shared", label: "Shared",  count: contacts.shared_contact_count },
    { id: "gained", label: "Gained",  count: contacts.gained_contact_count },
    { id: "lost",   label: "Lost",    count: contacts.lost_contact_count },
  ];
  const diffRows =
    diffTab === "shared" ? contacts.shared_contacts :
    diffTab === "gained" ? contacts.gained_contacts :
    contacts.lost_contacts;

  function tmAlignPanel() {
    if (!tm_align && !lddt && !lddt_pli) return null;
    const tmScore = tm_align ? Math.max(tm_align.tm_score_query, tm_align.tm_score_target) : 0;
    const similarity =
      tmScore >= 0.7 ? { label: "Highly similar", color: "var(--pio-green-deep)" } :
      tmScore >= 0.5 ? { label: "Similar fold",   color: "var(--pio-highlight)" } :
      tmScore >= 0.3 ? { label: "Partial similarity", color: "var(--pio-graphite)" } :
                       { label: "Low similarity", color: "var(--pio-graphite)" };
    const lddtInfo = lddt && (
      lddt.lddt >= 0.8 ? { label: "High agreement", color: "var(--pio-green-deep)" } :
      lddt.lddt >= 0.6 ? { label: "Good agreement", color: "var(--pio-highlight)" } :
      lddt.lddt >= 0.4 ? { label: "Partial agreement", color: "var(--pio-graphite)" } :
                         { label: "Low agreement", color: "var(--pio-graphite)" }
    );
    return (
      <div>
        <p className="mb-2 text-pio-xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">
          Structural alignment
        </p>
        {tm_align && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[12px] bg-[var(--pio-lavender-pale)] px-4 py-3">
              <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-lavender-deep)] opacity-70 mb-1">TM-score</p>
              <p className="font-[family-name:var(--font-pio-mono)] text-pio-2xl font-bold text-[var(--pio-ink)] leading-none">
                {tmScore.toFixed(3)}
              </p>
              <p className="mt-1.5 text-pio-2xs font-semibold" style={{ color: similarity.color }}>
                {similarity.label}
              </p>
            </div>
            <div className="rounded-[12px] bg-[var(--pio-lavender-pale)] px-4 py-3">
              <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-lavender-deep)] opacity-70 mb-1">RMSD</p>
              <p className="font-[family-name:var(--font-pio-mono)] text-pio-2xl font-bold text-[var(--pio-ink)] leading-none">
                {tm_align.rmsd.toFixed(2)} Å
              </p>
              <p className="mt-1.5 text-pio-2xs text-[var(--pio-graphite)] opacity-60">
                aligned residues
              </p>
            </div>
          </div>
        )}
        {lddt && lddtInfo && (
          <div className="mt-2 flex items-center justify-between rounded-[12px] bg-[var(--pio-lavender-pale)] px-4 py-3">
            <div>
              <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-lavender-deep)] opacity-70 mb-1">lDDT · A vs B</p>
              <p className="font-[family-name:var(--font-pio-mono)] text-pio-2xl font-bold text-[var(--pio-ink)] leading-none">
                {lddt.lddt.toFixed(3)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-pio-2xs font-semibold" style={{ color: lddtInfo.color }}>{lddtInfo.label}</p>
              <p className="mt-1 text-pio-2xs text-[var(--pio-graphite)] opacity-60">{lddt.residue_count} residues matched</p>
            </div>
          </div>
        )}
        {lddt_pli && (
          <div className="mt-2 flex items-center justify-between rounded-[12px] bg-[var(--pio-lavender-pale)] px-4 py-3">
            <div>
              <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-lavender-deep)] opacity-70 mb-1">lDDT-PLI · ligand pose</p>
              <p className="font-[family-name:var(--font-pio-mono)] text-pio-2xl font-bold text-[var(--pio-ink)] leading-none">
                {lddt_pli.lddt_pli.toFixed(3)}
              </p>
            </div>
            <p className="text-right text-pio-2xs text-[var(--pio-graphite)] opacity-60">
              {lddt_pli.contact_count.toLocaleString()} protein–ligand<br />contacts · {lddt_pli.ligand_atom_count} ligand atoms
            </p>
          </div>
        )}
        {tm_align && (
          <p className="mt-1.5 text-pio-2xs text-[var(--pio-graphite)] opacity-50">
            Query {tm_align.query_length} res · Target {tm_align.target_length} res ·{" "}
            TM<sub>Q</sub> {tm_align.tm_score_query.toFixed(3)} · TM<sub>T</sub> {tm_align.tm_score_target.toFixed(3)}
          </p>
        )}
      </div>
    );
  }

  function dockqPanel() {
    if (!dockq) return null;
    const q =
      dockq.quality === "high"       ? { cls: "pio-badge-active",   label: "High quality" } :
      dockq.quality === "medium"     ? { cls: "pio-badge-metadata", label: "Medium quality" } :
      dockq.quality === "acceptable" ? { cls: "pio-badge-caution",  label: "Acceptable" } :
                                       { cls: "pio-badge-warning",  label: "Incorrect" };
    const metrics = [
      { label: "Fnat",  value: dockq.fnat.toFixed(2) },
      { label: "iRMSD", value: `${dockq.irmsd.toFixed(2)} Å` },
      { label: "LRMSD", value: `${dockq.lrmsd.toFixed(2)} Å` },
    ];
    return (
      <div>
        <p className="mb-2 text-pio-xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">
          Complex quality (DockQ)
        </p>
        <div className="rounded-[12px] bg-[var(--pio-lavender-pale)] px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-lavender-deep)] opacity-70 mb-1">
                DockQ · chains {dockq.chain_a}–{dockq.chain_b}
              </p>
              <p className="font-[family-name:var(--font-pio-mono)] text-pio-2xl font-bold text-[var(--pio-ink)] leading-none">
                {dockq.dockq.toFixed(3)}
              </p>
            </div>
            <span className={`pio-badge ${q.cls} text-pio-xs`}>{q.label}</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {metrics.map((m) => (
              <div key={m.label}>
                <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] mb-0.5">{m.label}</p>
                <p className="font-[family-name:var(--font-pio-mono)] text-pio-sm font-bold text-[var(--pio-ink)]">{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function exportRow() {
    const labelA = entA ? compareDisplayLabel(entA) : "A";
    const labelB = entB ? compareDisplayLabel(entB) : "B";
    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        transition={spring.press}
        onClick={() => downloadComparisonReportPdf(comparison!, labelA, labelB)}
        className="w-full flex items-center justify-center gap-1.5 rounded-[12px] px-3 py-2.5 text-pio-xs font-semibold bg-[var(--pio-sky)] text-[var(--pio-highlight)] hover:bg-[var(--pio-highlight)] hover:text-[var(--pio-highlight-text)] transition-colors cursor-pointer"
      >
        <Download size={12} />
        Download PDF report
      </motion.button>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="pio-section-title">Compare</h2>
        <p className="pio-section-copy mt-1">
          Two structures side by side — structural alignment (TM-score, RMSD), per-metric deltas,
          and shared / gained / lost contacts.
        </p>
      </div>
      {pillHeader()}
      {exportRow()}
      {dockqPanel()}
      {tmAlignPanel()}

      {/* Delta summary */}
      <div>
        <p className="mb-2 text-pio-xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">Delta (B − A)</p>
        <div className="rounded-[10px] border border-[var(--pio-line)] overflow-hidden">
          {DELTA_ROWS.map((row, i) => (
            <div
              key={row.label}
              className={["flex items-center justify-between px-3 py-2", i % 2 === 0 ? "bg-[var(--pio-paper)]" : "bg-transparent"].join(" ")}
            >
              <span className="text-pio-xs text-[var(--pio-graphite)]">{row.label}</span>
              <DeltaBadge value={row.value} />
            </div>
          ))}
        </div>
      </div>

      {/* Contact diff tabs */}
      <div>
        <p className="mb-2 text-pio-xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">Contacts</p>
        <div className="flex gap-1 rounded-[12px] border border-[var(--pio-line)] bg-[var(--pio-paper)] p-1 mb-3">
          {DIFF_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDiffTab(t.id)}
              className={[
                "flex-1 rounded-[8px] py-[5px] text-pio-xs font-semibold transition-colors flex items-center justify-center gap-1",
                diffTab === t.id
                  ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)]"
                  : "text-[var(--pio-blue-deep)] opacity-60 hover:opacity-100",
              ].join(" ")}
            >
              {t.label}
              <span className={["rounded-full px-1.5 py-0 text-[10px] font-bold", diffTab === t.id ? "bg-white/20" : "bg-[var(--pio-line)]"].join(" ")}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <ContactDiffTable
          key={diffTab}
          rows={diffRows}
          emptyLabel={diffTab === "shared" ? "No shared contacts" : diffTab === "gained" ? "No gained contacts" : "No lost contacts"}
        />
      </div>
    </div>
  );
}

// ── Tab: Methods ──────────────────────────────────────────────────────────────

function MethodsTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  if (!analysis) return null;
  const meta = analysis.metadata;
  const hasWarnings = (analysis.warnings?.length ?? 0) > 0;

  const sourceId = meta?.pdb_id ?? meta?.uniprot_id ?? (entry.source === "upload" ? entry.name || "uploaded structure" : entry.name);
  const structureKind = meta?.source === "alphafold" || analysis.confidence ? "Predicted" : meta?.source === "rcsb" ? "Experimental" : "Uploaded coordinates";
  const analyzedAt = entry.savedAt
    ? new Date(entry.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

  type CardDef = { label: string; value: string; mono?: boolean; fullWidth?: boolean };
  const cards: CardDef[] = [
    { label: "INPUT SOURCE",    value: entry.source.charAt(0).toUpperCase() + entry.source.slice(1) || "N/A" },
    { label: "SOURCE ID",       value: sourceId || "N/A", mono: true },
    { label: "FORMAT",          value: entry.structureFormat === "cif" ? "mmCIF" : "PDB" },
    { label: "CUTOFF",          value: `${entry.cutoff} Å`, mono: true },
    { label: "STRUCTURE TYPE",  value: structureKind || "N/A" },
    { label: "PAE SIDECAR",     value: analysis.pae ? "Provided" : "Not provided" },
    { label: "ANALYZED",        value: analyzedAt || "N/A", fullWidth: true },
    { label: "PARSER",          value: "Gemmi via backend parser", fullWidth: true },
    { label: "CONTACT METHOD",  value: "Distance-based heavy-atom contacts using Gemmi NeighborSearch", fullWidth: true },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="pio-section-title">Methods And Provenance</h2>
        <p className="pio-section-copy mt-1">
          Reproducibility details for the current analysis — how contacts, ligand summaries, confidence warnings, and quality checks were generated.
        </p>
        <p className="pio-section-copy mt-1">
          Analysis generated with Gemmi parsing and distance-based contact search.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
        {cards.map((card) => (
          <div key={card.label} style={{ background: "var(--pio-paper)", borderRadius: 12, padding: "12px 14px", overflow: "hidden", gridColumn: card.fullWidth ? "1 / -1" : undefined }}>
            <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">{card.label}</p>
            <p className="text-pio-sm mt-1.5 leading-[1.4] text-[var(--pio-ink)]" style={{ fontFamily: card.mono ? "var(--font-pio-mono)" : "inherit", fontWeight: 500 }}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Confidence scoring key */}
      <div style={{ background: "var(--pio-paper)", borderRadius: 12, padding: "12px 14px" }}>
        <p className="text-pio-xs" style={{ fontWeight: 600, letterSpacing: "0.07em", color: "var(--pio-graphite)", marginBottom: 8 }}>CONTACT TRUST LABELS</p>
        <p className="text-pio-sm" style={{ color: "var(--pio-graphite)", lineHeight: 1.6 }}>
          Assigned based on pLDDT scores of both partner residues.{" "}
          <strong style={{ color: "var(--pio-ink)" }}>High confidence</strong>: both ≥70 pLDDT ·{" "}
          <strong style={{ color: "var(--pio-ink)" }}>Inspect manually</strong>: one residue 50–70 ·{" "}
          <strong style={{ color: "var(--pio-ink)" }}>Low confidence</strong>: either residue &lt;50 ·{" "}
          <strong style={{ color: "var(--pio-ink)" }}>Possible clash</strong>: distance &lt;2.0 Å
        </p>
      </div>

      {/* Warnings banner */}
      <div style={{ background: hasWarnings ? "var(--pio-quality-amber-bg)" : "var(--pio-quality-green-bg)", border: `1px solid ${hasWarnings ? "var(--pio-quality-amber-border)" : "var(--pio-quality-green-border)"}`, borderRadius: 10, padding: "12px 14px" }}>
        <p className="text-pio-3xs" style={{ fontWeight: 600, letterSpacing: "0.07em", color: hasWarnings ? "var(--pio-quality-amber-fg)" : "var(--pio-quality-green-fg)" }}>
          RECORDED WARNINGS
        </p>
        {hasWarnings ? (
          <ul style={{ marginTop: 6, paddingLeft: 16 }}>
            {analysis.warnings.map((w) => (
              <li key={w} className="text-pio-sm" style={{ color: "var(--pio-quality-amber-fg-soft)", lineHeight: 1.5 }}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="text-pio-sm" style={{ color: "var(--pio-quality-green-fg-soft)", lineHeight: 1.5, marginTop: 6 }}>
            No parser, contact, confidence, or PAE warnings were recorded for this analysis.
          </p>
        )}
      </div>

      {/* Citable, versioned methods report */}
      <div style={{ background: "var(--pio-paper)", borderRadius: 12, padding: "12px 14px" }}>
        <p className="text-pio-xs" style={{ fontWeight: 600, letterSpacing: "0.07em", color: "var(--pio-graphite)", marginBottom: 8 }}>METHODS REPORT</p>
        <p className="text-pio-sm" style={{ color: "var(--pio-graphite)", lineHeight: 1.6, marginBottom: 10 }}>
          A citable Markdown report of every method used for this analysis, with tool versions and literature references.
        </p>
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          transition={spring.press}
          onClick={() => void downloadMethodsReport(entry, analysis, buildApiUrl("/api/versions"), `${safeFilename(sourceId)}-methods.md`)}
          className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-pio-xs font-semibold bg-[var(--pio-sky)] text-[var(--pio-highlight)] hover:bg-[var(--pio-highlight)] hover:text-[var(--pio-highlight-text)] transition-colors cursor-pointer"
        >
          <Download size={12} />
          Methods report (.md)
        </motion.button>
      </div>

      {/* Session export — take the review into PyMOL / ChimeraX */}
      <div style={{ background: "var(--pio-paper)", borderRadius: 12, padding: "12px 14px" }}>
        <p className="text-pio-xs" style={{ fontWeight: 600, letterSpacing: "0.07em", color: "var(--pio-graphite)", marginBottom: 8 }}>OPEN IN YOUR TOOL</p>
        <p className="text-pio-sm" style={{ color: "var(--pio-graphite)", lineHeight: 1.6, marginBottom: 10 }}>
          A script that loads this structure and recreates the pLDDT colouring, ligands, pockets, CDRs, and interface residues as named selections.
        </p>
        <div className="flex flex-wrap gap-2">
          {([
            { label: "PyMOL (.pml)", build: buildPymolScript, ext: "pml" },
            { label: "ChimeraX (.cxc)", build: buildChimeraxScript, ext: "cxc" },
          ] as const).map((opt) => (
            <motion.button
              key={opt.ext}
              type="button"
              whileTap={{ scale: 0.96 }}
              transition={spring.press}
              onClick={() => downloadSessionScript(opt.build(entry, analysis), `${safeFilename(sourceId)}-proteinio.${opt.ext}`)}
              className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-pio-xs font-semibold bg-[var(--pio-sky)] text-[var(--pio-highlight)] hover:bg-[var(--pio-highlight)] hover:text-[var(--pio-highlight-text)] transition-colors cursor-pointer"
            >
              <Download size={12} />
              {opt.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Data & privacy */}
      <div style={{ background: "var(--pio-paper)", borderRadius: 12, padding: "12px 14px" }}>
        <p className="text-pio-xs" style={{ fontWeight: 600, letterSpacing: "0.07em", color: "var(--pio-graphite)", marginBottom: 8 }}>DATA &amp; PRIVACY</p>
        <p className="text-pio-sm" style={{ color: "var(--pio-graphite)", lineHeight: 1.6 }}>
          Metrics are computed on CPU with no models run. The backend is stateless — it analyses and
          returns, storing nothing. Results are cached only in your browser. On this hosted site your
          structure is sent to the backend to be analysed; run the backend locally to keep data entirely
          on your machine.
        </p>
      </div>
    </div>
  );
}

function safeFilename(s: string): string {
  return (s || "structure").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "structure";
}

// ── SimilarTab ───────────────────────────────────────────────────────────────

function DatabaseBadge({ db }: { db: string }) {
  const isPdb = db.toLowerCase().includes("pdb");
  return (
    <span
      className={[
        "inline-flex items-center rounded-[6px] px-1.5 py-0.5 text-pio-3xs font-semibold uppercase tracking-wide",
        isPdb
          ? "bg-[var(--pio-sky-pale)] text-[var(--pio-highlight)]"
          : "bg-[var(--pio-lavender-pale)] text-[var(--pio-lavender-deep)]",
      ].join(" ")}
    >
      {isPdb ? "PDB" : "AlphaFold"}
    </span>
  );
}

function HitTile({ hit, isSelected, onLoad }: { hit: FoldseekHit; isSelected: boolean; onLoad: () => void }) {
  const [loading, setLoading] = useState(false);
  const label = hit.pdb_id
    ? `${hit.pdb_id.toUpperCase()}${hit.chain ? `:${hit.chain}` : ""}`
    : hit.uniprot_id ?? hit.target;
  const canLoad = !!(hit.pdb_id || hit.uniprot_id);

  async function handleClick() {
    if (loading || !canLoad) return;
    setLoading(true);
    try {
      await onLoad();
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      variants={listItem}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
      whileHover={!isSelected ? { y: -2 } : undefined}
      whileTap={{ scale: 0.98 }}
      transition={spring.snappy}
      className="rounded-[14px] p-4 transition-colors cursor-pointer"
      style={{
        border: `2px solid ${isSelected ? "var(--pio-highlight)" : "transparent"}`,
        background: isSelected ? "var(--pio-row-selection-bg)" : "var(--pio-paper)",
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-[family-name:var(--font-pio-mono)] text-pio-base font-bold text-[var(--pio-ink)]">
            #{hit.rank} {label}
          </span>
          <DatabaseBadge db={hit.database} />
        </div>
        {canLoad && (
          <motion.button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClick(); }}
            disabled={loading}
            whileTap={{ scale: 0.90 }}
            transition={spring.press}
            className={[
              "shrink-0 flex items-center gap-1 rounded-[8px] px-2.5 py-1 text-pio-xs font-semibold transition-colors cursor-pointer disabled:opacity-50",
              isSelected
                ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)]"
                : "bg-[var(--pio-sky)] text-[var(--pio-highlight)] hover:bg-[var(--pio-highlight)] hover:text-[var(--pio-highlight-text)]",
            ].join(" ")}
          >
            {loading && <Loader2 size={11} className="animate-spin" />}
            {loading ? "Loading…" : "Load"}
          </motion.button>
        )}
      </div>

      {/* Title + organism */}
      {hit.title && (
        <p className="text-pio-xs text-[var(--pio-graphite)] leading-snug line-clamp-2 mb-1">{hit.title}</p>
      )}
      {hit.organism && (
        <p className="text-pio-2xs italic text-[var(--pio-graphite)] opacity-70 mb-2">{hit.organism}</p>
      )}

      {/* Stats row */}
      <div className="flex gap-4 flex-wrap mt-1">
        {hit.tmscore != null && (
          <span className="text-pio-2xs text-[var(--pio-graphite)]">
            TM-score <span className="font-semibold text-[var(--pio-ink)]">{hit.tmscore.toFixed(3)}</span>
          </span>
        )}
        {hit.seq_identity != null && (
          <span className="text-pio-2xs text-[var(--pio-graphite)]">
            Seq ID <span className="font-semibold text-[var(--pio-ink)]">{(hit.seq_identity * 100).toFixed(1)}%</span>
          </span>
        )}
        {hit.evalue != null && (
          <span className="text-pio-2xs text-[var(--pio-graphite)]">
            E-value <span className="font-semibold text-[var(--pio-ink)]">{hit.evalue.toExponential(2)}</span>
          </span>
        )}
      </div>
    </motion.div>
  );
}

function SimilarTab({ entry }: { entry: StructureEntry }) {
  const { updateStructure, addStructure, setActiveId, setCompareId, setContextTab } = useWorkspace();

  function hitKey(hit: FoldseekHit) {
    return `${hit.database}-${hit.rank}-${hit.target}`;
  }

  async function loadHit(hit: FoldseekHit) {
    setSelectedHitKey(hitKey(hit));
    const isAfdb = !!(hit.uniprot_id && !hit.pdb_id);
    const accession = isAfdb ? hit.uniprot_id! : hit.pdb_id!;
    const source = isAfdb ? "alphafold" : "rcsb";
    const entryId = addStructure({
      name: accession,
      source,
      pdbId: isAfdb ? "" : accession,
      uniprotId: isAfdb ? accession : "",
      structureText: "",
      structureFormat: "cif",
      cutoff: 4.0,
      analysis: null,
      foldseekResult: null,
      isAnalyzing: true,
      error: null,
    });
    setActiveId(entryId);

    // Pre-wire compare slots so Compare tab reflects the right pair
    setCompareId(0, entry.id);
    setCompareId(1, entryId);

    const path = isAfdb
      ? `/api/alphafold/${encodeURIComponent(accession)}/analyze?cutoff_angstrom=4`
      : `/api/rcsb/${encodeURIComponent(accession)}/analyze?cutoff_angstrom=4`;
    const res = await fetch(buildApiUrl(path));
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: string } | null;
      updateStructure(entryId, { isAnalyzing: false, error: body?.detail ?? `Fetch failed (${res.status})` });
      return;
    }
    const payload = (await res.json()) as RcsbAnalysisResponse;
    updateStructure(entryId, {
      structureText: payload.structure_text,
      structureFormat: payload.structure_format,
      analysis: payload.analysis,
      isAnalyzing: false,
    });

    // Compare runs automatically on the Compare tab once both structures are loaded.
    setContextTab("compare");
  }

  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedHitKey, setSelectedHitKey] = useState<string | null>(null);
  const result = entry.foldseekResult as FoldseekSearchResult | null;

  async function runSearch() {
    if (!entry.structureText || isSearching) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const blob = new Blob([entry.structureText], { type: "text/plain" });
      const filename = entry.name.endsWith(".cif") || entry.name.endsWith(".pdb")
        ? entry.name
        : `${entry.name}.cif`;
      const fd = new FormData();
      fd.append("file", blob, filename);
      const res = await fetch(buildApiUrl("/api/foldseek/search"), { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `Search failed (${res.status})`);
      }
      const data = (await res.json()) as FoldseekSearchResult;
      updateStructure(entry.id, { foldseekResult: data });
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-pio-xl font-bold text-[var(--pio-ink)]">Structural similarity</h3>
        <p className="text-pio-xs text-[var(--pio-graphite)] leading-relaxed">
          Search PDB and AlphaFold DB for structurally similar proteins using Foldseek (3Di+AA mode). Results are ranked by TM-score.
        </p>
      </div>

      {!result && !isSearching && (
        <button
          type="button"
          className="w-full rounded-[12px] py-2.5 text-pio-base font-semibold bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)] hover:opacity-90 transition-opacity cursor-pointer"
          onClick={runSearch}
        >
          Find similar structures
        </button>
      )}

      {isSearching && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 size={24} className="animate-spin text-[var(--pio-highlight)]" />
          <p className="text-pio-xs text-[var(--pio-graphite)]">Searching PDB + AlphaFold DB…</p>
          <p className="text-pio-2xs text-[var(--pio-graphite)] opacity-60">This usually takes 10–30 seconds</p>
        </div>
      )}

      {searchError && (
        <div className="rounded-[10px] border border-[var(--pio-coral)] bg-[var(--pio-coral-pale)] p-4">
          <p className="text-pio-xs font-semibold text-[var(--pio-coral-deep)] mb-1">Search failed</p>
          <p className="text-pio-3xs text-[var(--pio-coral-deep)]">{searchError}</p>
          <button
            type="button"
            className="mt-3 text-pio-xs font-semibold text-[var(--pio-highlight)] hover:underline cursor-pointer"
            onClick={runSearch}
          >
            Retry
          </button>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-pio-xs font-semibold text-[var(--pio-graphite)]">
              {result.hits.length} hits
              {Object.keys(result.database_counts).length > 0 && (
                <span className="ml-2 font-normal opacity-70">
                  ({Object.entries(result.database_counts).map(([db, n]) => `${n} ${db}`).join(", ")})
                </span>
              )}
            </p>
            <button
              type="button"
              className="text-pio-2xs font-semibold text-[var(--pio-highlight)] hover:underline cursor-pointer"
              onClick={runSearch}
            >
              Re-search
            </button>
          </div>

          {result.hits.length === 0 ? (
            <p className="text-pio-xs text-[var(--pio-graphite)] opacity-60 py-6 text-center">
              No similar structures found.
            </p>
          ) : (
            <motion.div
              className="flex flex-col gap-2"
              initial="hidden"
              animate="show"
              variants={stagger}
            >
              {result.hits.map((hit) => (
                <HitTile
                  key={hitKey(hit)}
                  hit={hit}
                  isSelected={selectedHitKey === hitKey(hit)}
                  onLoad={() => loadHit(hit)}
                />
              ))}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab definition ────────────────────────────────────────────────────────────

type TabDef = {
  id: ContextTab;
  label: string;
  count?: (a: AnalysisResponse) => number | null;
  visible?: (a: AnalysisResponse | null) => boolean;
};

// ── Tab: Sequence (secondary structure + pLDDT + domains) ──────────────────────

const SS_COLORS: Record<SSType, string> = {
  helix: "#c0533a", // coral
  sheet: "#3b6fa0", // steel blue
  coil: "#9aa0a6",  // gray
};

// AlphaFold pLDDT colour bands (the standard, recognisable scale).
function plddtHex(p: number): string {
  if (p >= 90) return "#0053d6";
  if (p >= 70) return "#65cbf3";
  if (p >= 50) return "#ffdb13";
  return "#ff7d45";
}

function ChainTrack({ chain, plddtByKey }: { chain: ChainSecondaryStructure; plddtByKey: Map<string, number> }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const residues = chain.residues;
  const n = residues.length;
  const W = 600, SS_H = 12, GAP = 3, PL_H = 8;
  const H = SS_H + GAP + PL_H;
  const hasPlddt = residues.some((r) => plddtByKey.has(`${chain.chain_id}:${r.residue_number}`));

  useEffect(() => {
    const cv = ref.current;
    if (!cv || n === 0) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const cw = W / n;
    residues.forEach((r, i) => {
      const x = i * cw;
      const w = Math.ceil(cw) + 0.5;
      ctx.fillStyle = SS_COLORS[r.ss];
      if (r.ss === "coil") ctx.fillRect(x, SS_H / 2 - 1, w, 2);
      else ctx.fillRect(x, 0, w, SS_H);
      const p = plddtByKey.get(`${chain.chain_id}:${r.residue_number}`);
      if (p != null) {
        ctx.fillStyle = plddtHex(p);
        ctx.fillRect(x, SS_H + GAP, w, PL_H);
      }
    });
  }, [chain, plddtByKey, n, H]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">Chain {chain.chain_id}</span>
        <span className="text-pio-2xs text-[var(--pio-graphite)] opacity-60">{n} residues{hasPlddt ? " · SS + pLDDT" : " · SS"}</span>
      </div>
      <canvas ref={ref} className="w-full" style={{ aspectRatio: `${W} / ${H}` }} />
    </div>
  );
}

function SequenceTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  const plddtByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const rc of analysis?.residue_confidences ?? []) m.set(`${rc.chain_id}:${rc.residue_number}`, rc.plddt);
    return m;
  }, [analysis?.residue_confidences]);

  if (!analysis?.secondary_structure) return null;
  const ss = analysis.secondary_structure;
  const total = ss.summary.residue_count || 1;
  const bands = [
    { label: "Helix", count: ss.summary.helix_count, color: SS_COLORS.helix },
    { label: "Sheet", count: ss.summary.sheet_count, color: SS_COLORS.sheet },
    { label: "Coil", count: ss.summary.coil_count, color: SS_COLORS.coil },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="pio-section-title">Sequence &amp; secondary structure <MetricInfo metric="secondary_structure" /></h2>
        <p className="pio-section-copy mt-1">
          Geometric (Cα) secondary-structure estimate per chain, with the pLDDT confidence
          track beneath it. Helix / sheet / coil are assigned from backbone geometry (P-SEA).
        </p>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))" }}>
        {bands.map((b) => (
          <div key={b.label} className="rounded-[12px] bg-[var(--pio-paper)] px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: b.color }} />
              <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">{b.label}</p>
            </div>
            <p className="mt-1 font-[family-name:var(--font-pio-mono)] text-pio-2xl font-bold leading-none text-[var(--pio-ink)]">{Math.round((b.count / total) * 100)}%</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {ss.chains.map((c) => <ChainTrack key={c.chain_id} chain={c} plddtByKey={plddtByKey} />)}
      </div>

      {analysis.uniprot_annotations?.domains?.length ? (
        <div>
          <p className="mb-2 text-pio-xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">Domains (UniProt)</p>
          <div className="flex flex-col gap-1">
            {analysis.uniprot_annotations.domains.slice(0, 12).map((d, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-[8px] bg-[var(--pio-paper)] px-3 py-1.5">
                <span className="text-pio-xs text-[var(--pio-ink)] truncate">{d.description ?? "Domain"}</span>
                {d.start != null && d.end != null && (
                  <span className="shrink-0 font-[family-name:var(--font-pio-mono)] text-pio-2xs text-[var(--pio-graphite)]">{d.start}–{d.end}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Tab: Pockets ───────────────────────────────────────────────────────────────

function PocketCard({ p, isSelected, onSelect }: { p: Pocket; isSelected: boolean; onSelect: () => void }) {
  const drugPct = Math.round(p.druggability * 100);
  const lining = p.lining_residues.slice(0, 10);
  return (
    <motion.div
      variants={listItem}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      whileHover={!isSelected ? { y: -2 } : undefined}
      whileTap={{ scale: 0.98 }}
      transition={spring.snappy}
      className={[
        "rounded-[14px] p-4 transition-colors cursor-pointer",
        isSelected ? "" : "bg-[var(--pio-paper)] hover:bg-[var(--pio-sky)]",
      ].join(" ")}
      style={{
        border: `2px solid ${isSelected ? "var(--pio-highlight)" : "transparent"}`,
        background: isSelected ? "var(--pio-row-selection-bg)" : undefined,
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="pio-badge pio-badge-metadata text-pio-xs">Pocket #{p.rank}</span>
        <span className="font-[family-name:var(--font-pio-mono)] text-pio-md font-bold text-[var(--pio-ink)]">{p.volume_angstrom3.toLocaleString()} Å³</span>
        <span className="ml-auto text-pio-2xs text-[var(--pio-graphite)] opacity-60">{isSelected ? "highlighted" : "click to highlight"}</span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <p className="mb-1 text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">Druggability</p>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--pio-line)]">
              <div className="h-full rounded-full bg-[var(--pio-highlight)]" style={{ width: `${drugPct}%` }} />
            </div>
            <span className="font-[family-name:var(--font-pio-mono)] text-pio-xs text-[var(--pio-ink)]">{p.druggability.toFixed(2)}</span>
          </div>
        </div>
        <div>
          <p className="mb-1 text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">Enclosure</p>
          <p className="font-[family-name:var(--font-pio-mono)] text-pio-sm font-bold text-[var(--pio-ink)]">{p.mean_enclosure.toFixed(1)} / 7</p>
        </div>
      </div>
      <p className="mb-1.5 text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">Lining residues</p>
      <div className="flex flex-wrap gap-1">
        {lining.map((r) => (
          <span key={`${r.chain_id}-${r.residue_number}`} className="pio-badge pio-badge-neutral" style={{ fontFamily: "var(--font-pio-mono)", fontSize: "var(--text-pio-xs)" }}>
            {r.chain_id}:{r.residue_name}{r.residue_number}
          </span>
        ))}
        {p.lining_residues.length > lining.length && (
          <span className="pio-badge pio-badge-neutral" style={{ fontSize: "var(--text-pio-xs)" }}>+{p.lining_residues.length - lining.length}</span>
        )}
      </div>
    </motion.div>
  );
}

function PocketsTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  const { selection, setSelection } = useWorkspace();
  const pockets = analysis?.pockets ?? [];
  if (!pockets.length) {
    return <p className="text-pio-sm text-[var(--pio-graphite)] opacity-60">No binding pockets detected.</p>;
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="pio-section-title">Binding pockets <MetricInfo metric="druggability" /></h2>
        <p className="pio-section-copy mt-1">
          Geometric cavity estimate (LIGSITE-style grid) — volume, a druggability proxy, and
          the residues lining each pocket, ranked by size. Click a pocket to highlight its
          lining residues in 3D. A geometric estimate, not a validated site prediction.
        </p>
      </div>
      <motion.div className="flex flex-col gap-3" initial="hidden" animate="show" variants={stagger}>
        {pockets.map((p) => {
          const label = `Pocket #${p.rank}`;
          const isSelected = selection?.kind === "pocket" && selection.label === label;
          function toggle() {
            if (isSelected) {
              setSelection(null);
            } else {
              setSelection({
                kind: "pocket",
                label,
                residues: p.lining_residues.slice(0, 50).map((r) => ({
                  chainId: r.chain_id,
                  residueNumber: r.residue_number,
                  residueName: r.residue_name,
                })),
              });
            }
          }
          return <PocketCard key={p.rank} p={p} isSelected={isSelected} onSelect={toggle} />;
        })}
      </motion.div>
    </div>
  );
}

// ── Antibody tab ──────────────────────────────────────────────────────────────

function CdrCard({ cdr, chainId, isSelected, onSelect }: { cdr: AntibodyCdr; chainId: string; isSelected: boolean; onSelect: () => void }) {
  return (
    <motion.div
      variants={listItem}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      whileHover={!isSelected ? { y: -2 } : undefined}
      whileTap={{ scale: 0.98 }}
      transition={spring.snappy}
      className={["rounded-[12px] p-3 transition-colors cursor-pointer", isSelected ? "" : "bg-[var(--pio-paper)] hover:bg-[var(--pio-sky)]"].join(" ")}
      style={{
        border: `2px solid ${isSelected ? "var(--pio-highlight)" : "transparent"}`,
        background: isSelected ? "var(--pio-row-selection-bg)" : undefined,
      }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="pio-badge pio-badge-metadata text-pio-2xs">{cdr.name}</span>
        <span className="text-pio-2xs text-[var(--pio-graphite)]">{chainId}:{cdr.start}–{cdr.end} · {cdr.length} aa</span>
        {cdr.mean_plddt != null && (
          <span className="ml-auto font-[family-name:var(--font-pio-mono)] text-pio-2xs font-bold" style={{ color: plddtHex(cdr.mean_plddt) }}>
            pLDDT {cdr.mean_plddt.toFixed(0)}
          </span>
        )}
        <span className="text-pio-2xs text-[var(--pio-graphite)] opacity-60">{isSelected ? "highlighted" : "highlight"}</span>
      </div>
      <p className="break-all font-[family-name:var(--font-pio-mono)] text-pio-xs text-[var(--pio-ink)]">{cdr.sequence}</p>
    </motion.div>
  );
}

function AntibodyTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  const { selection, setSelection } = useWorkspace();
  const chains = analysis?.antibody?.chains ?? [];
  if (!chains.length) {
    return <p className="text-pio-sm text-[var(--pio-graphite)] opacity-60">No antibody variable domains detected.</p>;
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="pio-section-title">Antibody <MetricInfo metric="cdr" /></h2>
        <p className="pio-section-copy mt-1">
          Variable-domain (Fv) chains and their CDR loops from <strong>IMGT numbering</strong>
          {" "}(AntPack — no external binaries), covering heavy, light, and single-domain
          nanobodies. Click a CDR to highlight it in 3D.
        </p>
      </div>
      {chains.map((ch) => (
        <div key={ch.chain_id} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="pio-badge pio-badge-active text-pio-xs">{ch.domain_type}</span>
            <span className="text-pio-sm font-semibold text-[var(--pio-ink)]">Chain {ch.chain_id}</span>
            <span className="ml-auto text-pio-2xs text-[var(--pio-graphite)]">{Math.round(ch.identity * 100)}% germline identity</span>
          </div>
          <motion.div className="flex flex-col gap-2" initial="hidden" animate="show" variants={stagger}>
            {ch.cdrs.map((cdr) => {
              const label = `${ch.chain_id} ${cdr.name}`;
              const isSelected = selection?.kind === "cdr" && selection.label === label;
              function toggle() {
                if (isSelected) {
                  setSelection(null);
                } else {
                  setSelection({
                    kind: "cdr",
                    label,
                    residues: cdr.residue_numbers.map((rn) => ({ chainId: ch.chain_id, residueNumber: rn })),
                  });
                }
              }
              return <CdrCard key={cdr.name} cdr={cdr} chainId={ch.chain_id} isSelected={isSelected} onSelect={toggle} />;
            })}
          </motion.div>
        </div>
      ))}
    </div>
  );
}

const TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "chains", label: "Chains", count: (a) => a.chains.length },
  { id: "sequence", label: "Sequence", visible: (a) => !!(a?.secondary_structure?.summary.residue_count) },
  { id: "ligands", label: "Ligands", count: (a) => a.ligands.length },
  { id: "pockets", label: "Pockets", count: (a) => a.pockets?.length ?? 0, visible: (a) => !!(a?.pockets?.length) },
  { id: "antibody", label: "Antibody", count: (a) => a.antibody?.chains.length ?? 0, visible: (a) => !!(a?.antibody?.chains?.length) },
  { id: "contacts", label: "Contacts", count: (a) => a.summary.contact_count },
  { id: "interfaces", label: "Interfaces", count: (a) => a.interface_analysis?.chain_pairs.length ?? 0, visible: (a) => !!(a?.interface_analysis?.chain_pairs?.length) },
  { id: "confidence", label: "pLDDT", visible: (a) => !!(a?.confidence) },
  { id: "pae", label: "PAE", visible: (a) => !!(a?.pae) },
  { id: "compare", label: "Compare" },
  { id: "similar", label: "Similar" },
  { id: "quality", label: "Quality" },
  { id: "methods", label: "Methods" },
];

// ── Example Gallery (empty state) ────────────────────────────────────────────

type GalleryEntry = {
  id: string;
  title: string;
  source: string;
  description: string;
  tags: string[];
  type: "rcsb" | "alphafold";
  accession: string;
};

const GALLERY: GalleryEntry[] = [
  {
    id: "hemoglobin",
    title: "Hemoglobin",
    source: "RCSB  2HHB",
    description: "Classic multi-chain experimental structure for chain metadata and inter-chain contacts.",
    tags: ["RCSB", "experimental", "multi-chain"],
    type: "rcsb",
    accession: "2HHB",
  },
  {
    id: "ligand-bound",
    title: "Ligand-bound protein",
    source: "RCSB  1A3N",
    description: "Experimental structure useful for ligand interaction summaries and residue contact review.",
    tags: ["RCSB", "ligand", "contacts"],
    type: "rcsb",
    accession: "1A3N",
  },
  {
    id: "binder-target",
    title: "Binder–target interface",
    source: "RCSB  1PPE",
    description: "Trypsin bound to BPTI — a textbook 2-chain protease–inhibitor complex with a tight, well-characterised interface.",
    tags: ["RCSB", "interface", "protein-protein"],
    type: "rcsb",
    accession: "1PPE",
  },
  {
    id: "alphafold",
    title: "AlphaFold prediction",
    source: "AlphaFold DB  P69905",
    description: "Predicted hemoglobin alpha-chain model with pLDDT confidence coloring and contact warnings.",
    tags: ["AlphaFold", "pLDDT", "predicted"],
    type: "alphafold",
    accession: "P69905",
  },
];

function tagBg(tag: string) {
  const t = tag.toLowerCase();
  const green = ["ligand", "contacts", "experimental", "multi-chain", "predicted", "plddt", "interface", "protein-protein"];
  return green.includes(t) ? "var(--pio-green-pale)" : "var(--pio-blue-pale)";
}
function tagFg(tag: string) {
  const t = tag.toLowerCase();
  const green = ["ligand", "contacts", "experimental", "multi-chain", "predicted", "plddt", "interface", "protein-protein"];
  return green.includes(t) ? "var(--pio-green-deep)" : "var(--pio-blue-deep)";
}

function EmptyGallery() {
  const { addStructure, updateStructure, setActiveId } = useWorkspace();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function loadEntry(entry: GalleryEntry) {
    if (loadingId) return;
    setLoadingId(entry.id);
    const entryId = addStructure({
      name: entry.accession,
      source: entry.type,
      pdbId: entry.type === "rcsb" ? entry.accession : "",
      uniprotId: entry.type === "alphafold" ? entry.accession : "",
      structureText: "",
      structureFormat: "cif",
      cutoff: 4.0,
      analysis: null,
      foldseekResult: null,
      isAnalyzing: true,
      error: null,
    });
    setActiveId(entryId);
    try {
      const path = entry.type === "rcsb"
        ? `/api/rcsb/${encodeURIComponent(entry.accession)}/analyze?cutoff_angstrom=4`
        : `/api/alphafold/${encodeURIComponent(entry.accession)}/analyze?cutoff_angstrom=4`;
      const res = await fetch(buildApiUrl(path));
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `Fetch failed (${res.status})`);
      }
      const payload = (await res.json()) as RcsbAnalysisResponse;
      updateStructure(entryId, {
        structureText: payload.structure_text,
        structureFormat: payload.structure_format,
        analysis: payload.analysis,
        isAnalyzing: false,
      });
    } catch (e) {
      updateStructure(entryId, {
        isAnalyzing: false,
        error: e instanceof Error ? e.message : "Load failed",
      });
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <aside className="flex h-full flex-col bg-[var(--pio-white)]">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 scrollbar-thin-report">
        <h2 className="text-pio-4xl font-bold tracking-[-0.01em] leading-[1.1] text-[var(--pio-ink)]">
          Start a structure analysis
        </h2>
        <p className="mt-2 text-pio-lg leading-relaxed text-[var(--pio-graphite)]">
          Explore protein structures, contacts, ligands, and confidence in one browser workspace.
          Start with a structure file, PDB ID, AlphaFold accession, or sample structure.
        </p>
        <p className="mt-3 text-pio-sm leading-relaxed text-[var(--pio-graphite)] opacity-80">
          Local-first: all metrics run on CPU with no models, results stay cached in your browser, and
          the backend stores nothing. On this hosted site your structure is sent to the backend only to be
          analysed and returned;{" "}
          <a
            href="https://github.com/can-karakoc/protein-io#data--privacy"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--pio-highlight)] hover:underline"
          >
            self-host the backend
          </a>{" "}
          to keep structures entirely on your machine.
        </p>

        <div className="mt-5 border-t border-[var(--pio-line)] pt-5">
          <h3 className="text-pio-2xl font-bold leading-[1.15] tracking-[-0.01em] text-[var(--pio-ink)]">
            Example Gallery
          </h3>
          <div className="mt-4 flex flex-col gap-3">
            {GALLERY.map((entry) => (
              <article
                key={entry.id}
                className="pio-gallery-card flex min-w-0 flex-col gap-3 rounded-[8px] bg-[#F5F5F5] p-4"
              >
                <div className="min-w-0">
                  <h4 className="text-pio-xl font-bold leading-snug text-[var(--pio-ink)]">
                    {entry.title}
                  </h4>
                  <p className="mt-0.5 font-[family-name:var(--font-pio-mono)] text-pio-sm text-[var(--pio-graphite)]">
                    {entry.source}
                  </p>
                  <p className="mt-1.5 text-pio-md leading-[1.5] text-[var(--pio-graphite)]"
                    style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                  >
                    {entry.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full px-[10px] py-[3px] text-pio-xs font-semibold"
                        style={{ background: tagBg(tag), color: tagFg(tag) }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadEntry(entry)}
                  disabled={!!loadingId}
                  className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--pio-highlight)] py-[6px] text-pio-base font-semibold text-[var(--pio-highlight-text)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingId === entry.id ? <Loader2 size={13} className="animate-spin" /> : null}
                  {loadingId === entry.id ? "Loading…" : "Load"}
                </button>
              </article>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Main ContextPanel ─────────────────────────────────────────────────────────

const TAB_ORDER: ContextTab[] = [
  "overview", "chains", "sequence", "ligands", "pockets", "antibody", "contacts", "interfaces",
  "confidence", "pae", "compare", "similar", "quality", "report", "methods",
];

export function ContextPanel() {
  const { getActive, contextTab, setContextTab, floatingLigandKey, setFloatingLigandKey, selection, setSelection } = useWorkspace();
  const active = getActive();
  const tabStripRef = useRef<HTMLDivElement>(null);
  const prevTabIdxRef = useRef(0);

  // All hooks must be called unconditionally — before any early return.
  const analysis = active?.analysis ?? null;
  const visibleTabs = TABS.filter((tab) => {
    if (tab.visible) return tab.visible(analysis);
    return true;
  });
  const selectedTab = visibleTabs.some((t) => t.id === contextTab) ? contextTab : "overview";
  const currentTabIdx = TAB_ORDER.indexOf(selectedTab);
  const dir = currentTabIdx >= prevTabIdxRef.current ? 1 : -1;
  useEffect(() => { prevTabIdxRef.current = currentTabIdx; }, [currentTabIdx]);

  // The floating ligand viewer + its selection belong to the Ligands tab. When the
  // user navigates away, close the panel and drop the ligand highlight.
  useEffect(() => {
    if (selectedTab !== "ligands") {
      if (floatingLigandKey !== null) setFloatingLigandKey(null);
      if (selection?.kind === "ligand") setSelection(null);
    }
  }, [selectedTab, floatingLigandKey, selection, setFloatingLigandKey, setSelection]);

  if (!active) {
    return <EmptyGallery />;
  }

  function renderTab() {
    if (!active) return null;

    if (active.isAnalyzing) {
      return (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12 opacity-60">
          <Loader2 size={22} className="animate-spin text-[var(--pio-highlight)]" />
          <p className="text-pio-xs text-[var(--pio-graphite)]">Analyzing structure…</p>
        </div>
      );
    }

    if (active.error) {
      return (
        <div className="rounded-[10px] border border-[var(--pio-coral)] bg-[var(--pio-coral-pale)] p-4">
          <p className="text-pio-xs font-semibold text-[var(--pio-coral-deep)] mb-1">Analysis failed</p>
          <p className="text-pio-3xs text-[var(--pio-coral-deep)]">{active.error}</p>
        </div>
      );
    }

    switch (contextTab) {
      case "overview":    return <OverviewTab entry={active} />;
      case "chains":      return <ChainsTab entry={active} />;
      case "sequence":    return <SequenceTab entry={active} />;
      case "ligands":     return <LigandsTab entry={active} />;
      case "pockets":     return <PocketsTab entry={active} />;
      case "antibody":    return <AntibodyTab entry={active} />;
      case "contacts":    return <ContactsTab entry={active} />;
      case "interfaces":  return <InterfacesTab entry={active} />;
      case "confidence":  return <ConfidenceTab entry={active} />;
      case "pae":         return <PaeTab entry={active} />;
      case "quality":     return <QualityTab entry={active} />;
      case "compare":     return <CompareTab />;
      case "methods":     return <MethodsTab entry={active} />;
      case "similar":     return <SimilarTab entry={active} />;
      case "report":      return (
        <div className="text-pio-xs text-[var(--pio-graphite)] opacity-60">
          Report generation coming in Phase 12.5.
        </div>
      );
      default: return null;
    }
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-[var(--pio-white)]">
      {/* Tab strip — horizontal pills, no icons */}
      <div
        className="shrink-0 bg-[var(--pio-white)] px-3 sm:px-5 pb-4 pt-4 shadow-[0_1px_0_rgba(17,22,16,0.07)]"
        role="tablist"
        aria-label="Analysis results"
      >
        <div className="relative">
          <div
            ref={tabStripRef}
            className="flex gap-1 overflow-x-auto scrollbar-hide"
          >
            {visibleTabs.map((tab) => {
              const isActive = selectedTab === tab.id;
              const count = analysis && tab.count ? tab.count(analysis) : null;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setContextTab(tab.id)}
                  className={[
                    "flex-1 min-w-max whitespace-nowrap text-center rounded-[12px] px-2 sm:px-3.5 py-2 text-pio-base font-semibold transition-colors cursor-pointer",
                    isActive
                      ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)]"
                      : "text-[var(--pio-graphite)] hover:opacity-100 hover:bg-[var(--pio-paper)]",
                  ].join(" ")}
                >
                  {tab.label}
                  {count != null && count > 0 && (
                    <span className={["ml-1.5 text-pio-2xs font-semibold", isActive ? "opacity-70" : "opacity-50"].join(" ")}>
                      {count.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {/* right-edge fade — signals hidden tabs */}
          {visibleTabs.length > 4 && (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--pio-white)] to-transparent" />
          )}
        </div>
      </div>

      {/* Tab content — padding on inner wrapper so scrollbar gets its own lane */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin-panel">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={selectedTab}
            custom={dir}
            variants={tabContent}
            initial="enter"
            animate="center"
            exit="exit"
            className="px-5 pb-6 pt-4"
          >
            {renderTab()}
          </motion.div>
        </AnimatePresence>
      </div>
      {/* Bottom spacer keeps scrollbar thumb away from panel bottom edge */}
      <div className="shrink-0 h-5" />
    </aside>
  );
}
