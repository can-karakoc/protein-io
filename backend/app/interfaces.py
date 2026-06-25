from __future__ import annotations
from collections import defaultdict
from app.models import ChainPairSummary, ContactRecord, InterfaceAnalysis, ResidueConfidence


def analyze_interfaces(
    contacts: list[ContactRecord],
    residue_confidences: list[ResidueConfidence],
) -> InterfaceAnalysis:
    confidence_by_residue = {
        (rc.chain_id, rc.residue_number): rc.plddt for rc in residue_confidences
    }

    inter_chain = [c for c in contacts if "inter-chain" in c.contact_categories]
    intra_chain = [c for c in contacts if "intra-chain" in c.contact_categories]

    pair_contacts: dict[tuple[str, str], list[ContactRecord]] = defaultdict(list)
    for contact in inter_chain:
        key = tuple(sorted([contact.chain_a, contact.chain_b]))
        pair_contacts[key].append(contact)  # type: ignore[index]

    chain_pairs: list[ChainPairSummary] = []
    for (ca, cb), pair in pair_contacts.items():
        interface_residues_a = {
            (c.chain_a, c.residue_a) for c in pair if c.chain_a == ca
        } | {
            (c.chain_b, c.residue_b) for c in pair if c.chain_b == ca
        }
        interface_residues_b = {
            (c.chain_a, c.residue_a) for c in pair if c.chain_a == cb
        } | {
            (c.chain_b, c.residue_b) for c in pair if c.chain_b == cb
        }
        plddt_a = [
            confidence_by_residue[r] for r in interface_residues_a if r in confidence_by_residue
        ]
        plddt_b = [
            confidence_by_residue[r] for r in interface_residues_b if r in confidence_by_residue
        ]
        chain_pairs.append(ChainPairSummary(
            chain_a=ca,
            chain_b=cb,
            contact_count=len(pair),
            inter_chain_contact_count=len(pair),
            mean_plddt_a=round(sum(plddt_a) / len(plddt_a), 2) if plddt_a else None,
            mean_plddt_b=round(sum(plddt_b) / len(plddt_b), 2) if plddt_b else None,
            interface_residue_count_a=len(interface_residues_a),
            interface_residue_count_b=len(interface_residues_b),
        ))

    chain_pairs.sort(key=lambda p: -p.contact_count)
    return InterfaceAnalysis(
        chain_pairs=chain_pairs,
        inter_chain_contact_count=len(inter_chain),
        intra_chain_contact_count=len(intra_chain),
    )
