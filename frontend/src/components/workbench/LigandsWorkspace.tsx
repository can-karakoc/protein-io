"use client";

import { ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";

import type { AnalysisResponse, ContactRecord, LigandInteractionSummary, TopContactResidue } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const INTERACTION_TYPES = ["h-bond", "salt-bridge", "aromatic", "pi-cation", "hydrophobic", "halogen-bond"] as const;
type InteractionType = (typeof INTERACTION_TYPES)[number];

const TYPE_META: Record<InteractionType, { label: string; color: string; badgeCls: string }> = {
  "h-bond":       { label: "H-bond",       color: "var(--pio-lavender)",     badgeCls: "pio-badge-predicted" },
  "salt-bridge":  { label: "Salt bridge",  color: "var(--pio-amber)",        badgeCls: "pio-badge-caution"   },
  "aromatic":     { label: "Aromatic",     color: "var(--pio-blue)",         badgeCls: "pio-badge-metadata"  },
  "pi-cation":    { label: "π-cation",     color: "var(--pio-lavender-deep)",badgeCls: "pio-badge-predicted" },
  "hydrophobic":  { label: "Hydrophobic",  color: "var(--pio-green)",        badgeCls: "pio-badge-active"    },
  "halogen-bond": { label: "Halogen bond", color: "var(--pio-coral)",        badgeCls: "pio-badge-warning"   },
};

function ligandKey(l: LigandInteractionSummary) {
  return `${l.chain_id}:${l.residue_number}:${l.name}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function LigandsWorkspace({
  analysis,
  onFocusExplore,
}: {
  analysis: AnalysisResponse | null;
  onFocusExplore: () => void;
}) {
  const ligands = analysis?.ligand_interactions ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Auto-select first ligand when analysis loads
  useEffect(() => {
    if (ligands.length > 0) setSelectedKey(ligandKey(ligands[0]));
    else setSelectedKey(null);
  }, [analysis]);

  if (!analysis) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="w-full max-w-[440px] rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] p-10 text-center shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10)]">
          <div className="mx-auto mb-4 flex h-13 w-13 items-center justify-center rounded-full" style={{ background: "rgba(199,217,236,0.4)", width: 52, height: 52 }}>
            <FlaskConical size={22} color="var(--pio-highlight)" />
          </div>
          <h2 className="text-pio-xl font-bold text-[var(--pio-ink)]">No structure loaded</h2>
          <p className="mt-2 text-pio-sm text-[var(--pio-graphite)] leading-relaxed">
            Load and analyze a structure in Explore first to view ligand interactions here.
          </p>
          <button type="button" onClick={onFocusExplore}
            className="mt-5 rounded-[12px] bg-[var(--pio-highlight)] px-5 py-2 text-pio-sm font-semibold text-[var(--pio-highlight-text)] hover:opacity-90">
            Go to Explore
          </button>
        </div>
      </div>
    );
  }

  if (ligands.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="w-full max-w-[440px] rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] p-10 text-center shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10)]">
          <div className="mx-auto mb-4 flex items-center justify-center rounded-full" style={{ background: "rgba(199,217,236,0.4)", width: 52, height: 52 }}>
            <FlaskConical size={22} color="var(--pio-graphite)" />
          </div>
          <h2 className="text-pio-xl font-bold text-[var(--pio-ink)]">No ligands detected</h2>
          <p className="mt-2 text-pio-sm text-[var(--pio-graphite)] leading-relaxed">
            This structure contains no non-solvent ligands within the contact cutoff.
          </p>
        </div>
      </div>
    );
  }

  const selected = ligands.find((l) => ligandKey(l) === selectedKey) ?? ligands[0];
  const ligandContacts = (analysis.contacts ?? []).filter((c) => {
    if (c.contact_type !== "protein-ligand") return false;
    const isA = c.chain_a === selected.chain_id && c.residue_a === selected.residue_number;
    const isB = c.chain_b === selected.chain_id && c.residue_b === selected.residue_number;
    return isA || isB;
  }).sort((a, b) => a.distance_angstrom - b.distance_angstrom);

  return (
    <div className="flex h-full gap-4 overflow-hidden">
      {/* ── Left: ligand list ────────────────────────────────────────────── */}
      <div className="w-[220px] shrink-0 overflow-y-auto rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] p-3 shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10)] scrollbar-thin-report">
        <p className="mb-2 px-1 text-pio-2xs font-bold uppercase tracking-widest text-[var(--pio-graphite)] opacity-60">
          {ligands.length} ligand{ligands.length !== 1 ? "s" : ""}
        </p>
        <div className="flex flex-col gap-1">
          {ligands.map((l) => {
            const key = ligandKey(l);
            const active = key === ligandKey(selected);
            const topType = INTERACTION_TYPES.find(
              (t) => (l.interaction_class_breakdown?.[t] ?? 0) > 0
            );
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                className={[
                  "w-full rounded-[10px] px-3 py-2.5 text-left transition-colors",
                  active
                    ? "bg-[rgba(199,217,236,0.6)] ring-2 ring-inset ring-[var(--pio-highlight)]"
                    : "hover:bg-[var(--pio-sand)]",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-pio-base font-bold text-[var(--pio-ink)] truncate">{l.name}</span>
                  {topType && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white"
                      style={{ background: TYPE_META[topType].color }}
                    >
                      {TYPE_META[topType].label.split(" ")[0]}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-pio-xs text-[var(--pio-graphite)] font-mono">
                  {l.chain_id}:{l.residue_number}
                </p>
                <p className="mt-0.5 text-pio-xs text-[var(--pio-graphite)]">
                  {l.protein_contact_count} protein contacts
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right: ligand detail ─────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 overflow-y-auto scrollbar-thin-report">
        <LigandDetail interaction={selected} contacts={ligandContacts} />
      </div>
    </div>
  );
}

// ── LigandDetail ──────────────────────────────────────────────────────────────

function LigandDetail({
  interaction,
  contacts,
}: {
  interaction: LigandInteractionSummary;
  contacts: ContactRecord[];
}) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Header card */}
      <div className="rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] px-6 py-5 shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-mono text-pio-4xl font-bold tracking-tight text-[var(--pio-ink)]">
              {interaction.name}
            </h2>
            <p className="mt-0.5 font-mono text-pio-md text-[var(--pio-graphite)]">
              Chain {interaction.chain_id} · Residue {interaction.residue_number}
            </p>
          </div>
          {interaction.closest_distance_angstrom != null && (
            <div className="shrink-0 rounded-[12px] bg-[var(--pio-paper)] border border-[var(--pio-line)] px-4 py-2 text-center">
              <p className="text-pio-2xs font-bold uppercase tracking-widest text-[var(--pio-graphite)] opacity-60">Closest</p>
              <p className="font-mono text-pio-2xl font-bold text-[var(--pio-ink)]">
                {interaction.closest_distance_angstrom.toFixed(2)} Å
              </p>
            </div>
          )}
        </div>

        {/* Stat row */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: interaction.contact_count },
            { label: "Protein", value: interaction.protein_contact_count },
            { label: "Water", value: interaction.water_contact_count },
            { label: "Clashes", value: interaction.possible_clash_count },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-[10px] bg-[var(--pio-paper)] border border-[var(--pio-line)] px-3 py-2 text-center">
              <p className="text-pio-2xs font-bold uppercase tracking-widest text-[var(--pio-graphite)] opacity-60">{label}</p>
              <p className="font-mono text-pio-lg font-bold text-[var(--pio-ink)]">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Interaction fingerprint */}
      <InteractionFingerprint breakdown={interaction.interaction_class_breakdown} waterBridges={interaction.water_bridge_count} />

      {/* Binding pocket */}
      {interaction.contacting_residues.length > 0 && (
        <BindingPocket residues={interaction.contacting_residues} />
      )}

      {/* Distance distribution */}
      <DistributionCard distribution={interaction.distance_distribution} total={interaction.contact_count} />

      {/* Per-contact table */}
      {contacts.length > 0 && (
        <ContactsTable contacts={contacts} ligandChain={interaction.chain_id} ligandResidue={interaction.residue_number} />
      )}
    </div>
  );
}

// ── InteractionFingerprint ────────────────────────────────────────────────────

function InteractionFingerprint({
  breakdown,
  waterBridges,
}: {
  breakdown?: Record<string, number>;
  waterBridges?: number;
}) {
  const entries = INTERACTION_TYPES.map((t) => ({ type: t, count: breakdown?.[t] ?? 0 })).filter((e) => e.count > 0);
  if (waterBridges && waterBridges > 0) {
    // show water bridges as an extra row
  }
  const total = entries.reduce((s, e) => s + e.count, 0) + (waterBridges ?? 0);

  if (total === 0) return null;

  return (
    <div className="rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] px-6 py-5 shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10)]">
      <p className="mb-4 text-pio-xs font-bold uppercase tracking-widest text-[var(--pio-graphite)] opacity-60">
        Interaction Fingerprint
      </p>

      {/* Stacked bar */}
      <div className="mb-4 flex h-4 w-full overflow-hidden rounded-full">
        {entries.map(({ type, count }) => (
          <div
            key={type}
            title={`${TYPE_META[type].label}: ${count}`}
            style={{
              width: `${(count / total) * 100}%`,
              background: TYPE_META[type].color,
              minWidth: 2,
            }}
          />
        ))}
        {waterBridges != null && waterBridges > 0 && (
          <div
            title={`Water bridge: ${waterBridges}`}
            style={{ width: `${(waterBridges / total) * 100}%`, background: "var(--pio-blue)", minWidth: 2, opacity: 0.5 }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {entries.map(({ type, count }) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TYPE_META[type].color }} />
            <span className="text-pio-xs text-[var(--pio-graphite)]">
              {TYPE_META[type].label} <strong className="text-[var(--pio-ink)]">{count}</strong>
            </span>
          </div>
        ))}
        {waterBridges != null && waterBridges > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--pio-blue)] opacity-50" />
            <span className="text-pio-xs text-[var(--pio-graphite)]">
              Water bridge <strong className="text-[var(--pio-ink)]">{waterBridges}</strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── BindingPocket ─────────────────────────────────────────────────────────────

function BindingPocket({ residues }: { residues: TopContactResidue[] }) {
  const max = residues[0]?.contact_count ?? 1;
  return (
    <div className="rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] px-6 py-5 shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10)]">
      <p className="mb-4 text-pio-xs font-bold uppercase tracking-widest text-[var(--pio-graphite)] opacity-60">
        Binding Pocket Residues ({residues.length})
      </p>
      <div className="flex flex-col gap-2">
        {residues.map((r) => {
          const pct = (r.contact_count / max) * 100;
          return (
            <div key={`${r.chain_id}-${r.residue_name}-${r.residue_number}`} className="flex items-center gap-3">
              <span className="w-[120px] shrink-0 font-mono text-pio-sm font-semibold text-[var(--pio-ink)]">
                {r.chain_id}:{r.residue_name} {r.residue_number}
              </span>
              <div className="relative flex-1 h-2 rounded-full bg-[var(--pio-paper)] border border-[var(--pio-line)] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${pct}%`, background: "var(--pio-highlight)", opacity: 0.35 + 0.65 * (pct / 100) }}
                />
              </div>
              <span className="w-6 shrink-0 text-right font-mono text-pio-xs font-bold text-[var(--pio-ink)]">
                {r.contact_count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DistributionCard ──────────────────────────────────────────────────────────

function DistributionCard({
  distribution,
  total,
}: {
  distribution: LigandInteractionSummary["distance_distribution"];
  total: number;
}) {
  const buckets = [
    { label: "< 2 Å", value: distribution.under_2_angstrom, note: "clash" },
    { label: "2–3 Å", value: distribution.two_to_3_angstrom, note: "tight" },
    { label: "3–4 Å", value: distribution.three_to_4_angstrom, note: "contact" },
    { label: "> 4 Å", value: distribution.over_4_angstrom, note: "loose" },
  ];
  const safeTotal = total || 1;

  return (
    <div className="rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] px-6 py-5 shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10)]">
      <p className="mb-4 text-pio-xs font-bold uppercase tracking-widest text-[var(--pio-graphite)] opacity-60">
        Distance Distribution
      </p>
      <div className="grid grid-cols-4 gap-3">
        {buckets.map(({ label, value, note }) => (
          <div key={label} className="rounded-[10px] bg-[var(--pio-paper)] border border-[var(--pio-line)] px-3 py-3 text-center">
            <p className="text-pio-2xs font-bold uppercase tracking-wider text-[var(--pio-graphite)] opacity-60">{label}</p>
            <p className="font-mono text-pio-2xl font-bold text-[var(--pio-ink)] mt-1">{value}</p>
            <p className="text-pio-2xs text-[var(--pio-graphite)] opacity-50">
              {value > 0 ? `${Math.round((value / safeTotal) * 100)}%` : "—"} · {note}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ContactsTable ─────────────────────────────────────────────────────────────

function ContactsTable({
  contacts,
  ligandChain,
  ligandResidue,
}: {
  contacts: ContactRecord[];
  ligandChain: string;
  ligandResidue: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW = 10;
  const shown = expanded ? contacts : contacts.slice(0, PREVIEW);

  return (
    <div className="rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10)] overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--pio-line)] flex items-center justify-between">
        <p className="text-pio-xs font-bold uppercase tracking-widest text-[var(--pio-graphite)] opacity-60">
          All Contacts ({contacts.length})
        </p>
        <span className="text-pio-xs text-[var(--pio-graphite)]">Sorted by distance</span>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[2fr_2fr_1fr_1.5fr] gap-3 px-5 py-2 bg-[rgba(199,217,236,0.12)] border-b border-[var(--pio-line)]">
        {["Residue", "Atoms", "Dist (Å)", "Type"].map((h) => (
          <span key={h} className="text-pio-2xs font-bold uppercase tracking-wider text-[var(--pio-graphite)] opacity-60">{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div>
        {shown.map((c, i) => {
          const ligIsA = c.chain_a === ligandChain && c.residue_a === ligandResidue;
          const protChain  = ligIsA ? c.chain_b : c.chain_a;
          const protResN   = ligIsA ? c.residue_name_b : c.residue_name_a;
          const protResNum = ligIsA ? c.residue_b : c.residue_a;
          const protAtom   = ligIsA ? c.atom_b : c.atom_a;
          const ligAtom    = ligIsA ? c.atom_a : c.atom_b;
          const cls = c.interaction_class;
          const meta = cls && cls !== "unclassified" ? TYPE_META[cls as InteractionType] : null;

          return (
            <div
              key={`${c.chain_a}${c.residue_a}${c.atom_a}-${c.chain_b}${c.residue_b}${c.atom_b}`}
              className={[
                "grid grid-cols-[2fr_2fr_1fr_1.5fr] gap-3 px-5 py-2.5 items-center",
                i < shown.length - 1 ? "border-b border-[var(--pio-line)]" : "",
                i % 2 === 1 ? "bg-[rgba(199,217,236,0.06)]" : "",
              ].join(" ")}
            >
              <span className="font-mono text-pio-sm font-semibold text-[var(--pio-ink)] truncate" title={`${protChain}:${protResN}${protResNum}`}>
                {protChain}:{protResN} {protResNum}
              </span>
              <span className="font-mono text-pio-xs text-[var(--pio-graphite)] truncate" title={`${protAtom}–${ligAtom}`}>
                {protAtom}–{ligAtom}
              </span>
              <span className="font-mono text-pio-sm font-bold text-[var(--pio-ink)]">
                {c.distance_angstrom.toFixed(2)}
              </span>
              <div>
                {meta ? (
                  <span
                    className={`pio-badge ${meta.badgeCls} text-pio-2xs whitespace-nowrap`}
                    style={{ padding: "2px 7px" }}
                  >
                    {meta.label}
                  </span>
                ) : (
                  <span className="text-pio-xs text-[var(--pio-graphite)] opacity-35">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expand/collapse */}
      {contacts.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--pio-line)] py-2.5 text-pio-xs font-medium text-[var(--pio-graphite)] hover:bg-[var(--pio-sand)] transition-colors"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? "Show less" : `Show ${contacts.length - PREVIEW} more`}
        </button>
      )}
    </div>
  );
}
