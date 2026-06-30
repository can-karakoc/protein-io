"use client";

import {
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  FlaskConical,
  GitCompare,
  Loader2,
  Shield,
} from "lucide-react";
import { useRef, useState } from "react";

import { buildApiUrl } from "@/lib/api";
import type { AnalysisResponse, ContactDifference, ContactRecord, RcsbAnalysisResponse, ResidueConfidence } from "@/lib/types";
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
      <span className="text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-70">
        {label}
      </span>
      <span className="text-pio-lg font-bold text-[var(--pio-ink)]">{value}</span>
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
      <p className="text-pio-3xs mb-2 font-bold uppercase tracking-[0.08em] text-[var(--pio-graphite)]">{title}</p>
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

      {/* Metric cards — 3-col grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
        {metrics.map(([label, value]) => (
          <div key={label} style={{ background: "var(--pio-paper)", borderRadius: 10, padding: "12px 14px" }}>
            <p className="text-pio-3xs font-bold uppercase tracking-[0.08em] text-[var(--pio-graphite)]">{label}</p>
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
          <AlertTriangle size={11} className="mt-0.5 shrink-0 text-[var(--pio-amber-deep)]" />
          <p className="text-pio-3xs text-[var(--pio-amber-deep)]">{w}</p>
        </div>
      ))}
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
  const isUpload = !metadata || metadata.source === "upload";

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
  const metaRows = (isAlphaFold ? alphaFoldRows : rcsbRows).filter((r) => r.value != null);

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
      {/* Title + link button */}
      {!isUpload && title && (
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

      {/* UniProt function */}
      {analysis.uniprot_annotations?.function && (
        <div className="rounded-[10px] bg-[var(--pio-paper)] px-[14px] py-3">
          <p className="text-pio-2xs font-bold uppercase tracking-[0.08em] text-[var(--pio-graphite)]">Function</p>
          <p className="mt-1 text-pio-xs leading-[1.6] text-[var(--pio-ink)]">
            {analysis.uniprot_annotations.function}
          </p>
        </div>
      )}

      {/* Metadata key-value grid */}
      {!isUpload && metaRows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}>
          {metaRows.map((row) => (
            <div key={row.label} className="rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--pio-sky)]">
              <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)]">{row.label}</p>
              {row.mono ? (
                <p className="mt-0.5 font-mono text-pio-sm font-medium text-[var(--pio-ink)]">{row.value}</p>
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

      {/* Interaction summary */}
      {analysis.interaction_summary && (
        <InteractionSummaryPanel summary={analysis.interaction_summary} />
      )}

      <WarningBanner warnings={analysis.warnings ?? []} />
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
        <div className="flex flex-col">
          {analysis.chains.map((c, i) => {
            const isSelected = selection?.kind === "chain" && selection.chainId === c.id;
            return (
              <div key={c.id}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() =>
                    setSelection(
                      isSelected ? null : { kind: "chain", chainId: c.id, label: `Chain ${c.id}` },
                    )
                  }
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelection(isSelected ? null : { kind: "chain", chainId: c.id, label: `Chain ${c.id}` }); } }}
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
                  <p className="font-mono text-pio-lg font-medium text-[var(--pio-ink)]">{c.residue_count.toLocaleString()}</p>
                  <p className="font-mono text-pio-lg font-medium text-[var(--pio-ink)]">{c.atom_count.toLocaleString()}</p>
                </div>
                {i < analysis.chains.length - 1 && (
                  <div className="mx-3 h-px bg-[var(--pio-line)]" />
                )}
              </div>
            );
          })}
        </div>
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="pio-section-title">Ligands</h2>
        <p className="pio-section-copy mt-1">
          Per-ligand contact counts, closest atom pair, and contacting residues.
        </p>
      </div>
      <div className="flex flex-col gap-3">
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

        function toggleFloating() {
          if (isFloating) {
            setFloatingLigandKey(null);
            setSelection(null);
          } else {
            setFloatingLigandKey(key);
            setSelection({ kind: "ligand", chainId: lig.chain_id, residueName: lig.name, residueNumber: lig.residue_number, label: lig.name });
          }
        }

        // Fixed 4 stats so every card has the same structure
        const STAT_COLS = ["Atoms", "Contacts", "Protein", "Closest"] as const;
        const statValues: Record<string, string | number> = {
          Atoms:    lig.atom_count,
          Contacts: interaction?.contact_count ?? "—",
          Protein:  interaction?.protein_contact_count ?? "—",
          Closest:  interaction?.closest_distance_angstrom != null
                      ? fmtDist(interaction.closest_distance_angstrom)
                      : "—",
        };

        const residues = interaction?.contacting_residues ?? [];
        const RESIDUE_CAP = 8;

        return (
          <div
            key={`${lig.name}-${lig.chain_id}-${lig.residue_number}`}
            className={[
              "rounded-[14px] border p-4 transition-colors",
              isSelected
                ? "border-[var(--pio-highlight)] bg-[var(--pio-row-selection-bg)]"
                : "border-transparent bg-[var(--pio-paper)]",
            ].join(" ")}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-pio-md font-bold text-[var(--pio-ink)] truncate">{lig.name}</p>
                <span className="shrink-0 font-[family-name:var(--font-pio-mono)] text-pio-xs text-[var(--pio-graphite)]">
                  {lig.chain_id}:{lig.residue_number}
                </span>
                {interaction && interaction.possible_clash_count > 0 && (
                  <span className="pio-badge pio-badge-warning text-pio-xs shrink-0">
                    {interaction.possible_clash_count} clash{interaction.possible_clash_count > 1 ? "es" : ""}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={toggleFloating}
                className={[
                  "shrink-0 rounded-[8px] px-2.5 py-1 text-pio-xs font-semibold transition-colors",
                  isFloating
                    ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)]"
                    : "bg-[var(--pio-sky)] text-[var(--pio-highlight)] hover:bg-[var(--pio-highlight)] hover:text-[var(--pio-highlight-text)]",
                ].join(" ")}
              >
                {isFloating ? "Close" : "View"}
              </button>
            </div>

            {/* ── Stats — always 4 columns, uniform across all cards ── */}
            <div className="grid grid-cols-4 gap-x-2 mb-4">
              {STAT_COLS.map((col) => (
                <div key={col}>
                  <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] mb-0.5">{col}</p>
                  <p className="font-[family-name:var(--font-pio-mono)] text-pio-lg font-bold text-[var(--pio-ink)] truncate">{statValues[col]}</p>
                </div>
              ))}
            </div>

            {/* ── Contacting residues — capped so all cards stay same height ── */}
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
          </div>
        );
      })}
      </div>
    </div>
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
        <h2 className="pio-section-title">Contacts</h2>
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
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => setSelection(isSelected ? null : { kind: "contact", contact: c, label })}
                  onKeyDown={(e) => handleSelectableRowKeyDown(e, () => setSelection(isSelected ? null : { kind: "contact", contact: c, label }))}
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
                </div>
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
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
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
          >← Prev</button>
          <span className="text-pio-xs text-[var(--pio-graphite)]">{page + 1} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
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
          >Next →</button>
        </div>
      )}
    </div>
  );
}

