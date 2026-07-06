// A deterministic "review verdict": a plain-English synthesis of the *computed* metrics
// into an overall trust assessment + the specific things to inspect. Rule-based over real
// numbers — no LLM, so it is always-on, free, and can never fabricate a claim. This is the
// review-copilot idea done the trustworthy way; an LLM narration can layer on top later.

import type { AnalysisResponse } from "./types";

export type VerdictTone = "good" | "caution" | "warn";
export type VerdictPoint = { tone: VerdictTone; label: string; detail: string };
export type ReviewVerdict = { tone: VerdictTone; headline: string; points: VerdictPoint[] };

const RANK: Record<VerdictTone, number> = { good: 0, caution: 1, warn: 2 };
const worse = (a: VerdictTone, b: VerdictTone): VerdictTone => (RANK[b] > RANK[a] ? b : a);

export function buildReviewVerdict(analysis: AnalysisResponse): ReviewVerdict | null {
  const points: VerdictPoint[] = [];

  // Model confidence (pLDDT) — present for predicted models.
  const conf = analysis.confidence;
  if (conf) {
    const avg = conf.average_plddt;
    const low = (conf.low_count ?? 0) + (conf.very_low_count ?? 0);
    const tone: VerdictTone = avg >= 70 ? "good" : avg >= 50 ? "caution" : "warn";
    points.push({
      tone,
      label: "Model confidence",
      detail: `Average pLDDT ${avg.toFixed(0)} across ${conf.residue_count.toLocaleString()} residues${low ? `; ${low.toLocaleString()} below 70 — interpret those regions cautiously` : ""}.`,
    });
  }

  // Interface confidence (multimers).
  const pairs = analysis.interface_analysis?.chain_pairs ?? [];
  const lowIfaces = pairs.filter((p) => p.interface_confidence === "low");
  const modIfaces = pairs.filter((p) => p.interface_confidence === "moderate");
  if (lowIfaces.length) {
    const p = lowIfaces[0];
    points.push({
      tone: "warn",
      label: `Interface ${p.chain_a}|${p.chain_b}`,
      detail: `Low interface confidence${p.interface_pae != null ? ` (iPAE ${p.interface_pae.toFixed(1)} Å)` : ""} — verify this interface manually.`,
    });
  } else if (modIfaces.length) {
    points.push({ tone: "caution", label: "Interfaces", detail: `${modIfaces.length} interface${modIfaces.length > 1 ? "s" : ""} at moderate confidence — worth inspecting.` });
  }

  // Steric clashes.
  const clashes = analysis.interaction_summary?.possible_clash_count ?? 0;
  if (clashes > 0) {
    points.push({ tone: "warn", label: "Possible clashes", detail: `${clashes} contact${clashes > 1 ? "s" : ""} under 2.0 Å — check for steric clashes.` });
  }

  // Ligand physical validity.
  const badLigs = (analysis.ligand_validity ?? []).filter((v) => v.pb_valid === false);
  if (badLigs.length) {
    const names = badLigs.map((v) => v.name).slice(0, 3).join(", ");
    points.push({ tone: "warn", label: "Ligand pose", detail: `${badLigs.length} ligand${badLigs.length > 1 ? "s" : ""} fail PoseBusters (${names}) — the pose may be physically invalid.` });
  }

  // Positive signals — top pocket + antibody context.
  const topPocket = (analysis.pockets ?? [])[0];
  if (topPocket) {
    points.push({ tone: "good", label: "Top pocket", detail: `Pocket #${topPocket.rank}: ${Math.round(topPocket.volume_angstrom3).toLocaleString()} Å³, druggability ${topPocket.druggability.toFixed(2)}.` });
  }
  const abChains = analysis.antibody?.chains ?? [];
  if (abChains.length) {
    const vh = abChains.filter((c) => c.domain_type === "VH").length;
    const vl = abChains.filter((c) => c.domain_type === "VL").length;
    const parts = [vh ? `${vh} VH` : "", vl ? `${vl} VL` : ""].filter(Boolean).join(" + ");
    points.push({ tone: "good", label: "Antibody", detail: `${parts} domain${abChains.length > 1 ? "s" : ""} detected; CDRs numbered (IMGT).` });
  }

  if (!points.length) return null;

  const tone = points.reduce((acc, p) => worse(acc, p.tone), "good" as VerdictTone);
  const concerns = points.filter((p) => p.tone !== "good").length;
  const headline =
    tone === "warn"
      ? `Review needed — ${concerns} thing${concerns > 1 ? "s" : ""} to check before trusting this structure.`
      : tone === "caution"
        ? "Mostly solid — a few things worth inspecting."
        : "No major concerns flagged in the computed metrics.";

  return { tone, headline, points };
}
