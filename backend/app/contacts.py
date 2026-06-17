from __future__ import annotations

from collections import defaultdict
from itertools import product
from math import dist

from app.models import AtomRecord, ContactRecord, StructureData


DEFAULT_DISTANCE_CUTOFF = 4.0
DEFAULT_MAX_CONTACTS = 5000
GridCell = tuple[int, int, int]


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
        if atom.residue_kind in {"protein", "ligand"} and not is_hydrogen_atom(atom)
    ]
    if not relevant_atoms:
        return [], ["No non-hydrogen protein or ligand atoms were available for contact analysis."]

    spatial_index = build_spatial_index(relevant_atoms, cell_size=cutoff_angstrom)
    closest_by_pair: dict[tuple[str, str, str], ContactRecord] = {}

    for atom_a in relevant_atoms:
        for atom_b in nearby_atoms(atom_a, spatial_index, cell_size=cutoff_angstrom):
            if atom_b.id <= atom_a.id:
                continue
            if atom_a.residue_id == atom_b.residue_id:
                continue

            contact_type = classify_contact(atom_a, atom_b)
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


def build_spatial_index(atoms: list[AtomRecord], cell_size: float) -> dict[GridCell, list[AtomRecord]]:
    """Group atoms into cubic cells so contact search avoids all-pairs scans."""
    index: dict[GridCell, list[AtomRecord]] = defaultdict(list)
    for atom in atoms:
        index[cell_for_atom(atom, cell_size)].append(atom)
    return dict(index)


def nearby_atoms(
    atom: AtomRecord,
    spatial_index: dict[GridCell, list[AtomRecord]],
    cell_size: float,
) -> list[AtomRecord]:
    atom_cell = cell_for_atom(atom, cell_size)
    atoms: list[AtomRecord] = []

    for offset in product((-1, 0, 1), repeat=3):
        neighbor_cell = (
            atom_cell[0] + offset[0],
            atom_cell[1] + offset[1],
            atom_cell[2] + offset[2],
        )
        atoms.extend(spatial_index.get(neighbor_cell, []))

    return atoms


def cell_for_atom(atom: AtomRecord, cell_size: float) -> GridCell:
    return (
        int(atom.x // cell_size),
        int(atom.y // cell_size),
        int(atom.z // cell_size),
    )


def classify_contact(atom_a: AtomRecord, atom_b: AtomRecord) -> str | None:
    kinds = {atom_a.residue_kind, atom_b.residue_kind}
    if kinds == {"protein"}:
        return "residue-residue"
    if kinds == {"protein", "ligand"}:
        return "protein-ligand"
    return None


def contact_key(atom_a: AtomRecord, atom_b: AtomRecord, contact_type: str) -> tuple[tuple[str, str, str], AtomRecord, AtomRecord]:
    if contact_type == "protein-ligand" and atom_a.residue_kind == "ligand":
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
    )


def atom_distance(atom_a: AtomRecord, atom_b: AtomRecord) -> float:
    return dist((atom_a.x, atom_a.y, atom_a.z), (atom_b.x, atom_b.y, atom_b.z))


def residue_sort_key(atom: AtomRecord) -> tuple[str, str]:
    return (atom.chain_id, atom.residue_id)


def is_hydrogen_atom(atom: AtomRecord) -> bool:
    element = atom.element.strip().upper()
    name = atom.name.strip().upper()
    return element == "H" or name.startswith("H")
