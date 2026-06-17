from app.models import ContactRecord


CONTACT_CSV_COLUMNS = [
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
]


def contacts_to_rows(contacts: list[ContactRecord]) -> list[dict[str, str | float]]:
    """Convert contact models into stable CSV-friendly dictionaries."""
    return [
        {
            "chain_a": contact.chain_a,
            "residue_a": contact.residue_a,
            "residue_name_a": contact.residue_name_a,
            "atom_a": contact.atom_a,
            "chain_b": contact.chain_b,
            "residue_b": contact.residue_b,
            "residue_name_b": contact.residue_name_b,
            "atom_b": contact.atom_b,
            "distance_angstrom": contact.distance_angstrom,
            "contact_type": contact.contact_type,
        }
        for contact in contacts
    ]
