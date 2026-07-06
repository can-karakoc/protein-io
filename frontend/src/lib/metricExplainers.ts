// Curated, accurate plain-English explanations of the metrics a reviewer has to
// interpret. Deterministic (no LLM) — always-on, free, and never fabricated. Shown
// inline via the MetricInfo popover next to each metric.

export type MetricKey =
  | "plddt"
  | "pae"
  | "iptm"
  | "ptm"
  | "interface_confidence"
  | "interface_bsa"
  | "ipae"
  | "druggability"
  | "trust_label"
  | "possible_clash"
  | "secondary_structure"
  | "cdr";

export type MetricExplainer = {
  label: string;
  what: string;      // what the number is
  read: string;      // how to interpret it
};

export const METRIC_EXPLAINERS: Record<MetricKey, MetricExplainer> = {
  plddt: {
    label: "pLDDT",
    what: "Per-residue predicted confidence (0–100) the model reports for its own coordinates.",
    read: "≥90 very high · 70–90 confident · 50–70 low · <50 very low. Below 70, treat the coordinates cautiously — low-pLDDT loops are often wrong or disordered.",
  },
  pae: {
    label: "PAE",
    what: "Predicted Aligned Error (Å): the model's expected position error between each pair of residues.",
    read: "Low PAE (dark) = confident relative placement; high PAE (light) means two regions may be mis-positioned relative to each other even when local pLDDT is high — the key signal for domain/chain arrangement.",
  },
  iptm: {
    label: "ipTM",
    what: "Interface predicted TM-score (0–1): confidence in how the chains are placed relative to each other.",
    read: "≥0.8 a confident complex · 0.6–0.8 uncertain · <0.6 the assembly/interface is unreliable. Judge multimers by ipTM, not global pLDDT.",
  },
  ptm: {
    label: "pTM",
    what: "Predicted TM-score (0–1): the model's confidence in the overall fold/topology.",
    read: "Higher = more confident global topology. For complexes, ipTM matters more than pTM.",
  },
  interface_confidence: {
    label: "Interface confidence",
    what: "A verdict (high / moderate / low) for a specific chain–chain interface, from interface pLDDT and PAE.",
    read: "Global scores can look good while an interface is weak. Verify low-confidence interfaces manually before trusting the binding mode.",
  },
  interface_bsa: {
    label: "Interface BSA",
    what: "Buried surface area (Å²): how much surface the two chains bury against each other.",
    read: "Larger buried area usually means a bigger, more specific interface — a primary signal when triaging binder designs. Computed in-house (Shrake–Rupley ΔSASA).",
  },
  ipae: {
    label: "Interface PAE",
    what: "Mean Predicted Aligned Error (Å) over the interface-residue pairs.",
    read: "Lower is better. High interface PAE means the docking geometry between the chains is uncertain, regardless of how each chain folds.",
  },
  druggability: {
    label: "Druggability",
    what: "A 0–1 geometric proxy for how enclosed and pocket-like a cavity is (volume × buriedness).",
    read: "Higher suggests a more enclosed, potentially druggable pocket. A geometric estimate (LIGSITE-style), not a validated druggability prediction.",
  },
  trust_label: {
    label: "Contact trust label",
    what: "A per-contact reliability tag derived from both partner residues' pLDDT.",
    read: "high-confidence (both ≥70) · inspect-manually (one 50–70) · low-confidence (either <50) · possible-clash (<2 Å). Low-confidence contacts may be prediction artefacts.",
  },
  possible_clash: {
    label: "Possible clashes",
    what: "Steric clashes: non-bonded atoms overlapping more than their van der Waals radii allow.",
    read: "A heavy-atom estimate (a few may be genuinely strained contacts). Many clashes indicate bad local geometry — common in low-confidence or unrelaxed predicted poses.",
  },
  secondary_structure: {
    label: "Secondary structure",
    what: "Helix / sheet / coil assigned from Cα backbone geometry.",
    read: "An in-house geometric estimate (P-SEA), computed without hydrogens or a reference — a fast approximation of DSSP-style assignment.",
  },
  cdr: {
    label: "CDR loops",
    what: "The complementarity-determining loops of an antibody variable domain, numbered by IMGT.",
    read: "CDR-H3 is the most variable and drives specificity. Numbering is from AntPack (falls back to an in-house estimate if unavailable).",
  },
};