// ── Tab: Interfaces ───────────────────────────────────────────────────────────

function InterfacesTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  const { selection, setSelection } = useWorkspace();
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

  return (
    <div className="flex flex-col gap-6">
      {/* Section header */}
      <div>
        <h2 className="pio-section-title">Interfaces</h2>
        <p className="pio-section-copy mt-1">
          Chain-pair contact interfaces — inter-chain contacts and participating residues.
        </p>
      </div>

      {/* Summary stats — full-width 1fr 1fr */}
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

      {/* Chain pair cards — same style as Ligands cards */}
      <div className="flex flex-col gap-3">
        {ia.chain_pairs.map((cp) => {
          const pairKey = `${cp.chain_a}-${cp.chain_b}`;
          const isSelected = selection?.kind === "interface" && selection.chainA === cp.chain_a && selection.chainB === cp.chain_b;
          return (
          <div
            key={pairKey}
            role="button"
            tabIndex={0}
            onClick={() => setSelection(isSelected ? null : { kind: "interface", chainA: cp.chain_a, chainB: cp.chain_b, label: `Chain ${cp.chain_a}–${cp.chain_b}` })}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelection(isSelected ? null : { kind: "interface", chainA: cp.chain_a, chainB: cp.chain_b, label: `Chain ${cp.chain_a}–${cp.chain_b}` }); } }}
            className={["rounded-[14px] border p-4 transition-colors cursor-pointer", isSelected ? "border-[var(--pio-highlight)] bg-[var(--pio-row-selection-bg)]" : "border-transparent bg-[var(--pio-paper)] hover:bg-[var(--pio-sky)]"].join(" ")}
          >
            {/* Card header: badges + contact count */}
            <div className="flex items-center gap-2 mb-4">
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
            </div>

            {/* Interface details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] mb-1">Chain {cp.chain_a} interface</p>
                <p className="text-pio-sm text-[var(--pio-ink)]">{cp.interface_residue_count_a} residues</p>
                {cp.mean_plddt_a != null && (
                  <p className="text-pio-xs mt-0.5" style={{ color: plddtColor(cp.mean_plddt_a) }}>
                    mean pLDDT {cp.mean_plddt_a.toFixed(1)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-pio-2xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] mb-1">Chain {cp.chain_b} interface</p>
                <p className="text-pio-sm text-[var(--pio-ink)]">{cp.interface_residue_count_b} residues</p>
                {cp.mean_plddt_b != null && (
                  <p className="text-pio-xs mt-0.5" style={{ color: plddtColor(cp.mean_plddt_b) }}>
                    mean pLDDT {cp.mean_plddt_b.toFixed(1)}
                  </p>
                )}
              </div>
            </div>
          </div>
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
      {/* Average badge */}
      <div className="pio-panel-nested flex items-center gap-4 p-4">
        <div className="flex flex-col">
          <span className="text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-70">
            Average pLDDT
          </span>
          <span
            className="text-pio-4xl font-bold leading-[1.1]"
            style={{ color: plddtColor(conf.average_plddt) }}
          >
            {conf.average_plddt.toFixed(1)}
          </span>
          <span className="text-pio-xs" style={{ color: plddtColor(conf.average_plddt) }}>
            {plddtLabel(conf.average_plddt)} confidence
          </span>
        </div>
        <div className="flex-1" />
        <Stat label="Residues" value={total.toLocaleString()} />
      </div>

      {/* Band breakdown */}
      <div className="flex flex-col gap-2">
        {bands.map((b) => {
          const w = pct(b.count, total);
          return (
            <div key={b.label}>
              <div className="flex justify-between mb-1">
                <span className="text-pio-3xs text-[var(--pio-graphite)]">{b.label}</span>
                <span className="text-pio-3xs font-semibold text-[var(--pio-ink)]">
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

function PaeTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  if (!analysis) return null;
  const pae = analysis.pae;

  if (!pae) {
    return (
      <p className="text-pio-xs text-[var(--pio-graphite)] opacity-60">
        No PAE data. Upload a PAE .json sidecar alongside an AlphaFold structure to enable this tab.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="pio-panel-nested grid grid-cols-2 gap-x-4 gap-y-3 p-4">
        <Stat label="Residues" value={pae.residue_count.toLocaleString()} />
        <Stat label="Mean PAE" value={`${pae.mean_predicted_aligned_error.toFixed(1)} Å`} />
        <Stat label="Max PAE" value={`${pae.max_predicted_aligned_error.toFixed(1)} Å`} />
        <Stat label={`High-error pairs (≥${pae.high_error_threshold}Å)`} value={pae.high_error_pair_count.toLocaleString()} />
      </div>
      <div className="rounded-[10px] border border-[var(--pio-amber)] bg-[var(--pio-amber-pale)] p-3">
        <p className="text-pio-xs text-[var(--pio-amber-deep)]">
          PAE matrix heatmap visualization requires the full workbench view.
        </p>
      </div>
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
  fontSize: "10px",
  padding: "2px 8px",
};

function ContactDiffTable({ rows, emptyLabel }: { rows: ContactDifference[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="py-3 text-center text-pio-3xs text-[var(--pio-graphite)] opacity-50">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-[var(--pio-line)]">
            <th className="py-1.5 pr-3 text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">Contact</th>
            <th className="py-1.5 pr-3 text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">Type</th>
            <th className="py-1.5 text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">Dist A / B</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--pio-line)] last:border-0">
              <td className="py-2 pr-3 text-pio-xs text-[var(--pio-ink)] font-mono">{r.label}</td>
              <td className="py-2 pr-3">
                <span style={{ ...DIFF_CHIP_BASE, ...contactChipStyle(r.contact_type) }}>
                  {r.contact_type}
                </span>
              </td>
              <td className="py-2 text-pio-3xs font-mono text-[var(--pio-graphite)]">
                {r.distance_a_angstrom != null ? r.distance_a_angstrom.toFixed(2) : "—"}
                {" / "}
                {r.distance_b_angstrom != null ? r.distance_b_angstrom.toFixed(2) : "—"} Å
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompareTab() {
  const { comparison, compareIsLoading, compareError, compareIds, structures } = useWorkspace();
  const [diffTab, setDiffTab] = useState<"shared" | "gained" | "lost">("shared");

  const entA = structures.find((s) => s.id === compareIds[0]);
  const entB = structures.find((s) => s.id === compareIds[1]);
  const labelA = entA ? (entA.pdbId || entA.uniprotId || entA.name) : "A";
  const labelB = entB ? (entB.pdbId || entB.uniprotId || entB.name) : "B";

  // Not enough structures loaded yet — show an instructional placeholder
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
          <p className="text-pio-xl font-bold leading-[1.15] tracking-[-0.01em] text-[var(--pio-ink)]">
            Load a second structure
          </p>
          <p className="text-pio-sm leading-relaxed text-[var(--pio-graphite)]">
            Use the <strong>Load another</strong> panel on the left to add a second structure, then run a comparison.
          </p>
        </div>
      </div>
    );
  }

  if (compareIsLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 size={22} className="animate-spin text-[var(--pio-highlight)]" />
        <p className="text-pio-xs text-[var(--pio-graphite)]">Comparing structures…</p>
      </div>
    );
  }

  if (compareError) {
    return (
      <div className="flex items-start gap-2.5 rounded-[10px] bg-[var(--pio-coral-pale)] p-4">
        <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--pio-coral-deep)]" />
        <div>
          <p className="text-pio-xs font-semibold text-[var(--pio-coral-deep)]">Comparison failed</p>
          <p className="mt-1 text-pio-3xs text-[var(--pio-coral-deep)] opacity-80">{compareError}</p>
        </div>
      </div>
    );
  }

  if (!comparison) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 px-4 text-center">
        <GitCompare size={24} className="text-[var(--pio-graphite)] opacity-30" />
        <p className="text-pio-xs font-semibold text-[var(--pio-ink)]">No comparison yet</p>
        <p className="text-pio-3xs text-[var(--pio-graphite)] leading-relaxed opacity-70">
          Load ≥ 2 structures, then use the <strong>Compare</strong> panel in the left sidebar to select and run a comparison.
        </p>
      </div>
    );
  }

  const { delta, contacts } = comparison;
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

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="rounded-[6px] bg-[var(--pio-sky)] px-2 py-0.5 text-pio-3xs font-bold text-[var(--pio-highlight)]">{labelA}</span>
        <GitCompare size={12} className="text-[var(--pio-graphite)] opacity-40" />
        <span className="rounded-[6px] bg-[var(--pio-sky)] px-2 py-0.5 text-pio-3xs font-bold text-[var(--pio-highlight)]">{labelB}</span>
      </div>

      {/* Delta summary */}
      <div>
        <p className="mb-2 text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">Delta (B − A)</p>
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
        <p className="mb-2 text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-60">Contacts</p>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
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

const TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "chains", label: "Chains", count: (a) => a.chains.length },
  { id: "ligands", label: "Ligands", count: (a) => a.ligands.length },
  { id: "contacts", label: "Contacts", count: (a) => a.summary.contact_count },
  { id: "interfaces", label: "Interfaces", count: (a) => a.interface_analysis?.chain_pairs.length ?? 0, visible: (a) => !!(a?.interface_analysis?.chain_pairs?.length) },
  { id: "confidence", label: "pLDDT", visible: (a) => !!(a?.confidence) },
  { id: "pae", label: "PAE", visible: (a) => !!(a?.pae) },
  { id: "quality", label: "Quality" },
  { id: "compare", label: "Compare" },
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

export function ContextPanel() {
  const { getActive, contextTab, setContextTab } = useWorkspace();
  const active = getActive();
  const tabStripRef = useRef<HTMLDivElement>(null);

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
      case "ligands":     return <LigandsTab entry={active} />;
      case "contacts":    return <ContactsTab entry={active} />;
      case "interfaces":  return <InterfacesTab entry={active} />;
      case "confidence":  return <ConfidenceTab entry={active} />;
      case "pae":         return <PaeTab entry={active} />;
      case "quality":     return <QualityTab entry={active} />;
      case "compare":     return <CompareTab />;
      case "methods":     return <MethodsTab entry={active} />;
      case "report":      return (
        <div className="text-pio-xs text-[var(--pio-graphite)] opacity-60">
          Report generation coming in Phase 12.5.
        </div>
      );
      default: return null;
    }
  }

  const analysis = active.analysis;

  // Filter tabs: hide confidence/pae/interfaces when not applicable
  const visibleTabs = TABS.filter((tab) => {
    if (tab.visible) return tab.visible(analysis);
    return true;
  });

  // If active tab was hidden (e.g. switched structure), fall back to overview
  const selectedTab = visibleTabs.some((t) => t.id === contextTab) ? contextTab : "overview";

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
                    "flex-1 min-w-max whitespace-nowrap text-center rounded-[12px] px-2 sm:px-3.5 py-2 text-pio-base font-semibold transition-colors",
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
        <div className="px-5 pb-6 pt-4">
          {renderTab()}
        </div>
      </div>
      {/* Bottom spacer keeps scrollbar thumb away from panel bottom edge */}
      <div className="shrink-0 h-5" />
    </aside>
  );
}
