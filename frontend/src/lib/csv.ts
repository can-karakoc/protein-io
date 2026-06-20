import type { ContactRecord, LigandInteractionSummary } from "@/lib/types";

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

function escapeCsvValue(value: string | number | string[]) {
  const text = Array.isArray(value) ? value.join(";") : String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}
