// PyMOL (.pml) / ChimeraX (.cxc) session scripts that recreate a review in the user's
// own tool: load the structure, colour by pLDDT (predicted models), and lay down named
// selections for ligands, pockets, antibody CDRs and interface residues. Pure text — no
// backend, no deps — so it stays deploy-safe and reproducible.

import type { AnalysisResponse } from "./types";
import type { StructureEntry } from "./workspaceStore";

type Res = { chain_id: string; residue_number: string };

// PyMOL/ChimeraX object & selection names must be tokens.
function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "sel";
}

function groupByChain(residues: Res[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of residues) {
    const key = r.chain_id || "";
    if (!m.has(key)) m.set(key, []);
    const arr = m.get(key)!;
    // de-dupe while preserving order
    if (!arr.includes(r.residue_number)) arr.push(r.residue_number);
  }
  return m;
}

// (chain A and resi 23+25) or (chain B and resi 40)
function pymolSel(residues: Res[]): string {
  const parts: string[] = [];
  for (const [chain, resis] of groupByChain(residues)) {
    if (!resis.length) continue;
    const resiClause = `resi ${resis.join("+")}`;
    parts.push(chain ? `(chain ${chain} and ${resiClause})` : `(${resiClause})`);
  }
  return parts.join(" or ") || "none";
}

// /A:23,25 /B:40
function chimeraxSel(residues: Res[]): string {
  const parts: string[] = [];
  for (const [chain, resis] of groupByChain(residues)) {
    if (!resis.length) continue;
    parts.push(chain ? `/${chain}:${resis.join(",")}` : `:${resis.join(",")}`);
  }
  return parts.join("") || "";
}

function isPredicted(entry: StructureEntry, analysis: AnalysisResponse): boolean {
  const src = analysis.metadata?.source;
  return !!analysis.confidence && (src === "alphafold" || src === "boltz" || src === "chai");
}

function header(tool: string, entry: StructureEntry, analysis: AnalysisResponse): string {
  const id = analysis.metadata?.pdb_id || analysis.metadata?.uniprot_id || entry.name || "structure";
  return [
    `# Protein I/O — ${tool} session script`,
    `# Structure: ${id}`,
    `# Generated ${new Date().toISOString()} — all selections from in-house analysis`,
    "",
  ].join("\n");
}

// ── PyMOL ─────────────────────────────────────────────────────────────────────

export function buildPymolScript(entry: StructureEntry, analysis: AnalysisResponse): string {
  const L: string[] = [header("PyMOL", entry, analysis)];
  const obj = "structure";

  // Load
  if (entry.source === "rcsb" && entry.pdbId) {
    L.push(`fetch ${entry.pdbId.toLowerCase()}, ${obj}, async=0`);
  } else if (entry.source === "alphafold" && entry.uniprotId) {
    const url = analysis.metadata?.model_url || analysis.metadata?.alphafold_url ||
      `https://alphafold.ebi.ac.uk/files/AF-${entry.uniprotId.toUpperCase()}-F1-model_v4.cif`;
    L.push(`load ${url}, ${obj}`);
  } else {
    const fname = entry.name || `structure.${entry.structureFormat}`;
    L.push(`# Load your local file (must be in PyMOL's working directory):`);
    L.push(`load ${fname}, ${obj}`);
  }

  L.push("hide everything", `show cartoon, ${obj}`, `color grey80, ${obj}`, "bg_color white", "");

  // pLDDT (predicted only; pLDDT is stored in the B-factor column)
  if (isPredicted(entry, analysis)) {
    L.push("# pLDDT confidence (B-factor) — AlphaFold palette");
    L.push(`color marine, ${obj} and b > 90`);
    L.push(`color cyan, ${obj} and b < 90 and b > 70`);
    L.push(`color yellow, ${obj} and b < 70 and b > 50`);
    L.push(`color orange, ${obj} and b < 50`);
    L.push("");
  }

  // Ligands
  if (analysis.ligands?.length) {
    L.push("# Ligands");
    for (const lig of analysis.ligands) {
      const name = safeName(`lig_${lig.name}_${lig.chain_id}${lig.residue_number}`);
      const sel = pymolSel([{ chain_id: lig.chain_id, residue_number: lig.residue_number }]);
      L.push(`select ${name}, ${sel}`);
      L.push(`show sticks, ${name}`);
      L.push(`color magenta, ${name}`);
    }
    L.push("");
  }

  // Binding pockets
  if (analysis.pockets?.length) {
    L.push("# Binding pockets (lining residues)");
    for (const p of analysis.pockets) {
      const name = safeName(`pocket_${p.rank}`);
      L.push(`select ${name}, ${pymolSel(p.lining_residues)}`);
      L.push(`color salmon, ${name}`);
    }
    L.push("");
  }

  // Antibody CDRs
  if (analysis.antibody?.chains?.length) {
    L.push("# Antibody CDR loops (IMGT)");
    for (const ch of analysis.antibody.chains) {
      for (const cdr of ch.cdrs) {
        const name = safeName(`${ch.chain_id}_${cdr.name}`);
        const residues = cdr.residue_numbers.map((rn) => ({ chain_id: ch.chain_id, residue_number: rn }));
        L.push(`select ${name}, ${pymolSel(residues)}`);
        L.push(`color red, ${name}`);
      }
    }
    L.push("");
  }

  // Interface residues
  const pairs = analysis.interface_analysis?.chain_pairs ?? [];
  if (pairs.length) {
    L.push("# Interface residues");
    for (const cp of pairs) {
      const residues = [...(cp.interface_residues_a ?? []), ...(cp.interface_residues_b ?? [])];
      if (!residues.length) continue;
      const name = safeName(`interface_${cp.chain_a}_${cp.chain_b}`);
      L.push(`select ${name}, ${pymolSel(residues)}`);
      L.push(`color hotpink, ${name}`);
    }
    L.push("");
  }

  L.push("deselect", "orient", "");
  return L.join("\n");
}

