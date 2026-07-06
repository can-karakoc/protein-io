// A citable, versioned methods & provenance report (Markdown) for one analysis. Lists
// only the methods actually used, with a one-line description, the installed tool
// versions, and literature references — so a result can be reproduced and cited.

import type { AnalysisResponse } from "./types";
import type { StructureEntry } from "./workspaceStore";

export type ToolVersions = Record<string, string | null>;

// Curated references. Keep accurate — these are cited in published work.
const REFS: Record<string, string> = {
  gemmi: "Wojdyr, M. (2022). GEMMI: A library for structural biology. Journal of Open Source Software, 7(73), 4200.",
  psea: "Labesse, G., Colloc'h, N., Pothier, J., & Mornon, J.-P. (1997). P-SEA: a new efficient assignment of secondary structure from Cα trace of proteins. CABIOS, 13(3), 291–295.",
  ligsite: "Hendlich, M., Rippmann, F., & Barnickel, G. (1997). LIGSITE: automatic and efficient detection of potential small molecule-binding sites in proteins. Journal of Molecular Graphics and Modelling, 15(6), 359–363. Extended by Huang, B. & Schroeder, M. (2006), BMC Structural Biology, 6, 19.",
  sasa: "Shrake, A., & Rupley, J. A. (1973). Environment and exposure to solvent of protein atoms. Lysozyme and insulin. Journal of Molecular Biology, 79(2), 351–371.",
  posebusters: "Buttenschoen, M., Morris, G. M., & Deane, C. M. (2024). PoseBusters: AI-based docking methods fail to generate physically valid poses or generalise to novel sequences. Chemical Science, 15(9), 3130–3139.",
  rdkit: "RDKit: Open-source cheminformatics. https://www.rdkit.org",
  antpack: "AntPack — antibody sequence numbering (Parkinson, J. et al.). https://pypi.org/project/antpack/",
  imgt: "Lefranc, M.-P., et al. (2003). IMGT unique numbering for immunoglobulin and T cell receptor variable domains. Developmental & Comparative Immunology, 27(1), 55–77.",
  foldseek: "van Kempen, M., et al. (2024). Fast and accurate protein structure search with Foldseek. Nature Biotechnology, 42(2), 243–246.",
  alphafold: "Jumper, J., et al. (2021). Highly accurate protein structure prediction with AlphaFold. Nature, 596(7873), 583–589.",
};

type Method = { name: string; detail: string; refs?: string[] };

