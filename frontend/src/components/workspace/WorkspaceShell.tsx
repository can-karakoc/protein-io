"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftRight, Bot, ChevronsLeft, Download, Menu, Moon, Sun, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BatchWorkspace } from "@/components/workbench/BatchWorkspace";
import { ChatWorkspace } from "@/components/workbench/ChatWorkspace";
import { StructureViewer } from "@/components/viewer/StructureViewer";
import { useTheme } from "@/hooks/useTheme";
import {
  FP_ABBR,
  FP_CLASSES,
  FP_DOT_COLOR,
  FP_FULL_LABEL,
  buildFingerprint,
} from "@/lib/fingerprint";
import type {
  ContactRecord,
  LigandInteractionSummary,
  LigandSummary,
} from "@/lib/types";
import { buildApiUrl } from "@/lib/api";
import { ligandInteractionsToCsv, ligandMedchemReportToCsv } from "@/lib/csv";
import type { RcsbAnalysisResponse } from "@/lib/types";
import type { AppMode } from "@/lib/workspaceStore";
import { useWorkspace } from "@/lib/workspaceStore";

import { ChatDrawer, ChatDrawerToggle } from "./ChatDrawer";
import { ContextPanel } from "./ContextPanel";
import { StructureTray } from "./StructureTray";

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Interaction class badge map ───────────────────────────────────────────────

const INTERACTION_CLASS_BADGE: Record<string, { cls: string; label: string }> = {
  "h-bond":       { cls: "pio-badge-predicted", label: "H-bond" },
  "salt-bridge":  { cls: "pio-badge-caution",   label: "salt bridge" },
  "aromatic":     { cls: "pio-badge-metadata",  label: "aromatic" },
  "pi-cation":    { cls: "pio-badge-metadata",  label: "π-cation" },
  "hydrophobic":  { cls: "pio-badge-active",    label: "hydrophobic" },
  "halogen-bond": { cls: "pio-badge-warning",   label: "halogen" },
};

// ── Ligand Fingerprint Matrix ─────────────────────────────────────────────────