// ── ChimeraX ──────────────────────────────────────────────────────────────────

export function buildChimeraxScript(entry: StructureEntry, analysis: AnalysisResponse): string {
  const L: string[] = [header("ChimeraX", entry, analysis)];

  // Load
  if (entry.source === "rcsb" && entry.pdbId) {
    L.push(`open ${entry.pdbId.toLowerCase()}`);
  } else if (entry.source === "alphafold" && entry.uniprotId) {
    L.push(`alphafold fetch ${entry.uniprotId.toUpperCase()}`);
  } else {
    const fname = entry.name || `structure.${entry.structureFormat}`;
    L.push(`# Load your local file:`);
    L.push(`open ${fname}`);
  }

  L.push("hide", "cartoon", "color light gray", "set bgColor white", "");

  // pLDDT — ChimeraX has a built-in AlphaFold palette for the B-factor attribute
  if (isPredicted(entry, analysis)) {
    L.push("# pLDDT confidence (B-factor) — AlphaFold palette");
    L.push("color bfactor palette alphafold");
    L.push("");
  }

  // Ligands
  if (analysis.ligands?.length) {
    L.push("# Ligands");
    for (const lig of analysis.ligands) {
      const spec = chimeraxSel([{ chain_id: lig.chain_id, residue_number: lig.residue_number }]);
      L.push(`name ${safeName(`lig_${lig.name}_${lig.chain_id}${lig.residue_number}`)} ${spec}`);
      L.push(`style ${spec} stick`);
      L.push(`color ${spec} magenta`);
    }
    L.push("");
  }

  // Binding pockets
  if (analysis.pockets?.length) {
    L.push("# Binding pockets (lining residues)");
    for (const p of analysis.pockets) {
      const spec = chimeraxSel(p.lining_residues);
      if (!spec) continue;
      L.push(`name ${safeName(`pocket_${p.rank}`)} ${spec}`);
      L.push(`color ${spec} salmon`);
    }
    L.push("");
  }

  // Antibody CDRs
  if (analysis.antibody?.chains?.length) {
    L.push("# Antibody CDR loops (IMGT)");
    for (const ch of analysis.antibody.chains) {
      for (const cdr of ch.cdrs) {
        const residues = cdr.residue_numbers.map((rn) => ({ chain_id: ch.chain_id, residue_number: rn }));
        const spec = chimeraxSel(residues);
        L.push(`name ${safeName(`${ch.chain_id}_${cdr.name}`)} ${spec}`);
        L.push(`color ${spec} red`);
      }
    }
    L.push("");
  }

  // Interface residues
  const pairs = analysis.interface_analysis?.chain_pairs ?? [];
  if (pairs.length) {
    L.push("# Interface residues");
    for (const cp of pairs) {
      const residues = [...(cp.interface_residues_a ?? []), ...(cp.interface_residues_b ?? [])];
      const spec = chimeraxSel(residues);
      if (!spec) continue;
      L.push(`name ${safeName(`interface_${cp.chain_a}_${cp.chain_b}`)} ${spec}`);
      L.push(`color ${spec} hot pink`);
    }
    L.push("");
  }

  L.push("view", "");
  return L.join("\n");
}

export function downloadSessionScript(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
