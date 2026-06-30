"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Dna,
  ExternalLink,
  FlaskConical,
  GitCompare,
  Info,
  Layers,
  Loader2,
  Microscope,
  Puzzle,
  Shield,
  Zap,
} from "lucide-react";
import { useRef, useState } from "react";

import type { AnalysisResponse, ContactRecord, LigandInteractionSummary } from "@/lib/types";
import type { ContextTab, StructureEntry } from "@/lib/workspaceStore";
import { useWorkspace } from "@/lib/workspaceStore";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function fmtDist(d: number) {
  return `${d.toFixed(2)} Å`;
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
  const { analysis, metadata } = { analysis: entry.analysis, metadata: entry.analysis?.metadata ?? null };
  if (!analysis) return null;
  const s = analysis.summary;

  return (
    <div className="flex flex-col gap-4">
      {/* Title */}
      {metadata?.title && (
        <div className="flex items-start gap-2">
          <p className="text-pio-md font-bold text-[var(--pio-ink)] leading-snug flex-1">
            {metadata.title}
          </p>
          {(metadata.rcsb_url || metadata.alphafold_url) && (
            <a
              href={metadata.rcsb_url ?? metadata.alphafold_url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 shrink-0 rounded-full bg-[var(--pio-sky)] p-1.5 text-[var(--pio-highlight)] hover:bg-[var(--pio-highlight)] hover:text-white transition-colors"
            >
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      {/* Meta badges */}
      <div className="flex flex-wrap gap-1.5">
        {metadata?.method && <MetaBadge label="Method" value={metadata.method} />}
        {metadata?.resolution_angstrom != null && (
          <MetaBadge label="Res" value={`${metadata.resolution_angstrom.toFixed(1)} Å`} />
        )}
        {metadata?.organism && <MetaBadge label="Org" value={metadata.organism} />}
        {metadata?.deposition_date && (
          <MetaBadge label="Dep" value={metadata.deposition_date} />
        )}
        {metadata?.model_version != null && (
          <MetaBadge label="Model v" value={String(metadata.model_version)} />
        )}
      </div>

      {/* Stats grid */}
      <div className="pio-panel-nested grid grid-cols-2 gap-x-4 gap-y-3 p-4">
        <Stat label="Atoms" value={s.atom_count.toLocaleString()} />
        <Stat label="Residues" value={s.residue_count.toLocaleString()} />
        <Stat label="Chains" value={s.chain_count} />
        <Stat label="Ligands" value={s.ligand_count} />
        <Stat label="Contacts" value={s.contact_count.toLocaleString()} />
        <Stat label="Cutoff" value={`${entry.cutoff} Å`} />
      </div>

      {/* Interaction breakdown */}
      {analysis.interaction_summary && (
        <>
          <SectionHeading>Interaction breakdown</SectionHeading>
          <div className="pio-panel-nested p-3">
            <StatRow label="Protein–Protein" value={analysis.interaction_summary.protein_protein_count.toLocaleString()} />
            <StatRow label="Protein–Ligand" value={analysis.interaction_summary.protein_ligand_count.toLocaleString()} />
            <StatRow label="Protein–Water" value={analysis.interaction_summary.protein_water_count.toLocaleString()} />
            <StatRow label="Intra-chain" value={analysis.interaction_summary.intra_chain_count.toLocaleString()} />
            <StatRow label="Inter-chain" value={analysis.interaction_summary.inter_chain_count.toLocaleString()} />
            {analysis.interaction_summary.possible_clash_count > 0 && (
              <StatRow label="Clashes ⚠" value={analysis.interaction_summary.possible_clash_count} />
            )}
          </div>
        </>
      )}

      {/* UniProt function */}
      {analysis.uniprot_annotations?.function && (
        <>
          <SectionHeading>Function</SectionHeading>
          <p className="text-pio-xs text-[var(--pio-graphite)] leading-relaxed">
            {analysis.uniprot_annotations.function}
          </p>
        </>
      )}

      <WarningBanner warnings={analysis.warnings ?? []} />
    </div>
  );
}

// ── Tab: Chains ───────────────────────────────────────────────────────────────

function ChainsTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  if (!analysis) return null;

  return (
    <div className="flex flex-col gap-3">
      {analysis.chains.length === 0 && (
        <p className="text-pio-xs text-[var(--pio-graphite)] opacity-60">No chains found.</p>
      )}
      {analysis.chains.map((c) => (
        <div key={c.id} className="pio-panel-nested flex items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(199,217,236,0.4)] text-pio-sm font-bold text-[var(--pio-highlight)]">
            {c.id}
          </div>
          <div className="flex-1 flex flex-col gap-0.5">
            <p className="text-pio-xs font-semibold text-[var(--pio-ink)]">Chain {c.id}</p>
            <div className="flex gap-3">
              <span className="text-pio-3xs text-[var(--pio-graphite)]">
                {c.residue_count.toLocaleString()} residues
              </span>
              <span className="text-pio-3xs text-[var(--pio-graphite)]">
                {c.atom_count.toLocaleString()} atoms
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Ligands ──────────────────────────────────────────────────────────────

function LigandsTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  if (!analysis) return null;

  const ligandInteractions = analysis.ligand_interactions;

  if (!analysis.ligands.length) {
    return (
      <p className="text-pio-xs text-[var(--pio-graphite)] opacity-60">
        No ligands detected in this structure.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {analysis.ligands.map((lig) => {
        const interaction = ligandInteractions.find(
          (li) => li.name === lig.name && li.chain_id === lig.chain_id,
        );
        return (
          <div key={`${lig.name}-${lig.chain_id}-${lig.residue_number}`} className="pio-panel-nested p-4">
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical size={13} className="text-[var(--pio-highlight)]" />
              <p className="text-pio-sm font-bold text-[var(--pio-ink)]">{lig.name}</p>
              <span className="text-pio-3xs text-[var(--pio-graphite)]">
                Chain {lig.chain_id} · #{lig.residue_number}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-y-1">
              <StatRow label="Atoms" value={lig.atom_count} />
              {interaction && (
                <>
                  <StatRow label="Contacts" value={interaction.contact_count} />
                  <StatRow label="Protein contacts" value={interaction.protein_contact_count} />
                  {interaction.closest_distance_angstrom != null && (
                    <StatRow label="Closest dist" value={fmtDist(interaction.closest_distance_angstrom)} />
                  )}
                  {interaction.possible_clash_count > 0 && (
                    <StatRow label="Clashes ⚠" value={interaction.possible_clash_count} />
                  )}
                </>
              )}
            </div>
            {interaction && interaction.contacting_residues.length > 0 && (
              <div className="mt-2">
                <p className="text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-70 mb-1">
                  Contacting residues
                </p>
                <div className="flex flex-wrap gap-1">
                  {interaction.contacting_residues.slice(0, 12).map((r) => (
                    <span
                      key={`${r.chain_id}-${r.residue_number}`}
                      className="pio-badge pio-badge-neutral text-pio-3xs"
                    >
                      {r.residue_name} {r.residue_number}
                    </span>
                  ))}
                  {interaction.contacting_residues.length > 12 && (
                    <span className="pio-badge pio-badge-neutral text-pio-3xs">
                      +{interaction.contacting_residues.length - 12} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tab: Contacts ─────────────────────────────────────────────────────────────

function ContactsTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  if (!analysis) return null;

  const [filter, setFilter] = useState<"all" | "protein-protein" | "protein-ligand" | "clashes">("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  const FILTERS = [
    { id: "all" as const, label: "All" },
    { id: "protein-protein" as const, label: "Prot–Prot" },
    { id: "protein-ligand" as const, label: "Prot–Lig" },
    { id: "clashes" as const, label: "Clashes" },
  ];

  const filtered = analysis.contacts.filter((c) => {
    if (filter === "protein-protein") return c.contact_categories.includes("protein-protein");
    if (filter === "protein-ligand") return c.contact_categories.includes("protein-ligand");
    if (filter === "clashes") return c.trust_label === "possible-clash";
    return true;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const trustColor = (label: ContactRecord["trust_label"]) => {
    if (label === "possible-clash") return "var(--pio-coral)";
    if (label === "low-confidence") return "var(--pio-amber)";
    if (label === "high-confidence") return "var(--pio-green-deep)";
    return "var(--pio-graphite)";
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Filter strip */}
      <div className="flex gap-1 rounded-[12px] border border-[var(--pio-line)] bg-[var(--pio-paper)] p-1 flex-shrink-0">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => { setFilter(f.id); setPage(0); }}
            className={[
              "flex-1 rounded-[8px] py-1 text-pio-3xs font-semibold transition-colors",
              filter === f.id
                ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)]"
                : "text-[var(--pio-blue-deep)] opacity-60 hover:opacity-100",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-pio-3xs text-[var(--pio-graphite)] opacity-60">
        {filtered.length.toLocaleString()} contacts
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-[10px] border border-[var(--pio-line)]">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--pio-line)] bg-[var(--pio-paper)]">
              {["A", "B", "Dist", "Class"].map((h) => (
                <th key={h} className="px-2 py-1.5 text-pio-3xs font-semibold text-[var(--pio-graphite)] uppercase tracking-[0.07em]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((c, i) => (
              <tr
                key={i}
                className="border-b border-[var(--pio-line)] last:border-0 hover:bg-[var(--pio-sky)] transition-colors"
              >
                <td className="px-2 py-1.5 text-pio-3xs font-mono text-[var(--pio-ink)]">
                  {c.chain_a}{c.residue_a} {c.residue_name_a}
                </td>
                <td className="px-2 py-1.5 text-pio-3xs font-mono text-[var(--pio-ink)]">
                  {c.chain_b}{c.residue_b} {c.residue_name_b}
                </td>
                <td className="px-2 py-1.5 text-pio-3xs font-mono"
                  style={{ color: trustColor(c.trust_label ?? null) }}
                >
                  {c.distance_angstrom.toFixed(2)}
                </td>
                <td className="px-2 py-1.5 text-pio-3xs text-[var(--pio-graphite)]">
                  {c.interaction_class ?? "—"}
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-pio-xs text-[var(--pio-graphite)] opacity-60">
                  No contacts match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="text-pio-3xs text-[var(--pio-highlight)] disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-pio-3xs text-[var(--pio-graphite)]">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="text-pio-3xs text-[var(--pio-highlight)] disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab: Interfaces ───────────────────────────────────────────────────────────

function InterfacesTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
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
    <div className="flex flex-col gap-3">
      <div className="flex gap-4">
        <Stat label="Inter-chain contacts" value={ia.inter_chain_contact_count.toLocaleString()} />
        <Stat label="Intra-chain contacts" value={ia.intra_chain_contact_count.toLocaleString()} />
      </div>

      {ia.chain_pairs.map((cp) => (
        <div key={`${cp.chain_a}-${cp.chain_b}`} className="pio-panel-nested p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1">
              <span className="rounded-full bg-[rgba(199,217,236,0.4)] px-2 py-0.5 text-pio-xs font-bold text-[var(--pio-highlight)]">
                {cp.chain_a}
              </span>
              <ChevronRight size={11} className="text-[var(--pio-graphite)]" />
              <span className="rounded-full bg-[rgba(199,217,236,0.4)] px-2 py-0.5 text-pio-xs font-bold text-[var(--pio-highlight)]">
                {cp.chain_b}
              </span>
            </div>
            <span className="text-pio-3xs text-[var(--pio-graphite)]">
              {cp.contact_count.toLocaleString()} contacts
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-pio-3xs font-semibold text-[var(--pio-graphite)] mb-1">Chain {cp.chain_a} interface</p>
              <p className="text-pio-3xs text-[var(--pio-graphite)]">{cp.interface_residue_count_a} residues</p>
              {cp.mean_plddt_a != null && (
                <p className="text-pio-3xs" style={{ color: plddtColor(cp.mean_plddt_a) }}>
                  mean pLDDT {cp.mean_plddt_a.toFixed(1)}
                </p>
              )}
            </div>
            <div>
              <p className="text-pio-3xs font-semibold text-[var(--pio-graphite)] mb-1">Chain {cp.chain_b} interface</p>
              <p className="text-pio-3xs text-[var(--pio-graphite)]">{cp.interface_residue_count_b} residues</p>
              {cp.mean_plddt_b != null && (
                <p className="text-pio-3xs" style={{ color: plddtColor(cp.mean_plddt_b) }}>
                  mean pLDDT {cp.mean_plddt_b.toFixed(1)}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
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
            className="text-pio-4xl font-bold"
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

// ── Tab: Quality ──────────────────────────────────────────────────────────────

function QualityTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  if (!analysis) return null;
  const is = analysis.interaction_summary;

  return (
    <div className="flex flex-col gap-4">
      {/* Clash rate */}
      {is && (
        <div className="pio-panel-nested p-4">
          <p className="text-pio-xs font-bold text-[var(--pio-ink)] mb-3">Clash analysis</p>
          <div className="flex flex-col gap-1">
            <StatRow label="Total contacts" value={analysis.summary.contact_count.toLocaleString()} />
            <StatRow label="Possible clashes" value={is.possible_clash_count} />
            <StatRow
              label="Clash rate"
              value={`${pct(is.possible_clash_count, analysis.summary.contact_count)}%`}
            />
          </div>
          {is.possible_clash_count === 0 && (
            <div className="mt-3 flex items-center gap-2 text-[var(--pio-green-deep)]">
              <Shield size={13} />
              <p className="text-pio-xs font-semibold">No clashes detected</p>
            </div>
          )}
        </div>
      )}

      {/* Warnings */}
      {analysis.warnings.length > 0 && (
        <>
          <SectionHeading>Warnings</SectionHeading>
          <WarningBanner warnings={analysis.warnings} />
        </>
      )}

      {analysis.warnings.length === 0 && (
        <div className="flex items-center gap-2 text-[var(--pio-green-deep)]">
          <Shield size={13} />
          <p className="text-pio-xs font-semibold">No quality warnings</p>
        </div>
      )}
    </div>
  );
}

// ── Tab: Compare ──────────────────────────────────────────────────────────────

function CompareTab() {
  const { structures, compareIds, setCompareId, setMode } = useWorkspace();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-pio-xs text-[var(--pio-graphite)] leading-relaxed">
        Select two loaded structures to compare their contacts, chains, and summaries.
      </p>

      {[0, 1].map((slot) => {
        const currentId = compareIds[slot];
        return (
          <div key={slot}>
            <p className="text-pio-3xs font-semibold uppercase tracking-[0.07em] text-[var(--pio-graphite)] opacity-70 mb-1.5">
              Structure {slot === 0 ? "A" : "B"}
            </p>
            <select
              value={currentId ?? ""}
              onChange={(e) => setCompareId(slot as 0 | 1, e.target.value || null)}
              className="pio-input w-full text-pio-xs"
              style={{ height: 34, padding: "0 8px" }}
            >
              <option value="">— Select structure —</option>
              {structures.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.pdbId || s.uniprotId || s.name}
                </option>
              ))}
            </select>
          </div>
        );
      })}

      {compareIds[0] && compareIds[1] && compareIds[0] !== compareIds[1] && (
        <button
          type="button"
          onClick={() => setMode("workspace")}
          className="flex items-center justify-center gap-2 rounded-[10px] bg-[var(--pio-highlight)] py-2 text-pio-xs font-semibold text-[var(--pio-highlight-text)]"
        >
          <GitCompare size={13} />
          Open comparison view
        </button>
      )}
    </div>
  );
}

// ── Tab: Methods ──────────────────────────────────────────────────────────────

function MethodsTab({ entry }: { entry: StructureEntry }) {
  const { analysis } = entry;
  if (!analysis) return null;
  const meta = analysis.metadata;

  return (
    <div className="flex flex-col gap-4">
      {meta && (
        <div className="pio-panel-nested p-4">
          <p className="text-pio-xs font-bold text-[var(--pio-ink)] mb-3">Structure provenance</p>
          <StatRow label="Source" value={meta.source ?? "—"} />
          {meta.method && <StatRow label="Experimental method" value={meta.method} />}
          {meta.resolution_angstrom != null && (
            <StatRow label="Resolution" value={`${meta.resolution_angstrom} Å`} />
          )}
          {meta.deposition_date && <StatRow label="Deposited" value={meta.deposition_date} />}
          {meta.organism && <StatRow label="Organism" value={meta.organism} />}
        </div>
      )}

      <div className="pio-panel-nested p-4">
        <p className="text-pio-xs font-bold text-[var(--pio-ink)] mb-3">Contact detection</p>
        <StatRow label="Distance cutoff" value={`${entry.cutoff} Å`} />
        <StatRow label="Format" value={entry.structureFormat.toUpperCase()} />
        <StatRow label="Analysis version" value={analysis.version ?? "1.0"} />
      </div>

      <div className="pio-panel-nested p-4">
        <p className="text-pio-xs font-bold text-[var(--pio-ink)] mb-3">Confidence scoring</p>
        <p className="text-pio-3xs text-[var(--pio-graphite)] leading-relaxed">
          Contact trust labels are assigned based on pLDDT scores of both partner residues.
          <br />• <strong>High confidence</strong>: both ≥70 pLDDT
          <br />• <strong>Inspect manually</strong>: one residue 50–70
          <br />• <strong>Low confidence</strong>: either residue &lt;50
          <br />• <strong>Possible clash</strong>: distance &lt;2.0 Å
        </p>
      </div>
    </div>
  );
}

// ── Tab definition ────────────────────────────────────────────────────────────

type TabDef = {
  id: ContextTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  count?: (a: AnalysisResponse) => number | null;
  needsAnalysis: boolean;
};

const TABS: TabDef[] = [
  { id: "overview", label: "Overview", icon: Info, needsAnalysis: true },
  { id: "chains", label: "Chains", icon: Dna, count: (a) => a.chains.length, needsAnalysis: true },
  { id: "ligands", label: "Ligands", icon: FlaskConical, count: (a) => a.ligands.length, needsAnalysis: true },
  { id: "contacts", label: "Contacts", icon: Activity, count: (a) => a.summary.contact_count, needsAnalysis: true },
  { id: "interfaces", label: "Interfaces", icon: Puzzle, count: (a) => a.interface_analysis?.chain_pairs.length ?? 0, needsAnalysis: true },
  { id: "confidence", label: "pLDDT", icon: BarChart3, needsAnalysis: true },
  { id: "pae", label: "PAE", icon: Zap, needsAnalysis: true },
  { id: "quality", label: "Quality", icon: Shield, needsAnalysis: true },
  { id: "compare", label: "Compare", icon: GitCompare, needsAnalysis: false },
  { id: "methods", label: "Methods", icon: Microscope, needsAnalysis: true },
];

// ── Main ContextPanel ─────────────────────────────────────────────────────────

export function ContextPanel() {
  const { getActive, contextTab, setContextTab } = useWorkspace();
  const active = getActive();
  const tabStripRef = useRef<HTMLDivElement>(null);

  if (!active) {
    return (
      <aside className="flex h-full flex-col bg-[var(--pio-white)] border-l border-[var(--pio-line)]">
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6 text-center opacity-50">
          <Layers size={28} className="text-[var(--pio-graphite)]" />
          <p className="text-pio-xs text-[var(--pio-graphite)]">
            Load a structure to explore its analysis
          </p>
        </div>
      </aside>
    );
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
      case "overview": return <OverviewTab entry={active} />;
      case "chains": return <ChainsTab entry={active} />;
      case "ligands": return <LigandsTab entry={active} />;
      case "contacts": return <ContactsTab entry={active} />;
      case "interfaces": return <InterfacesTab entry={active} />;
      case "confidence": return <ConfidenceTab entry={active} />;
      case "pae": return <PaeTab entry={active} />;
      case "quality": return <QualityTab entry={active} />;
      case "compare": return <CompareTab />;
      case "methods": return <MethodsTab entry={active} />;
      case "report": return (
        <div className="text-pio-xs text-[var(--pio-graphite)] opacity-60">
          Report generation coming in Phase 12.5.
        </div>
      );
      default: return null;
    }
  }

  const analysis = active.analysis;

  return (
    <aside className="flex h-full min-h-0 flex-col bg-[var(--pio-white)] border-l border-[var(--pio-line)] shadow-[-8px_0_24px_rgba(17,22,16,0.05)]">
      {/* Tab strip */}
      <div
        ref={tabStripRef}
        className="flex gap-0 overflow-x-auto border-b border-[var(--pio-line)] scrollbar-hide flex-shrink-0"
        style={{ scrollbarWidth: "none" }}
      >
        {TABS.map((tab) => {
          const isActive = contextTab === tab.id;
          const count = analysis && tab.count ? tab.count(analysis) : null;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setContextTab(tab.id)}
              className={[
                "relative flex flex-col items-center gap-0.5 px-3 py-2.5 flex-shrink-0 transition-colors",
                isActive
                  ? "text-[var(--pio-highlight)]"
                  : "text-[var(--pio-graphite)] opacity-60 hover:opacity-100",
              ].join(" ")}
            >
              <Icon size={13} />
              <span className="text-pio-3xs font-semibold whitespace-nowrap">{tab.label}</span>
              {count != null && count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--pio-highlight)] text-[9px] font-bold text-white">
                  {count > 99 ? "99+" : count}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-[var(--pio-highlight)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {renderTab()}
      </div>
    </aside>
  );
}
