import type { ContactRecord } from "@/lib/types";

export const FP_CLASSES = [
  "h-bond",
  "salt-bridge",
  "aromatic",
  "pi-cation",
  "hydrophobic",
  "halogen-bond",
] as const;

export type FpClass = (typeof FP_CLASSES)[number];

export const FP_ABBR: Record<FpClass, string> = {
  "h-bond": "H",
  "salt-bridge": "Sa",
  "aromatic": "Ar",
  "pi-cation": "Pi",
  "hydrophobic": "Hy",
  "halogen-bond": "Ha",
};

export const FP_FULL_LABEL: Record<FpClass, string> = {
  "h-bond": "H-bond",
  "salt-bridge": "salt bridge",
  "aromatic": "aromatic",
  "pi-cation": "π-cation",
  "hydrophobic": "hydrophobic",
  "halogen-bond": "halogen",
};

export const FP_DOT_COLOR: Record<FpClass, string> = {
  "h-bond": "var(--pio-lavender-deep)",
  "salt-bridge": "var(--pio-amber-deep)",
  "aromatic": "var(--pio-blue-deep)",
  "pi-cation": "var(--pio-highlight)",
  "hydrophobic": "var(--pio-green-deep)",
  "halogen-bond": "var(--pio-coral-deep)",
};

export type FpRow = { key: string; count: number; classes: Set<FpClass> };

export function buildFingerprint(
  contacts: ContactRecord[],
  ligand: { chain_id: string; residue_number: string },
  maxRows = 12,
): FpRow[] {
  const map = new Map<string, FpRow>();
  for (const c of contacts) {
    if (c.contact_type !== "protein-ligand") continue;
    const ligIsA = c.chain_a === ligand.chain_id && c.residue_a === ligand.residue_number;
    const key = ligIsA
      ? `${c.chain_b}:${c.residue_name_b}${c.residue_b}`
      : `${c.chain_a}:${c.residue_name_a}${c.residue_a}`;
    if (!map.has(key)) map.set(key, { key, count: 0, classes: new Set() });
    const row = map.get(key)!;
    row.count++;
    const cls = c.interaction_class;
    if (cls && cls !== "unclassified" && (FP_CLASSES as readonly string[]).includes(cls)) {
      row.classes.add(cls as FpClass);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, maxRows);
}

export type DiffStatus = "stable" | "gained" | "lost";

export type DiffFpRow = {
  key: string;
  status: DiffStatus;
  countA: number;
  countB: number;
  classDiff: Record<FpClass, DiffStatus | "absent">;
};

export function buildDiffFingerprint(
  fpA: FpRow[],
  fpB: FpRow[],
): DiffFpRow[] {
  const mapA = new Map(fpA.map((r) => [r.key, r]));
  const mapB = new Map(fpB.map((r) => [r.key, r]));
  const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);

  const rows: DiffFpRow[] = [];
  for (const key of allKeys) {
    const a = mapA.get(key);
    const b = mapB.get(key);
    const status: DiffStatus = a && b ? "stable" : b ? "gained" : "lost";
    const classDiff = {} as Record<FpClass, DiffStatus | "absent">;
    for (const cls of FP_CLASSES) {
      const inA = a?.classes.has(cls) ?? false;
      const inB = b?.classes.has(cls) ?? false;
      classDiff[cls] = inA && inB ? "stable" : inB ? "gained" : inA ? "lost" : "absent";
    }
    rows.push({ key, status, countA: a?.count ?? 0, countB: b?.count ?? 0, classDiff });
  }

  // Sort: stable first (by max count), then gained, then lost
  const ORDER: Record<DiffStatus, number> = { stable: 0, gained: 1, lost: 2 };
  return rows.sort((a, b) => {
    if (a.status !== b.status) return ORDER[a.status] - ORDER[b.status];
    return Math.max(b.countA, b.countB) - Math.max(a.countA, a.countB);
  });
}
