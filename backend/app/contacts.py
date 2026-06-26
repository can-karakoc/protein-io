from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from math import dist

import gemmi

from app.contact_classification import classify_contact_type, contact_categories
from app.interaction_classifier import classify_interaction_class
from app.models import AtomRecord, ContactRecord, StructureData, WaterBridgeRecord


DEFAULT_DISTANCE_CUTOFF = 4.0
DEFAULT_MAX_CONTACTS = 5000


@dataclass(frozen=True)
class NeighborSearchIndex:
    search: gemmi.NeighborSearch
    atom_lookup: dict[tuple[int, int, int], AtomRecord]
    positions: dict[str, gemmi.Position]


def calculate_contacts(
    structure: StructureData,
    cutoff_angstrom: float = DEFAULT_DISTANCE_CUTOFF,
    max_contacts: int = DEFAULT_MAX_CONTACTS,
) -> tuple[list[ContactRecord], list[str]]:
    """Find simple heavy-atom contacts from normalized StructureData."""
    if cutoff_angstrom <= 0:
        raise ValueError("Distance cutoff must be greater than zero.")

    relevant_atoms = [
        atom
        for atom in structure.atoms
        if atom.residue_kind in {"protein", "ligand", "water"} and not is_hydrogen_atom(atom)
    ]
    if not relevant_atoms:
        return [], ["No non-hydrogen protein or ligand atoms were available for contact analysis."]

    neighbor_index = build_neighbor_search_index(relevant_atoms, cutoff_angstrom=cutoff_angstrom)
    closest_by_pair: dict[tuple[str, str, str], ContactRecord] = {}

    for atom_a in relevant_atoms:
        for atom_b in nearby_atoms(atom_a, neighbor_index, cutoff_angstrom=cutoff_angstrom):
            if atom_b.id <= atom_a.id:
                continue
            if atom_a.residue_id == atom_b.residue_id:
                continue

            contact_type = classify_contact_type(atom_a, atom_b)
            if contact_type is None:
                continue

            distance = round(atom_distance(atom_a, atom_b), 3)
            if distance > cutoff_angstrom:
                continue

            key, ordered_a, ordered_b = contact_key(atom_a, atom_b, contact_type)
            existing = closest_by_pair.get(key)
            if existing and existing.distance_angstrom <= distance:
                continue

            closest_by_pair[key] = build_contact(ordered_a, ordered_b, distance, contact_type)

    contacts = sorted(
        closest_by_pair.values(),
        key=lambda contact: (
            contact.contact_type,
            contact.chain_a,
            contact.residue_a,
            contact.chain_b,
            contact.residue_b,
            contact.distance_angstrom,
        ),
    )

    warnings: list[str] = []
    if len(contacts) > max_contacts:
        warnings.append(f"Contact results were capped at {max_contacts} rows. Try a smaller distance cutoff.")
        contacts = contacts[:max_contacts]

    return contacts, warnings


WATER_BRIDGE_CUTOFF = 3.5  # Å — H-bond range, matching PLIP's threshold


