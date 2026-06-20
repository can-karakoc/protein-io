import type { ContactRecord } from "@/lib/types";

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

function escapeCsvValue(value: string | number | string[]) {
  const text = Array.isArray(value) ? value.join(";") : String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}
