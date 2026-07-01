import type {
  ContactDifference,
  ContactRecord,
  LigandInteractionSummary,
  StructureComparisonResponse,
} from "@/lib/types";

const CONTACT_COLUMNS: Array<keyof ContactRecord> = [
  "chain_a",
  "residue_a",
  "residue_name_a",
  "atom_a",
  "chain_b",
  "residue_b",
  "residue_name_b",
  "atom_b",
  "distance_angstrom",
  "contact_type",
  "contact_categories",
  "source_residue_confidence",
  "target_residue_confidence",
  "confidence_warning",
];

export function contactsToCsv(contacts: ContactRecord[]) {
  const header = CONTACT_COLUMNS.join(",");
  const rows = contacts.map((contact) =>
    CONTACT_COLUMNS.map((column) => escapeCsvValue(contact[column])).join(","),
  );
  return [header, ...rows].join("\n");
}

const LIGAND_COLUMNS = [
  "name",
  "chain_id",
  "residue_number",
  "contact_count",
  "protein_contact_count",
  "water_contact_count",
  "possible_clash_count",
  "closest_distance_angstrom",
  "contacting_residues",
  "distance_under_2_angstrom",
  "distance_2_to_3_angstrom",
  "distance_3_to_4_angstrom",
  "distance_over_4_angstrom",
] as const;

export function ligandMedchemReportToCsv(
  ligand: LigandInteractionSummary,
  contacts: ContactRecord[],
): string {
  const ligandContacts = contacts
    .filter((c) => {
      if (c.contact_type !== "protein-ligand") return false;
      return (
        (c.chain_a === ligand.chain_id && c.residue_a === ligand.residue_number) ||
        (c.chain_b === ligand.chain_id && c.residue_b === ligand.residue_number)
      );
    })
    .sort((a, b) => a.distance_angstrom - b.distance_angstrom);

  // Section 1: summary header
  const summaryRows = [
    ["# LIGAND MEDCHEM REPORT"],
    ["Ligand", ligand.name],
    ["Chain", ligand.chain_id],
    ["Residue", ligand.residue_number],
    ["Total contacts", String(ligand.contact_count)],
    ["Protein contacts", String(ligand.protein_contact_count)],
    ["Water contacts", String(ligand.water_contact_count)],
    ["Possible clashes", String(ligand.possible_clash_count)],
    ["Closest distance (Å)", String(ligand.closest_distance_angstrom ?? "")],
    ["Contact efficiency", ligand.contact_efficiency != null ? String(ligand.contact_efficiency) : ""],
    ...(Object.keys(ligand.interaction_class_breakdown ?? {}).length > 0 ? [["# Interaction classes"]] : []),
    ...Object.entries(ligand.interaction_class_breakdown ?? {}).map(([cls, n]) => [`  ${cls}`, String(n)]),
    ...(Object.keys(ligand.hbond_strength_breakdown ?? {}).length > 0 ? [["# H-bond strength"]] : []),
    ...Object.entries(ligand.hbond_strength_breakdown ?? {}).map(([tier, n]) => [`  ${tier}`, String(n)]),
    [],
  ];

  // Section 2: per-residue fingerprint
  const fpMap = new Map<string, { count: number; classes: Set<string>; minDist: number }>();
  for (const c of ligandContacts) {
    const ligIsA = c.chain_a === ligand.chain_id && c.residue_a === ligand.residue_number;
    const key = ligIsA
      ? `${c.chain_b}:${c.residue_name_b}${c.residue_b}`
      : `${c.chain_a}:${c.residue_name_a}${c.residue_a}`;
    if (!fpMap.has(key)) fpMap.set(key, { count: 0, classes: new Set(), minDist: Infinity });
    const r = fpMap.get(key)!;
    r.count++;
    if (c.interaction_class && c.interaction_class !== "unclassified") r.classes.add(c.interaction_class);
    if (c.distance_angstrom < r.minDist) r.minDist = c.distance_angstrom;
  }
  const fpHeader = ["# FINGERPRINT — residue, contacts, min_dist_Å, h-bond, salt-bridge, aromatic, pi-cation, hydrophobic, halogen-bond"];
  const fpCols = ["h-bond", "salt-bridge", "aromatic", "pi-cation", "hydrophobic", "halogen-bond"];
  const fpRows = [...fpMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key, r]) => [
      key,
      String(r.count),
      r.minDist === Infinity ? "" : r.minDist.toFixed(3),
      ...fpCols.map((cls) => (r.classes.has(cls) ? "1" : "0")),
    ]);

  // Section 3: all contacts
  const contactHeader = ["# CONTACTS — protein_residue, protein_atom, ligand_atom, distance_Å, interaction_type, hbond_strength"];
  const contactRows = ligandContacts.map((c) => {
    const ligIsA = c.chain_a === ligand.chain_id && c.residue_a === ligand.residue_number;
    return [
      ligIsA ? `${c.chain_b}:${c.residue_name_b}${c.residue_b}` : `${c.chain_a}:${c.residue_name_a}${c.residue_a}`,
      ligIsA ? c.atom_b : c.atom_a,
      ligIsA ? c.atom_a : c.atom_b,
      c.distance_angstrom.toFixed(3),
      c.interaction_class ?? "",
      c.hbond_strength ?? "",
    ];
  });

  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const toLine = (row: string[]) => row.map(escape).join(",");

  return [
    ...summaryRows.map(toLine),
    ...fpHeader,
    toLine(["residue", "contacts", "min_dist_Å", ...fpCols]),
    ...fpRows.map(toLine),
    "",
    ...contactHeader,
    toLine(["protein_residue", "protein_atom", "ligand_atom", "distance_Å", "interaction_type", "hbond_strength"]),
    ...contactRows.map(toLine),
  ].join("\n");
}

