from __future__ import annotations
from collections import defaultdict
from app.models import ChainPairSummary, ContactRecord, InterfaceAnalysis, InterfaceResidue, ResidueConfidence


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
        res_a_contacts: dict[tuple[str, str], int] = defaultdict(int)
        res_b_contacts: dict[tuple[str, str], int] = defaultdict(int)
        res_a_names: dict[tuple[str, str], str] = {}
        res_b_names: dict[tuple[str, str], str] = {}

        for c in pair:
            if c.chain_a == ca:
                key_a = (c.chain_a, c.residue_a)
                res_a_contacts[key_a] += 1
                res_a_names[key_a] = c.residue_name_a
            else:
                key_a = (c.chain_b, c.residue_b)
                res_a_contacts[key_a] += 1
                res_a_names[key_a] = c.residue_name_b

            if c.chain_b == cb:
                key_b = (c.chain_b, c.residue_b)
                res_b_contacts[key_b] += 1
                res_b_names[key_b] = c.residue_name_b
            else:
                key_b = (c.chain_a, c.residue_a)
                res_b_contacts[key_b] += 1
                res_b_names[key_b] = c.residue_name_a

        def make_residue_list(
            contacts_map: dict[tuple[str, str], int],
            names_map: dict[tuple[str, str], str],
        ) -> list[InterfaceResidue]:
            residues = [
                InterfaceResidue(
                    chain_id=chain,
                    residue_number=resnum,
                    residue_name=names_map[(chain, resnum)],
                    contact_count=count,
                    plddt=confidence_by_residue.get((chain, resnum)),
                )
                for (chain, resnum), count in contacts_map.items()
            ]
            residues.sort(key=lambda r: -r.contact_count)
            return residues

        residues_a = make_residue_list(res_a_contacts, res_a_names)
        residues_b = make_residue_list(res_b_contacts, res_b_names)

        plddt_a = [r.plddt for r in residues_a if r.plddt is not None]
        plddt_b = [r.plddt for r in residues_b if r.plddt is not None]

        chain_pairs.append(ChainPairSummary(
            chain_a=ca,
            chain_b=cb,
            contact_count=len(pair),
            mean_plddt_a=round(sum(plddt_a) / len(plddt_a), 2) if plddt_a else None,
            mean_plddt_b=round(sum(plddt_b) / len(plddt_b), 2) if plddt_b else None,
            interface_residue_count_a=len(residues_a),
            interface_residue_count_b=len(residues_b),
            interface_residues_a=residues_a,
            interface_residues_b=residues_b,
        ))

    chain_pairs.sort(key=lambda p: -p.contact_count)
    return InterfaceAnalysis(
        chain_pairs=chain_pairs,
        inter_chain_contact_count=len(inter_chain),
        intra_chain_contact_count=len(intra_chain),
    )
