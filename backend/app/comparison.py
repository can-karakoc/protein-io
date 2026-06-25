from __future__ import annotations

from app.models import (
    AnalysisResponse,
    ContactComparisonSummary,
    ContactDifference,
    ContactRecord,
    StructureComparisonDelta,
    StructureComparisonResponse,
)


def compare_analyses(
    analysis_a: AnalysisResponse,
    analysis_b: AnalysisResponse,
    max_examples: int = 500,
) -> StructureComparisonResponse:
    contacts_a = {contact_identity(contact): contact for contact in analysis_a.contacts}
    contacts_b = {contact_identity(contact): contact for contact in analysis_b.contacts}
    shared_keys = sorted(set(contacts_a) & set(contacts_b))
    gained_keys = sorted(set(contacts_b) - set(contacts_a))
    lost_keys = sorted(set(contacts_a) - set(contacts_b))

    return StructureComparisonResponse(
        structure_a=analysis_a,
        structure_b=analysis_b,
        delta=StructureComparisonDelta(
            atom_count_delta=analysis_b.summary.atom_count - analysis_a.summary.atom_count,
            residue_count_delta=analysis_b.summary.residue_count - analysis_a.summary.residue_count,
            chain_count_delta=analysis_b.summary.chain_count - analysis_a.summary.chain_count,
            ligand_count_delta=analysis_b.summary.ligand_count - analysis_a.summary.ligand_count,
            contact_count_delta=analysis_b.summary.contact_count - analysis_a.summary.contact_count,
        ),
        contacts=ContactComparisonSummary(
            shared_contact_count=len(shared_keys),
            gained_contact_count=len(gained_keys),
            lost_contact_count=len(lost_keys),
            shared_contacts=[
                contact_difference(
                    contacts_b[key],
                    distance_a_angstrom=contacts_a[key].distance_angstrom,
                    distance_b_angstrom=contacts_b[key].distance_angstrom,
                )
                for key in shared_keys[:max_examples]
            ],
            gained_contacts=[contact_difference(contacts_b[key], distance_b_angstrom=contacts_b[key].distance_angstrom) for key in gained_keys[:max_examples]],
            lost_contacts=[contact_difference(contacts_a[key], distance_a_angstrom=contacts_a[key].distance_angstrom) for key in lost_keys[:max_examples]],
        ),
        warnings=[
            "Comparison uses residue-level contact identities without structural alignment.",
            *prefixed_warnings("Structure A", analysis_a.warnings),
            *prefixed_warnings("Structure B", analysis_b.warnings),
        ],
    )


def contact_identity(contact: ContactRecord) -> tuple[str, tuple[str, str, str], tuple[str, str, str]]:
    residue_a = (contact.chain_a, contact.residue_name_a, contact.residue_a)
    residue_b = (contact.chain_b, contact.residue_name_b, contact.residue_b)
    ordered_residues = tuple(sorted([residue_a, residue_b]))
    return (contact.contact_type, ordered_residues[0], ordered_residues[1])


def contact_difference(
    contact: ContactRecord,
    distance_a_angstrom: float | None = None,
    distance_b_angstrom: float | None = None,
) -> ContactDifference:
    return ContactDifference(
        label=contact_label(contact),
        contact_type=contact.contact_type,
        contact_categories=contact.contact_categories,
        distance_a_angstrom=distance_a_angstrom,
        distance_b_angstrom=distance_b_angstrom,
    )


def contact_label(contact: ContactRecord) -> str:
    return (
        f"{contact.chain_a}:{contact.residue_name_a}{contact.residue_a} - "
        f"{contact.chain_b}:{contact.residue_name_b}{contact.residue_b}"
    )


def prefixed_warnings(prefix: str, warnings: list[str]) -> list[str]:
    return [f"{prefix}: {warning}" for warning in warnings]