export function ligandInteractionsToCsv(ligands: LigandInteractionSummary[]) {
  const header = LIGAND_COLUMNS.join(",");
  const rows = ligands.map((ligand) =>
    [
      ligand.name,
      ligand.chain_id,
      ligand.residue_number,
      ligand.contact_count,
      ligand.protein_contact_count,
      ligand.water_contact_count,
      ligand.possible_clash_count,
      ligand.closest_distance_angstrom ?? "",
      ligand.contacting_residues
        .map((residue) => `${residue.chain_id}:${residue.residue_name}${residue.residue_number} (${residue.contact_count})`)
        .join("; "),
      ligand.distance_distribution.under_2_angstrom,
      ligand.distance_distribution.two_to_3_angstrom,
      ligand.distance_distribution.three_to_4_angstrom,
      ligand.distance_distribution.over_4_angstrom,
    ]
      .map(escapeCsvValue)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

export function comparisonContactsToCsv(comparison: StructureComparisonResponse) {
  const header = [
    "difference",
    "contact_identity",
    "contact_type",
    "contact_categories",
    "distance_a_angstrom",
    "distance_b_angstrom",
  ].join(",");
  const rows: Array<[string, ContactDifference]> = [
    ...comparison.contacts.shared_contacts.map((contact): [string, ContactDifference] => ["shared", contact]),
    ...comparison.contacts.gained_contacts.map((contact): [string, ContactDifference] => ["gained_in_b", contact]),
    ...comparison.contacts.lost_contacts.map((contact): [string, ContactDifference] => ["lost_from_a", contact]),
  ];
  return [
    header,
    ...rows.map(([difference, contact]) =>
      [
        difference,
        contact.label,
        contact.contact_type,
        contact.contact_categories,
        contact.distance_a_angstrom ?? "",
        contact.distance_b_angstrom ?? "",
      ]
        .map(escapeCsvValue)
        .join(","),
    ),
  ].join("\n");
}

function escapeCsvValue(value: ContactRecord[keyof ContactRecord] | string | number | string[]) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object" && "plddt" in value) {
    return `${value.plddt} ${value.category}`;
  }
  const text = Array.isArray(value) ? value.join(";") : String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}