def find_water_bridges(structure: StructureData) -> list[WaterBridgeRecord]:
    """
    Detect water-mediated protein-ligand contacts.

    A bridge exists when a single HOH oxygen is within WATER_BRIDGE_CUTOFF of
    at least one protein atom AND at least one ligand atom. Reports the closest
    protein and ligand atom for each bridging water molecule.
    """
    protein_atoms = [a for a in structure.atoms if a.residue_kind == "protein" and not is_hydrogen_atom(a)]
    ligand_atoms  = [a for a in structure.atoms if a.residue_kind == "ligand"  and not is_hydrogen_atom(a)]
    water_atoms   = [a for a in structure.atoms if a.residue_kind == "water"   and not is_hydrogen_atom(a)]

    if not (water_atoms and protein_atoms and ligand_atoms):
        return []

    bridges: list[WaterBridgeRecord] = []

    for water in water_atoms:
        best_protein: tuple[AtomRecord, float] | None = None
        for pa in protein_atoms:
            d = atom_distance(water, pa)
            if d <= WATER_BRIDGE_CUTOFF and (best_protein is None or d < best_protein[1]):
                best_protein = (pa, d)

        if best_protein is None:
            continue

        best_ligand: tuple[AtomRecord, float] | None = None
        for la in ligand_atoms:
            d = atom_distance(water, la)
            if d <= WATER_BRIDGE_CUTOFF and (best_ligand is None or d < best_ligand[1]):
                best_ligand = (la, d)

        if best_ligand is None:
            continue

        pa, dp = best_protein
        la, dl = best_ligand
        bridges.append(WaterBridgeRecord(
            water_chain=water.chain_id,
            water_residue=water.residue_id,
            water_residue_number=water.residue_number,
            protein_chain=pa.chain_id,
            protein_residue=pa.residue_id,
            protein_residue_name=pa.residue_name,
            protein_atom=pa.name,
            dist_to_protein=round(dp, 3),
            ligand_chain=la.chain_id,
            ligand_residue=la.residue_id,
            ligand_residue_number=la.residue_number,
            ligand_residue_name=la.residue_name,
            ligand_atom=la.name,
            dist_to_ligand=round(dl, 3),
        ))

    return sorted(bridges, key=lambda b: (b.ligand_residue, b.dist_to_protein + b.dist_to_ligand))


def build_neighbor_search_index(atoms: list[AtomRecord], cutoff_angstrom: float) -> NeighborSearchIndex:
    """Build a Gemmi NeighborSearch index from normalized atom records."""
    structure = gemmi.Structure()
    structure.cell = unit_cell_for_atoms(atoms, cutoff_angstrom=cutoff_angstrom)
    model = gemmi.Model(1)

    atom_lookup: dict[tuple[int, int, int], AtomRecord] = {}
    positions: dict[str, gemmi.Position] = {}
    grouped_atoms = group_atoms_by_chain_and_residue(atoms)
    x_shift, y_shift, z_shift = coordinate_shift(atoms, cutoff_angstrom=cutoff_angstrom)

    for chain_index, (chain_id, residues) in enumerate(grouped_atoms.items()):
        chain = gemmi.Chain(chain_id)

        for residue_index, (residue_id, residue_atoms) in enumerate(residues.items()):
            first_atom = residue_atoms[0]
            residue = gemmi.Residue()
            residue.name = first_atom.residue_name
            residue.seqid = gemmi.SeqId(residue_index + 1, " ")
            residue.het_flag = "A" if first_atom.residue_kind == "protein" else "H"

            for atom_index, atom_record in enumerate(residue_atoms):
                gemmi_atom = gemmi.Atom()
                gemmi_atom.name = atom_record.name
                gemmi_atom.element = gemmi.Element(atom_record.element.strip() or "X")
                gemmi_atom.pos = gemmi.Position(
                    atom_record.x + x_shift,
                    atom_record.y + y_shift,
                    atom_record.z + z_shift,
                )
                residue.add_atom(gemmi_atom)
                atom_lookup[(chain_index, residue_index, atom_index)] = atom_record
                positions[atom_record.id] = gemmi_atom.pos

            chain.add_residue(residue)

        model.add_chain(chain)

    structure.add_model(model)
    return NeighborSearchIndex(
        search=gemmi.NeighborSearch(structure, cutoff_angstrom).populate(include_h=False),
        atom_lookup=atom_lookup,
        positions=positions,
    )


def group_atoms_by_chain_and_residue(
    atoms: list[AtomRecord],
) -> OrderedDict[str, OrderedDict[str, list[AtomRecord]]]:
    grouped_atoms: OrderedDict[str, OrderedDict[str, list[AtomRecord]]] = OrderedDict()
    for atom in atoms:
        residues = grouped_atoms.setdefault(atom.chain_id, OrderedDict())
        residues.setdefault(atom.residue_id, []).append(atom)
    return grouped_atoms


