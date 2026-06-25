from __future__ import annotations

from collections import Counter

from app.models import (
    AtomRecord,
    ContactCategory,
    ContactRecord,
    ContactType,
    DistanceDistribution,
    InteractionSummary,
    LigandInteractionSummary,
    TopContactLigand,
    TopContactResidue,
)


VERY_CLOSE_CONTACT_DISTANCE = 2.0


def classify_contact_type(atom_a: AtomRecord, atom_b: AtomRecord) -> ContactType | None:
    kinds = {atom_a.residue_kind, atom_b.residue_kind}
    if kinds == {"protein"}:
        return "residue-residue"
    if kinds == {"protein", "ligand"}:
        return "protein-ligand"
    if kinds == {"protein", "water"}:
        return "protein-water"
    if kinds == {"ligand", "water"}:
        return "ligand-water"
    return None


def contact_categories(atom_a: AtomRecord, atom_b: AtomRecord, contact_type: ContactType, distance: float) -> list[ContactCategory]:
    categories: list[ContactCategory] = []

    if contact_type == "residue-residue":
        categories.append("protein-protein")
        categories.append("intra-chain" if atom_a.chain_id == atom_b.chain_id else "inter-chain")
    elif contact_type == "protein-ligand":
        categories.append("protein-ligand")
    elif contact_type == "protein-water":
        categories.append("protein-water")
    elif contact_type == "ligand-water":
        categories.append("ligand-water")

    if distance < VERY_CLOSE_CONTACT_DISTANCE:
        categories.append("very-close-contact")
        categories.append("possible-clash")

    return categories


def summarize_interactions(contacts: list[ContactRecord], max_items: int = 5) -> InteractionSummary:
    category_counts = Counter(category for contact in contacts for category in contact.contact_categories)
    protein_residue_counts: Counter[tuple[str, str, str]] = Counter()
    ligand_counts: Counter[tuple[str, str, str]] = Counter()

    for contact in contacts:
        for chain_id, residue_number, residue_name in contact_residue_keys(contact):
            protein_residue_counts[(chain_id, residue_number, residue_name)] += 1

        if "protein-ligand" in contact.contact_categories or "ligand-water" in contact.contact_categories:
            ligand_key = ligand_residue_key(contact)
            if ligand_key is not None:
                ligand_counts[ligand_key] += 1

    closest_contacts = sorted(contacts, key=lambda contact: contact.distance_angstrom)[:max_items]
    return InteractionSummary(
        protein_protein_count=category_counts["protein-protein"],
        protein_ligand_count=category_counts["protein-ligand"],
        protein_water_count=category_counts["protein-water"],
        ligand_water_count=category_counts["ligand-water"],
        intra_chain_count=category_counts["intra-chain"],
        inter_chain_count=category_counts["inter-chain"],
        possible_clash_count=category_counts["possible-clash"],
        top_contacting_residues=[
            TopContactResidue(
                chain_id=chain_id,
                residue_number=residue_number,
                residue_name=residue_name,
                contact_count=count,
            )
            for (chain_id, residue_number, residue_name), count in protein_residue_counts.most_common(max_items)
        ],
        top_contacting_ligands=[
            TopContactLigand(
                chain_id=chain_id,
                residue_number=residue_number,
                name=residue_name,
                contact_count=count,
            )
            for (chain_id, residue_number, residue_name), count in ligand_counts.most_common(max_items)
        ],
        closest_contacts=closest_contacts,
        possible_clashes=[
            contact
            for contact in sorted(contacts, key=lambda contact: contact.distance_angstrom)
            if "possible-clash" in contact.contact_categories
        ][:max_items],
    )


def summarize_ligand_interactions(contacts: list[ContactRecord], max_residues: int = 5) -> list[LigandInteractionSummary]:
    ligand_contacts: dict[tuple[str, str, str], list[ContactRecord]] = {}

    for contact in contacts:
        ligand_key = ligand_residue_key(contact)
        if ligand_key is None:
            continue
        ligand_contacts.setdefault(ligand_key, []).append(contact)

    summaries: list[LigandInteractionSummary] = []
    for (chain_id, residue_number, name), ligand_contact_rows in ligand_contacts.items():
        residue_counts: Counter[tuple[str, str, str]] = Counter()
        for contact in ligand_contact_rows:
            for residue_key in contact_residue_keys(contact):
                residue_counts[residue_key] += 1

        closest_contact = min(ligand_contact_rows, key=lambda contact: contact.distance_angstrom)
        summaries.append(
            LigandInteractionSummary(
                chain_id=chain_id,
                residue_number=residue_number,
                name=name,
                contact_count=len(ligand_contact_rows),
                protein_contact_count=sum(1 for contact in ligand_contact_rows if "protein-ligand" in contact.contact_categories),
                water_contact_count=sum(1 for contact in ligand_contact_rows if "ligand-water" in contact.contact_categories),
                possible_clash_count=sum(
                    1 for contact in ligand_contact_rows if "possible-clash" in contact.contact_categories
                ),
                closest_distance_angstrom=closest_contact.distance_angstrom,
                closest_contact=closest_contact,
                contacting_residues=[
                    TopContactResidue(
                        chain_id=residue_chain_id,
                        residue_number=contacting_residue_number,
                        residue_name=residue_name,
                        contact_count=count,
                    )
                    for (residue_chain_id, contacting_residue_number, residue_name), count in residue_counts.most_common(max_residues)
                ],
                distance_distribution=ligand_distance_distribution(ligand_contact_rows),
            )
        )

    return sorted(
        summaries,
        key=lambda summary: (
            -summary.contact_count,
            summary.closest_distance_angstrom if summary.closest_distance_angstrom is not None else float("inf"),
            summary.chain_id,
            summary.residue_number,
            summary.name,
        ),
    )


def ligand_distance_distribution(contacts: list[ContactRecord]) -> DistanceDistribution:
    distribution = DistanceDistribution()
    for contact in contacts:
        if contact.distance_angstrom < 2.0:
            distribution.under_2_angstrom += 1
        elif contact.distance_angstrom < 3.0:
            distribution.two_to_3_angstrom += 1
        elif contact.distance_angstrom < 4.0:
            distribution.three_to_4_angstrom += 1
        else:
            distribution.over_4_angstrom += 1
    return distribution


def contact_residue_keys(contact: ContactRecord) -> list[tuple[str, str, str]]:
    keys: list[tuple[str, str, str]] = []
    if protein_residue_name(contact.residue_name_a):
        keys.append((contact.chain_a, contact.residue_a, contact.residue_name_a))
    if protein_residue_name(contact.residue_name_b):
        keys.append((contact.chain_b, contact.residue_b, contact.residue_name_b))
    return keys


def ligand_residue_key(contact: ContactRecord) -> tuple[str, str, str] | None:
    if not protein_residue_name(contact.residue_name_a) and contact.residue_name_a not in {"HOH", "WAT", "H2O"}:
        return (contact.chain_a, contact.residue_a, contact.residue_name_a)
    if not protein_residue_name(contact.residue_name_b) and contact.residue_name_b not in {"HOH", "WAT", "H2O"}:
        return (contact.chain_b, contact.residue_b, contact.residue_name_b)
    return None


def protein_residue_name(residue_name: str) -> bool:
    return residue_name in {
        "ALA",
        "ARG",
        "ASN",
        "ASP",
        "CYS",
        "GLN",
        "GLU",
        "GLY",
        "HIS",
        "ILE",
        "LEU",
        "LYS",
        "MET",
        "PHE",
        "PRO",
        "SER",
        "THR",
        "TRP",
        "TYR",
        "VAL",
    }