export function buildMethodsReport(entry: StructureEntry, analysis: AnalysisResponse, versions: ToolVersions): string {
  const meta = analysis.metadata;
  const sourceId = meta?.pdb_id || meta?.uniprot_id || entry.name || "structure";
  const predicted = !!analysis.confidence && (meta?.source === "alphafold" || meta?.source === "boltz" || meta?.source === "chai");

  const methods: Method[] = [
    { name: "Structure parsing", detail: "Coordinates parsed with Gemmi (PDB / mmCIF).", refs: ["gemmi"] },
    { name: "Contact detection", detail: `Distance-based heavy-atom contacts within ${entry.cutoff} Å using a Gemmi neighbour search (in-house).` },
    { name: "Interaction classification", detail: "Contacts classified into H-bonds, salt bridges, aromatic, π-cation, hydrophobic and halogen bonds by an in-house geometric rule set (PLIP-equivalent)." },
  ];
  if (analysis.confidence) methods.push({ name: "Confidence (pLDDT)", detail: "Per-residue pLDDT read from the model; contacts annotated with a trust label from both partners' pLDDT (in-house)." });
  if (analysis.pae) methods.push({ name: "Interface PAE / iPTM", detail: "Interface and cross-chain PAE summarised from the supplied PAE matrix; iPTM/pTM read from the confidence sidecar (in-house)." });
  if (analysis.secondary_structure) methods.push({ name: "Secondary structure", detail: "Helix / sheet / coil assigned from Cα geometry by an in-house P-SEA implementation.", refs: ["psea"] });
  if (analysis.interface_analysis?.chain_pairs?.some((p) => p.interface_bsa != null)) methods.push({ name: "Interface buried surface area", detail: "ΔSASA per chain pair from an in-house Shrake–Rupley solvent-accessible surface area calculation.", refs: ["sasa"] });
  if (analysis.pockets?.length) methods.push({ name: "Binding pockets", detail: "Cavities detected by an in-house LIGSITE-style grid enclosure scan (numpy + scipy).", refs: ["ligsite"] });
  if (analysis.ligand_validity?.length) methods.push({ name: "Ligand physical validity", detail: "Bound-ligand poses checked with PoseBusters; chemistry (SMILES, descriptors, QED, Lipinski, PAINS) via RDKit.", refs: ["posebusters", "rdkit"] });
  if (analysis.antibody?.chains?.length) methods.push({ name: "Antibody numbering", detail: "Variable domains numbered (IMGT) and CDR loops assigned with AntPack; falls back to an in-house reference-alignment estimate if unavailable.", refs: ["antpack", "imgt"] });
  if (entry.foldseekResult) methods.push({ name: "Structural similarity", detail: "Similar folds retrieved with a Foldseek search against PDB100 / AFDB50.", refs: ["foldseek"] });
  if (meta?.source === "alphafold") methods.push({ name: "Model source", detail: "Predicted model retrieved from the AlphaFold Protein Structure Database.", refs: ["alphafold"] });

  // Collect the reference keys actually used, in first-appearance order.
  const usedRefs: string[] = [];
  for (const m of methods) for (const r of m.refs ?? []) if (!usedRefs.includes(r)) usedRefs.push(r);

  const verRows = Object.entries(versions)
    .filter(([, val]) => val)
    .map(([k, val]) => `| ${k === "app" ? "Protein I/O" : k} | ${val} |`)
    .join("\n");

  const L: string[] = [];
  L.push(`# Methods & Provenance — ${sourceId}`);
  L.push("");
  L.push(`*Generated by Protein I/O on ${new Date().toISOString()}.*`);
  L.push("");
  L.push("## Input");
  L.push("");
  L.push(`- **Source:** ${entry.source}${sourceId ? ` (${sourceId})` : ""}`);
  L.push(`- **Format:** ${entry.structureFormat === "cif" ? "mmCIF" : "PDB"}`);
  L.push(`- **Structure type:** ${predicted ? "Predicted model" : meta?.source === "rcsb" ? "Experimental" : "Uploaded coordinates"}`);
  L.push(`- **Contact distance cutoff:** ${entry.cutoff} Å`);
  L.push(`- **PAE sidecar:** ${analysis.pae ? "provided" : "not provided"}`);
  L.push("");
  L.push("## Methods");
  L.push("");
  L.push("All metrics are computed in-house on CPU — no structure-prediction or docking models are run, and no external binaries are used (RDKit and PoseBusters are pip-installed CPU-only libraries; AntPack is a pip wheel).");
  L.push("");
  for (const m of methods) {
    const marks = (m.refs ?? []).map((r) => `[${usedRefs.indexOf(r) + 1}]`).join("");
    L.push(`- **${m.name}.** ${m.detail}${marks ? ` ${marks}` : ""}`);
  }
  L.push("");
  if (verRows) {
    L.push("## Software versions");
    L.push("");
    L.push("| Package | Version |");
    L.push("| --- | --- |");
    L.push(verRows);
    L.push("");
  }
  if (usedRefs.length) {
    L.push("## References");
    L.push("");
    usedRefs.forEach((r, i) => L.push(`${i + 1}. ${REFS[r]}`));
    L.push("");
  }
  if (analysis.warnings?.length) {
    L.push("## Recorded warnings");
    L.push("");
    for (const w of analysis.warnings) L.push(`- ${w}`);
    L.push("");
  }
  return L.join("\n");
}

export async function downloadMethodsReport(entry: StructureEntry, analysis: AnalysisResponse, versionsUrl: string, filename: string): Promise<void> {
  let versions: ToolVersions = {};
  try {
    const res = await fetch(versionsUrl);
    if (res.ok) versions = (await res.json()) as ToolVersions;
  } catch {
    // versions are best-effort; the report is still valid without them
  }
  const md = buildMethodsReport(entry, analysis, versions);
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