function LigandFingerprintMatrix({
  contacts,
  ligand,
}: {
  contacts: ContactRecord[];
  ligand: { chain_id: string; residue_number: string };
}) {
  const TEXT: React.CSSProperties = { color: "var(--pio-highlight)" };
  const MONO: React.CSSProperties = { fontFamily: "var(--font-pio-mono)", color: "var(--pio-highlight)" };
  const rows = buildFingerprint(contacts, ligand);
  if (rows.length === 0) return null;

  return (
    <div>
      <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.1em", ...TEXT, opacity: 0.5, marginBottom: 5 }}>
        INTERACTION FINGERPRINT
      </p>
      <div style={{ background: "var(--pio-fp-table-bg)", borderRadius: 6, overflow: "hidden" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "80px repeat(6, 1fr)",
          padding: "4px 8px",
          borderBottom: "1px solid var(--pio-fp-table-divider)",
          background: "var(--pio-fp-table-header-bg)",
          alignItems: "center",
        }}>
          <span className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.06em", ...TEXT, opacity: 0.45 }}>RESIDUE</span>
          {FP_CLASSES.map((cls) => (
            <div key={cls} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: FP_DOT_COLOR[cls], opacity: 0.85 }} />
              <span className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.04em", ...TEXT, opacity: 0.55 }}>
                {FP_ABBR[cls]}
              </span>
            </div>
          ))}
        </div>
        {rows.map((row, i) => (
          <div
            key={row.key}
            style={{
              display: "grid",
              gridTemplateColumns: "80px repeat(6, 1fr)",
              padding: "3px 8px",
              borderBottom: i < rows.length - 1 ? "1px solid var(--pio-fp-table-row-divider)" : "none",
              background: i % 2 === 1 ? "var(--pio-fp-table-stripe)" : "transparent",
              alignItems: "center",
              minHeight: 22,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
              <span className="text-pio-3xs" style={{ ...MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.key}>
                {row.key}
              </span>
              <span className="text-pio-3xs" style={{ ...TEXT, opacity: 0.4, flexShrink: 0 }}>({row.count})</span>
            </div>
            {FP_CLASSES.map((cls) => (
              <div key={cls} style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                {row.classes.has(cls) ? (
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: FP_DOT_COLOR[cls] }} />
                ) : (
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--pio-fp-table-divider)" }} />
                )}
              </div>
            ))}
          </div>
        ))}
        <div style={{ padding: "4px 8px 5px", borderTop: "1px solid var(--pio-fp-table-divider)", display: "flex", flexWrap: "wrap", gap: "3px 10px" }}>
          {FP_CLASSES.map((cls) => (
            <span key={cls} className="text-pio-3xs" style={{ display: "flex", alignItems: "center", gap: 3, ...TEXT, opacity: 0.55 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: FP_DOT_COLOR[cls], flexShrink: 0 }} />
              {FP_FULL_LABEL[cls]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Floating Ligand Panel ─────────────────────────────────────────────────────

function FloatingLigandPanel({
  ligand,
  interaction,
  contacts,
  viewerRef,
  onClose,
  onExport,
}: {
  ligand: LigandSummary;
  interaction: LigandInteractionSummary | null;
  contacts: ContactRecord[];
  viewerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onExport: (i: LigandInteractionSummary) => void;
}) {
  const [minimized, setMinimized] = useState(false);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 });
  const [containerW, setContainerW] = useState(400);
  const [containerH, setContainerH] = useState(600);
  const dragging = useRef(false);
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);

  const MAX_PANEL_W = 327;
  const SIDE_PAD = 6;
  const PANEL_BODY_H = 420;
  const PANEL_HEADER_H = 40;
  const PANEL_W = Math.min(MAX_PANEL_W, containerW - 2 * SIDE_PAD);

  useEffect(() => {
    const container = viewerRef.current;
    if (!container) return;
    setContainerW(container.offsetWidth);
    setContainerH(container.offsetHeight);
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0].contentRect.width);
      setContainerH(entries[0].contentRect.height);
    });
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
    const pw = Math.min(MAX_PANEL_W, rect.width - 2 * SIDE_PAD);
    setPos({
      x: clamp(e.clientX - dragOffset.current.dx, SIDE_PAD, rect.width - pw - SIDE_PAD),
      y: clamp(e.clientY - dragOffset.current.dy, SIDE_PAD, rect.height - PANEL_HEADER_H - PANEL_BODY_H - SIDE_PAD),
    });
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

  // Re-clamp on expand / resize using stable fixed panel height
  useEffect(() => {
    if (minimized) return;
    const container = viewerRef.current;
    if (!container) return;
    const panelH = PANEL_HEADER_H + PANEL_BODY_H;
    setPos((p) => ({
      x: clamp(p.x, SIDE_PAD, container.offsetWidth - PANEL_W - SIDE_PAD),
      y: clamp(p.y, SIDE_PAD, container.offsetHeight - panelH - SIDE_PAD),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimized, containerW, containerH]);

  const buckets = interaction?.distance_distribution ?? {
    under_2_angstrom: 0, two_to_3_angstrom: 0,
    three_to_4_angstrom: 0, over_4_angstrom: 0,
  };

  const ligandContacts = contacts
    .filter((c) => {
      if (c.contact_type !== "protein-ligand") return false;
      const ligIsA = c.chain_a === ligand.chain_id && c.residue_a === ligand.residue_number;
      const ligIsB = c.chain_b === ligand.chain_id && c.residue_b === ligand.residue_number;
      return ligIsA || ligIsB;
    })
    .sort((a, b) => a.distance_angstrom - b.distance_angstrom);

  const CONTACTS_PREVIEW = 5;
  const shownContacts = showAllContacts ? ligandContacts : ligandContacts.slice(0, CONTACTS_PREVIEW);
  const TEXT: React.CSSProperties = { color: "var(--pio-highlight)" };
  const MONO: React.CSSProperties = { fontFamily: "var(--font-pio-mono)", color: "var(--pio-highlight)" };

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
        background: "var(--pio-fp-bg)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderRadius: 16,
        border: "1px solid var(--pio-fp-border)",
        boxShadow: "var(--pio-fp-shadow)",
        overflow: "hidden",
        zIndex: 30,
        userSelect: "none",
      }}
    >
      {/* Drag handle header */}
      <div
        onMouseDown={startDrag}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", cursor: "grab" }}
      >
        <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.08em", ...TEXT }}>
          {minimized ? `LIGAND DETAILS — ${ligand.name} ${ligand.chain_id}:${ligand.residue_number}` : "LIGAND DETAILS"}
        </p>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              setMinimized((m) => !m);
            }}
            style={{ width: 14, height: 14, borderRadius: "50%", background: minimized ? "#4A724C" : "#C09040", border: "none", cursor: "pointer" }}
            title={minimized ? "Expand" : "Minimize"}
          />
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            style={{ width: 14, height: 14, borderRadius: "50%", background: "#6E2A1C", border: "none", cursor: "pointer" }}
            title="Close"
          />
        </div>
      </div>

      {/* Collapsible body */}
      <AnimatePresence initial={false}>
        {!minimized && (
          <motion.div
            key="panel-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: PANEL_BODY_H, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            style={{ overflow: "clip", paddingTop: 8, paddingBottom: 8, display: "flex", flexDirection: "column" }}
          >
            <div className="scrollbar-thin-panel" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Ligand heading */}
                <div style={{ borderBottom: "1px solid var(--pio-fp-divider)", paddingBottom: 10 }}>
                  <p className="text-pio-3xl" style={{ ...MONO, fontWeight: 700, letterSpacing: "-0.01em" }}>
                    {ligand.name} {ligand.chain_id}:{ligand.residue_number}
                  </p>
                </div>

                {/* Identity */}
                <div>
                  <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.1em", ...TEXT, opacity: 0.5, marginBottom: 5 }}>IDENTITY</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    {[["CHAIN", ligand.chain_id], ["RESIDUE", ligand.residue_number], ["ATOMS", String(ligand.atom_count)]].map(([label, value]) => (
                      <div key={label} style={{ background: "var(--pio-fp-card-bg)", borderRadius: 2, padding: "8px 10px" }}>
                        <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.08em", ...TEXT, opacity: 0.65 }}>{label}</p>
                        <p className="text-pio-lg" style={{ ...MONO, fontWeight: 700, marginTop: 2 }}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contact counts */}
                <div>
                  <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.1em", ...TEXT, opacity: 0.5, marginBottom: 5 }}>CONTACT COUNTS</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    {[
                      ["PROTEIN", String(interaction?.protein_contact_count ?? 0)],
                      ["WATER", String(interaction?.water_contact_count ?? 0)],
                      ["VERY CLOSE", String(interaction?.possible_clash_count ?? 0)],
                    ].map(([label, value]) => (
                      <div key={label} style={{ background: "var(--pio-fp-card-bg)", borderRadius: 2, padding: "8px 10px" }}>
                        <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.08em", ...TEXT, opacity: 0.65 }}>{label}</p>
                        <p className="text-pio-lg" style={{ ...MONO, fontWeight: 700, marginTop: 2 }}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Geometry */}
                <div>
                  <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.1em", ...TEXT, opacity: 0.5, marginBottom: 5 }}>GEOMETRY</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <div style={{ background: "var(--pio-fp-card-bg)", borderRadius: 2, padding: "8px 10px" }}>
                      <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.08em", ...TEXT, opacity: 0.65 }}>CLOSEST CONTACT</p>
                      {interaction?.closest_contact && interaction.closest_distance_angstrom != null ? (
                        <>
                          <p className="text-pio-xl" style={{ ...MONO, fontWeight: 700, marginTop: 2 }}>
                            {interaction.closest_distance_angstrom.toFixed(3)} Å
                          </p>
                          <p className="text-pio-3xs" style={{ ...MONO, opacity: 0.7, marginTop: 2 }}>
                            {interaction.closest_contact.atom_a}–{interaction.closest_contact.atom_b}
                          </p>
                        </>
                      ) : (
                        <p className="text-pio-base" style={{ ...TEXT, marginTop: 2, opacity: 0.6 }}>—</p>
                      )}
                    </div>
                    <div style={{ background: "var(--pio-fp-card-bg)", borderRadius: 2, padding: "8px 10px" }}>
                      <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.08em", ...TEXT, opacity: 0.65 }}>DISTANCE BUCKETS</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 6px", marginTop: 4 }}>
                        {[
                          ["<2 Å", buckets.under_2_angstrom],
                          ["2–3 Å", buckets.two_to_3_angstrom],
                          ["3–4 Å", buckets.three_to_4_angstrom],
                          [">4 Å", buckets.over_4_angstrom],
                        ].map(([label, val]) => (
                          <div key={String(label)} style={{ display: "flex", justifyContent: "space-between" }}>
                            <span className="text-pio-3xs" style={{ ...TEXT, opacity: 0.65 }}>{label}</span>
                            <span className="text-pio-3xs" style={{ ...MONO, fontWeight: 700 }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contacting residue chips */}
                {interaction?.contacting_residues && interaction.contacting_residues.length > 0 && (
                  <div>
                    <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.1em", ...TEXT, opacity: 0.5, marginBottom: 5 }}>CONTACTING RESIDUES</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {interaction.contacting_residues.map((r) => (
                        <span
                          key={`${r.chain_id}-${r.residue_name}-${r.residue_number}`}
                          style={{ background: "var(--pio-fp-tag-bg)", borderRadius: 9, padding: "3px 8px", fontFamily: "var(--font-pio-mono)", fontWeight: 500, color: "var(--pio-highlight)" }}
                        >
                          {r.chain_id}:{r.residue_name}{r.residue_number} ({r.contact_count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Interaction types */}
                {interaction && (
                  (interaction.interaction_class_breakdown && Object.keys(interaction.interaction_class_breakdown).length > 0) ||
                  (interaction.water_bridge_count != null && interaction.water_bridge_count > 0)
                ) && (
                  <div>
                    <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.1em", ...TEXT, opacity: 0.5, marginBottom: 5 }}>INTERACTION TYPES</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {(["h-bond", "salt-bridge", "aromatic", "pi-cation", "hydrophobic", "halogen-bond"] as const).map((cls) => {
                        const count = interaction.interaction_class_breakdown?.[cls];
                        if (!count) return null;
                        const badge = INTERACTION_CLASS_BADGE[cls];
                        if (!badge) return null;
                        return (
                          <span key={cls} className={`pio-badge ${badge.cls}`} style={{ padding: "2px 8px", whiteSpace: "nowrap", fontFamily: "var(--font-pio-mono)", fontSize: "var(--text-pio-xs)" }}>
                            {badge.label}<span style={{ opacity: 0.8, fontWeight: 700, marginLeft: 3 }}>{count}</span>
                          </span>
                        );
                      })}
                      {interaction.water_bridge_count != null && interaction.water_bridge_count > 0 && (
                        <span className="pio-badge pio-badge-warning" style={{ padding: "2px 8px", whiteSpace: "nowrap", fontFamily: "var(--font-pio-mono)", fontSize: "var(--text-pio-xs)" }}>
                          water bridge <span style={{ opacity: 0.8, fontWeight: 700, marginLeft: 3 }}>{interaction.water_bridge_count}</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Per-contact table */}
                {ligandContacts.length > 0 && (
                  <div>
                    <p className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.1em", ...TEXT, opacity: 0.5, marginBottom: 5 }}>
                      CONTACTS ({ligandContacts.length})
                    </p>
                    <div style={{ background: "var(--pio-fp-table-bg)", borderRadius: 6, overflow: "hidden" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(65px,1fr) minmax(55px,0.8fr) 44px minmax(85px,1.3fr)", gap: 6, padding: "5px 12px", borderBottom: "1px solid var(--pio-fp-table-divider)", background: "var(--pio-fp-table-header-bg)" }}>
                        {(["RESIDUE", "ATOMS", "DIST", "TYPE"] as const).map((h) => (
                          <span key={h} className="text-pio-3xs" style={{ fontWeight: 700, letterSpacing: "0.08em", ...TEXT, opacity: 0.55, textAlign: "left", display: "block" }}>{h}</span>
                        ))}
                      </div>
                      {shownContacts.map((c, i) => {
                        const ligIsA = c.chain_a === ligand.chain_id && c.residue_a === ligand.residue_number;
                        const protChain  = ligIsA ? c.chain_b : c.chain_a;
                        const protResN   = ligIsA ? c.residue_name_b : c.residue_name_a;
                        const protResNum = ligIsA ? c.residue_b : c.residue_a;
                        const protAtom   = ligIsA ? c.atom_b : c.atom_a;
                        const ligAtom    = ligIsA ? c.atom_a : c.atom_b;
                        const cls = c.interaction_class;
                        const badge = cls && cls !== "unclassified" ? INTERACTION_CLASS_BADGE[cls] : null;
                        return (
                          <div
                            key={`${c.chain_a}${c.residue_a}${c.atom_a}-${c.chain_b}${c.residue_b}${c.atom_b}`}
                            style={{ display: "grid", gridTemplateColumns: "minmax(65px,1fr) minmax(55px,0.8fr) 44px minmax(85px,1.3fr)", alignItems: "center", gap: 6, padding: "5px 12px", borderBottom: i < shownContacts.length - 1 ? "1px solid var(--pio-fp-table-row-divider)" : "none", background: i % 2 === 1 ? "var(--pio-fp-table-stripe)" : "transparent" }}
                          >
                            <span className="text-pio-3xs" style={{ ...MONO, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${protChain}:${protResN}${protResNum}`}>
                              {protChain}:{protResN}{protResNum}
                            </span>
                            <span className="text-pio-3xs" style={{ ...MONO, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${protAtom}–${ligAtom}`}>
                              {protAtom}–{ligAtom}
                            </span>
                            <span className="text-pio-3xs" style={{ ...MONO, fontWeight: 600, whiteSpace: "nowrap" }}>
                              {c.distance_angstrom.toFixed(2)} Å
                            </span>
                            {/* justifySelf:start stops the grid item from blockifying to full cell width */}
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-start", justifySelf: "start" }}>
                              {badge ? (
                                <span className={`pio-badge ${badge.cls}`} style={{ padding: "1px 6px", whiteSpace: "nowrap", fontFamily: "var(--font-pio-mono)", fontSize: "10px" }}>
                                  {badge.label}
                                </span>
                              ) : (
                                <span className="text-pio-3xs" style={{ ...TEXT, opacity: 0.35 }}>—</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {ligandContacts.length > CONTACTS_PREVIEW && (
                      <button
                        type="button"
                        onClick={() => setShowAllContacts((v) => !v)}
                        style={{ marginTop: 4, width: "100%", fontWeight: 600, ...TEXT, opacity: 0.6, background: "none", border: "none", cursor: "pointer", textAlign: "center", padding: "3px 0" }}
                      >
                        {showAllContacts ? "Show fewer ↑" : `Show all ${ligandContacts.length} contacts ↓`}
                      </button>
                    )}
                  </div>
                )}

                {/* Fingerprint matrix */}
                <LigandFingerprintMatrix contacts={contacts} ligand={ligand} />

                {/* Export buttons */}
                {interaction && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => onExport(interaction)}
                      style={{ background: "var(--pio-fp-btn-primary-bg)", border: "1px solid var(--pio-fp-btn-primary-border)", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 600, ...TEXT, cursor: "pointer" }}
                    >
                      <Download size={13} />
                      Export ligand CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const csv = ligandMedchemReportToCsv(interaction, contacts);
                        downloadCsv(csv, `${ligand.name}-${ligand.chain_id}${ligand.residue_number}-medchem-report.csv`);
                      }}
                      style={{ background: "var(--pio-fp-btn-secondary-bg)", border: "1px solid var(--pio-fp-btn-secondary-border)", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 600, ...TEXT, cursor: "pointer", opacity: 0.85 }}
                    >
                      <Download size={13} />
                      Medchem report CSV
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Top navigation ────────────────────────────────────────────────────────────

const APP_MODES: Array<{ id: AppMode; label: string }> = [
  { id: "workspace", label: "Explore" },
  { id: "batch", label: "Batch" },
];

function WorkspaceTopNav() {
  const { mode, setMode } = useWorkspace();
  const { theme, toggle } = useTheme();

  return (
    <header className="pio-topnav sticky top-0 z-50">
      <div className="mx-auto flex h-[44px] w-full max-w-[1500px] items-center px-4 sm:px-8">
        <nav className="flex h-full items-center gap-1 sm:gap-6" aria-label="App mode">
          {APP_MODES.map((m) => {
            const isActive = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={[
                  "flex h-[34px] items-center rounded-[12px] px-3 sm:px-5 text-pio-base sm:text-pio-md font-semibold transition-colors",
                  isActive
                    ? "bg-[var(--pio-highlight)] text-[var(--pio-highlight-text)]"
                    : "bg-[rgba(26,64,106,0.04)] text-[var(--pio-ink)] opacity-70 hover:opacity-100 hover:bg-[rgba(26,64,106,0.09)]",
                ].join(" ")}
              >
                {m.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-6">
          {mode === "workspace" && <ChatDrawerToggle />}
          <a
            href="https://github.com/can-karakoc/protein-io/tree/main/docs"
            target="_blank"
            rel="noreferrer"
            className="text-pio-xs sm:text-pio-md font-medium text-[var(--pio-ink)] opacity-50 transition-opacity hover:opacity-80"
          >
            Docs
          </a>
          <a
            href="https://github.com/can-karakoc/protein-io"
            target="_blank"
            rel="noreferrer"
            className="text-pio-xs sm:text-pio-md font-medium text-[var(--pio-ink)] opacity-50 transition-opacity hover:opacity-80"
          >
            GitHub
          </a>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-[var(--pio-line-strong)] bg-[var(--pio-white)] text-[var(--pio-ink)] opacity-70 transition-colors hover:opacity-100 hover:bg-[var(--pio-sand)]"
          >
            <span key={theme} className="theme-toggle-icon">
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

// ── Collapsed tray mini-strip ─────────────────────────────────────────────────

function TrayMini({ onExpand }: { onExpand: () => void }) {
  const { structures } = useWorkspace();
  return (
    <div
      className="flex flex-col items-center h-full py-3 gap-3"
      style={{ borderRight: "1px solid var(--pio-line)", background: "var(--pio-white)" }}
    >
      <button
        type="button"
        onClick={onExpand}
        className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--pio-graphite)] hover:bg-[var(--pio-sky)] hover:text-[var(--pio-ink)] transition-colors"
        title="Expand structure panel"
      >
        <Menu size={15} />
      </button>
      <div className="flex flex-col items-center gap-2">
        {structures.slice(0, 6).map((s) => (
          <div
            key={s.id}
            title={s.pdbId || s.uniprotId || s.name || "Structure"}
            className="flex h-8 w-8 items-center justify-center rounded-[8px]"
            style={{
              background: "rgba(199,217,236,0.5)",
              color: "var(--pio-highlight)",
              fontFamily: "var(--font-pio-mono)",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            {(s.pdbId || s.uniprotId || s.name || "?").slice(0, 4).toUpperCase()}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Workspace 3-column layout ─────────────────────────────────────────────────

function WorkspaceLayout() {
  const { getActive, updateStructure, selection, setSelection, floatingLigandKey, setFloatingLigandKey, hasHydrated, chatOpen } = useWorkspace();
  const active = getActive();
  const viewerColRef = useRef<HTMLDivElement>(null);
  const [viewerColorMode, setViewerColorMode] = useState<"structure" | "plddt">("structure");
  const [trayExpanded, setTrayExpanded] = useState(true);

  // Auto-collapse when chat opens; re-expand when chat closes
  useEffect(() => {
    setTrayExpanded(!chatOpen);
  }, [chatOpen]);

  // Case A: no analysis cached → run full analysis
  useEffect(() => {
    if (!hasHydrated) return;   // wait for localStorage restore before deciding
    if (!active) return;
    if (active.analysis || active.isAnalyzing) return;
    if (active.source !== "rcsb" && active.source !== "alphafold") return;
    const accession = active.source === "rcsb" ? active.pdbId : active.uniprotId;
    if (!accession) return;

    const id = active.id;
    const cutoff = active.cutoff ?? 4;
    updateStructure(id, { isAnalyzing: true, error: null });

    const url = active.source === "rcsb"
      ? buildApiUrl(`/api/rcsb/${encodeURIComponent(accession)}/analyze?cutoff_angstrom=${cutoff}`)
      : buildApiUrl(`/api/alphafold/${encodeURIComponent(accession)}/analyze?cutoff_angstrom=${cutoff}`);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<RcsbAnalysisResponse>;
      })
      .then((wrapper) => {
        updateStructure(id, {
          analysis: wrapper.analysis,
          structureText: wrapper.structure_text ?? "",
          structureFormat: wrapper.structure_format ?? "cif",
          isAnalyzing: false,
        });
      })
      .catch((e) => {
        updateStructure(id, { isAnalyzing: false, error: e instanceof Error ? e.message : "Re-analysis failed" });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, hasHydrated]);

  // Case B: analysis cached (survived refresh) but structureText stripped to save quota
  // → re-fetch structure file only so the 3D viewer works; keep existing analysis
  useEffect(() => {
    if (!hasHydrated) return;
    if (!active) return;
    if (!active.analysis) return;        // no cached analysis — Case A handles it
    if (active.structureText) return;    // 3D viewer already has data
    if (active.isAnalyzing) return;
    if (active.source !== "rcsb" && active.source !== "alphafold") return;
    const accession = active.source === "rcsb" ? active.pdbId : active.uniprotId;
    if (!accession) return;

    const id = active.id;
    const url = active.source === "rcsb"
      ? buildApiUrl(`/api/rcsb/${encodeURIComponent(accession)}/analyze?cutoff_angstrom=${active.cutoff ?? 4}`)
      : buildApiUrl(`/api/alphafold/${encodeURIComponent(accession)}/analyze?cutoff_angstrom=${active.cutoff ?? 4}`);

    fetch(url)
      .then((res) => { if (!res.ok) throw new Error(); return res.json() as Promise<RcsbAnalysisResponse>; })
      .then((wrapper) => {
        // Only update structure text — preserve the cached analysis
        updateStructure(id, {
          structureText: wrapper.structure_text ?? "",
          structureFormat: wrapper.structure_format ?? "cif",
        });
      })
      .catch(() => { /* 3D viewer stays empty; analysis panel still shows cached data */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.analysis, hasHydrated]);

  const residueConfidences = active?.analysis?.residue_confidences ?? [];
  const effectiveColorMode: "structure" | "plddt" = residueConfidences.length > 0 ? viewerColorMode : "structure";

  // Resolve floating ligand data from the active analysis
  const floatingLigandData = useMemo(() => {
    if (!floatingLigandKey || !active?.analysis) return null;
    const [chainId, residueNumber] = floatingLigandKey.split(":");
    const ligand = active.analysis.ligands.find(
      (l) => l.chain_id === chainId && l.residue_number === residueNumber,
    );
    if (!ligand) return null;
    const interaction =
      active.analysis.ligand_interactions.find(
        (li) => li.chain_id === chainId && li.name === ligand.name,
      ) ?? null;
    return { ligand, interaction, contacts: active.analysis.contacts };
  }, [floatingLigandKey, active]);

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* Left: structure tray — collapses to mini-strip when chat is open */}
      <motion.div
        animate={{ width: trayExpanded ? 280 : 60 }}
        transition={{ type: "spring", stiffness: 500, damping: 40, mass: 0.8 }}
        className="relative z-[1] flex-shrink-0 h-full overflow-hidden shadow-[8px_0_24px_rgba(17,22,16,0.07)]"
      >
        <AnimatePresence mode="wait">
          {trayExpanded ? (
            <motion.div
              key="tray-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="h-full"
              style={{ width: 280 }}
            >
              <StructureTray onCollapse={chatOpen ? () => setTrayExpanded(false) : undefined} />
            </motion.div>
          ) : (
            <motion.div
              key="tray-mini"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="h-full"
              style={{ width: 60 }}
            >
              <TrayMini onExpand={() => setTrayExpanded(true)} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Center: Mol* viewer */}
      <div ref={viewerColRef} className="flex-1 min-w-0 h-full relative bg-[var(--pio-paper)]">
        <StructureViewer
          structureText={active?.structureText ?? ""}
          structureFormat={active?.structureFormat ?? "pdb"}
          selection={selection}
          residueConfidences={residueConfidences}
          colorMode={effectiveColorMode}
        />

        {/* pLDDT / Structure color toggle — top-right, only when confidences exist */}
        {residueConfidences.length > 0 && (
          <div className="absolute right-3 top-3 z-10 inline-flex rounded-full border border-[rgba(20,20,15,0.14)] bg-[var(--pio-white)] p-[3px]">
            {(["structure", "plddt"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewerColorMode(m)}
                className={[
                  "rounded-full px-3 py-1 text-pio-xs font-semibold transition-colors",
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

        {/* Selected pill — top-right, visible when something is selected */}
        <AnimatePresence>
          {selection && (
            <motion.div
              key="selection-pill"
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              className="absolute right-3 pointer-events-none z-10"
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
                  <p className="text-pio-3xs" style={{ fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.12em", textTransform: "uppercase", lineHeight: 1, marginBottom: 3, whiteSpace: "nowrap" }}>Selected</p>
                  <p className="text-pio-base" style={{ fontWeight: 700, color: "#fff", lineHeight: 1, whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{selection.label}</p>
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

        {/* Floating ligand panel — absolute overlay inside the viewer column */}
        <AnimatePresence>
          {floatingLigandData && (
            <FloatingLigandPanel
              key={floatingLigandKey ?? "ligand"}
              ligand={floatingLigandData.ligand}
              interaction={floatingLigandData.interaction}
              contacts={floatingLigandData.contacts}
              viewerRef={viewerColRef}
              onClose={() => setFloatingLigandKey(null)}
              onExport={(interaction) => {
                const csv = ligandInteractionsToCsv([interaction]);
                downloadCsv(csv, `${floatingLigandData.ligand.name}-${floatingLigandData.ligand.chain_id}${floatingLigandData.ligand.residue_number}-contacts.csv`);
              }}
            />
          )}
        </AnimatePresence>
      </div>{/* end viewer */}

      {/* Right: context panel */}
      <div className="relative z-[1] w-[400px] flex-shrink-0 h-full overflow-hidden shadow-[-8px_0_24px_rgba(17,22,16,0.07)]">
        <ContextPanel />
      </div>
    </div>
  );
}

// ── Shell entry point ─────────────────────────────────────────────────────────

const CARD_CLS = "overflow-hidden rounded-[16px] border border-[var(--pio-line)] bg-[var(--pio-white)] shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)]";

export function WorkspaceShell() {
  const { mode, chatOpen, setChatOpen, getActive } = useWorkspace();
  const active = getActive();

  // Chat panel state
  const [chatWidth, setChatWidth] = useState(380);
  const [chatSwapped, setChatSwapped] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const startResize = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startW: chatWidth };
  }, [chatWidth]);

  const onResizeDrag = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const delta = e.clientX - dragRef.current.startX;
    // Normal [Workspace][gap][Chat]: drag right → chat shrinks
    // Swapped [Chat][gap][Workspace]: drag right → chat grows
    const sign = chatSwapped ? 1 : -1;
    setChatWidth(Math.max(280, Math.min(600, dragRef.current.startW + sign * delta)));
  }, [chatSwapped]);

  const stopResize = useCallback(() => { dragRef.current = null; }, []);

  return (
    <main className="pio-shell pt-6">
      <WorkspaceTopNav />

      <div className="mx-auto w-full max-w-[1600px] px-4 pb-4 pt-6 h-[calc(100svh-92px)] flex gap-3">

        {/* Workspace card */}
        <div className={`flex-1 min-w-0 h-full ${CARD_CLS}`} style={{ order: chatSwapped ? 3 : 1 }}>
          {mode === "workspace" ? (
            <WorkspaceLayout />
          ) : (
            <BatchWorkspace />
          )}
        </div>

        {/* Resize handle + swap button — unified grip strip */}
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              key="resize-gap"
              initial={{ opacity: 0, scaleY: 0.6 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={{ opacity: 0, scaleY: 0.6 }}
              transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.6 }}
              className="group flex-shrink-0 flex items-center justify-center cursor-col-resize"
              style={{ order: 2, width: 20, userSelect: "none" }}
              onPointerDown={startResize}
              onPointerMove={onResizeDrag}
              onPointerUp={stopResize}
              onPointerCancel={stopResize}
            >
              {/* Unified pill: dots + swap icon all share one opacity */}
              <div className="flex flex-col items-center gap-[5px] rounded-[12px] py-3 px-[5px] transition-all opacity-30 group-hover:opacity-80 bg-transparent group-hover:bg-[var(--pio-sky)]">
                <div className="w-[4px] h-[4px] rounded-full bg-[var(--pio-graphite)]" />
                <div className="w-[4px] h-[4px] rounded-full bg-[var(--pio-graphite)]" />
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setChatSwapped(s => !s)}
                  title={chatSwapped ? "Move chat to right" : "Move chat to left"}
                  className="flex items-center justify-center text-[var(--pio-graphite)] cursor-pointer my-[1px]"
                >
                  <ArrowLeftRight size={10} />
                </button>
                <div className="w-[4px] h-[4px] rounded-full bg-[var(--pio-graphite)]" />
                <div className="w-[4px] h-[4px] rounded-full bg-[var(--pio-graphite)]" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat card — same styling as workspace card */}
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              key="chat-card"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: chatWidth }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ type: "spring", stiffness: 460, damping: 38, mass: 0.8 }}
              className={`h-full flex-shrink-0 flex flex-col ${CARD_CLS}`}
              style={{ order: chatSwapped ? 1 : 3 }}
            >
              {/* Chat header */}
              <div className="flex items-center justify-between px-4 flex-shrink-0 border-b border-[var(--pio-line)]" style={{ height: 52 }}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(199,217,236,0.4)" }}>
                    <Bot size={13} style={{ color: "var(--pio-highlight)" }} />
                  </div>
                  <p className="text-pio-sm font-bold text-[var(--pio-ink)] shrink-0">AI Chat</p>
                  {active && (
                    <span className="text-pio-3xs font-semibold text-[var(--pio-graphite)] truncate" style={{ background: "var(--pio-sky)", borderRadius: 6, padding: "2px 8px", maxWidth: 140 }}>
                      {active.pdbId || active.uniprotId || active.name}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--pio-graphite)] hover:bg-[var(--pio-line)] hover:text-[var(--pio-ink)] transition-colors"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Chat content */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <ChatWorkspace
                  analysis={active?.analysis ?? null}
                  compareEntry={null}
                  onFocusExplore={() => setChatOpen(false)}
                  embedded
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </main>
  );
}
