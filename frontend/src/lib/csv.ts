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
  "very_close_contact_count",
  "closest_distance_angstrom",
  "contacting_residues",
  "distance_under_2_angstrom",
  "distance_2_to_3_angstrom",
  "distance_3_to_4_angstrom",
  "distance_over_4_angstrom",
] as const;

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
      ligand.very_close_contact_count,
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