def unit_cell_for_atoms(atoms: list[AtomRecord], cutoff_angstrom: float) -> gemmi.UnitCell:
    padding = coordinate_padding(cutoff_angstrom)
    x_values = [atom.x for atom in atoms]
    y_values = [atom.y for atom in atoms]
    z_values = [atom.z for atom in atoms]
    return gemmi.UnitCell(
        max(x_values) - min(x_values) + (padding * 2),
        max(y_values) - min(y_values) + (padding * 2),
        max(z_values) - min(z_values) + (padding * 2),
        90,
        90,
        90,
    )


def coordinate_shift(atoms: list[AtomRecord], cutoff_angstrom: float) -> tuple[float, float, float]:
    padding = coordinate_padding(cutoff_angstrom)
    return (
        padding - min(atom.x for atom in atoms),
        padding - min(atom.y for atom in atoms),
        padding - min(atom.z for atom in atoms),
    )


def coordinate_padding(cutoff_angstrom: float) -> float:
    return cutoff_angstrom + 1.0


def nearby_atoms(
    atom: AtomRecord,
    neighbor_index: NeighborSearchIndex,
    cutoff_angstrom: float,
) -> list[AtomRecord]:
    position = neighbor_index.positions[atom.id]
    atoms: list[AtomRecord] = []
    for mark in neighbor_index.search.find_atoms(position, radius=cutoff_angstrom):
        atom_record = neighbor_index.atom_lookup.get((mark.chain_idx, mark.residue_idx, mark.atom_idx))
        if atom_record is not None:
            atoms.append(atom_record)
    return atoms


def contact_key(atom_a: AtomRecord, atom_b: AtomRecord, contact_type: str) -> tuple[tuple[str, str, str], AtomRecord, AtomRecord]:
    if contact_type == "protein-ligand" and atom_a.residue_kind == "ligand":
        atom_a, atom_b = atom_b, atom_a
    elif contact_type == "protein-water" and atom_a.residue_kind == "water":
        atom_a, atom_b = atom_b, atom_a
    elif contact_type == "ligand-water" and atom_a.residue_kind == "water":
        atom_a, atom_b = atom_b, atom_a
    elif contact_type == "residue-residue" and residue_sort_key(atom_b) < residue_sort_key(atom_a):
        atom_a, atom_b = atom_b, atom_a

    return (contact_type, atom_a.residue_id, atom_b.residue_id), atom_a, atom_b


def build_contact(atom_a: AtomRecord, atom_b: AtomRecord, distance: float, contact_type: str) -> ContactRecord:
    return ContactRecord(
        chain_a=atom_a.chain_id,
        residue_a=atom_a.residue_number,
        residue_name_a=atom_a.residue_name,
        atom_a=atom_a.name,
        chain_b=atom_b.chain_id,
        residue_b=atom_b.residue_number,
        residue_name_b=atom_b.residue_name,
        atom_b=atom_b.name,
        distance_angstrom=distance,
        contact_type=contact_type,  # type: ignore[arg-type]
        contact_categories=contact_categories(atom_a, atom_b, contact_type, distance),  # type: ignore[arg-type]
        interaction_class=classify_interaction_class(atom_a, atom_b, distance),  # type: ignore[arg-type]
    )


def atom_distance(atom_a: AtomRecord, atom_b: AtomRecord) -> float:
    return dist((atom_a.x, atom_a.y, atom_a.z), (atom_b.x, atom_b.y, atom_b.z))


def residue_sort_key(atom: AtomRecord) -> tuple[str, str]:
    return (atom.chain_id, atom.residue_id)


def is_hydrogen_atom(atom: AtomRecord) -> bool:
    element = atom.element.strip().upper()
    name = atom.name.strip().upper()
    return element == "H" or name.startswith("H")
