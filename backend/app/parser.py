from __future__ import annotations

from pathlib import Path
from tempfile import NamedTemporaryFile

from Bio.PDB import PDBParser

from app.models import AtomRecord, ChainSummary, LigandSummary, ResidueRecord, ResidueKind, StructureData


WATER_NAMES = {"HOH", "WAT", "H2O"}


class StructureParseError(ValueError):
    """Raised when uploaded structure content cannot be parsed into useful data."""


def parse_pdb_content(content: bytes | str, structure_id: str = "uploaded") -> StructureData:
    """Parse PDB content and normalize it into app-owned StructureData.

    Biopython stays inside this module. Everything downstream receives plain
    Pydantic records, which keeps analysis code independent from parser details.
    """
    text = decode_pdb_content(content)
    structure = parse_biopython_structure(text, structure_id)
    return structure_to_data(structure)


def parse_pdb_path(path: str | Path, structure_id: str | None = None) -> StructureData:
    path = Path(path)
    if not path.exists():
        raise StructureParseError(f"PDB file not found: {path}")

    return parse_pdb_content(path.read_bytes(), structure_id=structure_id or path.stem)


def decode_pdb_content(content: bytes | str) -> str:
    if isinstance(content, bytes):
        if not content or not content.strip():
            raise StructureParseError("The uploaded PDB file is empty.")
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise StructureParseError("The uploaded file must be a text PDB file.") from exc

    if not content or not content.strip():
        raise StructureParseError("The uploaded PDB file is empty.")
    return content


def parse_biopython_structure(text: str, structure_id: str):
    try:
        with NamedTemporaryFile("w+", suffix=".pdb") as handle:
            handle.write(text)
            handle.flush()
            parser = PDBParser(QUIET=True)
            structure = parser.get_structure(structure_id, handle.name)
    except Exception as exc:  # Biopython can raise several parser-specific errors.
        raise StructureParseError(f"Could not parse PDB file: {exc}") from exc

    if not list(structure.get_atoms()):
        raise StructureParseError("The uploaded PDB file does not contain atoms.")

    return structure


def structure_to_data(structure) -> StructureData:
    atoms: list[AtomRecord] = []
    residues: list[ResidueRecord] = []
    chains: list[ChainSummary] = []
    ligands: list[LigandSummary] = []
    warnings: list[str] = []

    models = list(structure.get_models())
    if len(models) > 1:
        warnings.append("Multiple models found; only the first model was analyzed.")
    model = models[0]

    for chain in model.get_chains():
        chain_atom_count = 0
        chain_protein_residue_count = 0

        for residue in chain.get_residues():
            residue_kind = classify_residue(residue)
            residue_number = format_residue_number(residue)
            residue_id = make_residue_id(chain.id, residue)
            atom_ids: list[str] = []

            if residue_kind == "protein":
                chain_protein_residue_count += 1

            for atom in residue.get_atoms():
                atom_id = f"{residue_id}:{atom.get_name().strip()}"
                coord = atom.get_coord()
                atom_record = AtomRecord(
                    id=atom_id,
                    name=atom.get_name().strip(),
                    element=(getattr(atom, "element", "") or "").strip(),
                    x=round(float(coord[0]), 3),
                    y=round(float(coord[1]), 3),
                    z=round(float(coord[2]), 3),
                    chain_id=chain.id,
                    residue_id=residue_id,
                    residue_name=residue.get_resname().strip(),
                    residue_number=residue_number,
                    residue_kind=residue_kind,
                )
                atoms.append(atom_record)
                atom_ids.append(atom_id)
                chain_atom_count += 1

            residues.append(
                ResidueRecord(
                    id=residue_id,
                    name=residue.get_resname().strip(),
                    chain_id=chain.id,
                    residue_number=residue_number,
                    kind=residue_kind,
                    atom_ids=atom_ids,
                )
            )

            if residue_kind == "ligand":
                ligands.append(
                    LigandSummary(
                        name=residue.get_resname().strip(),
                        chain_id=chain.id,
                        residue_number=residue_number,
                        atom_count=len(atom_ids),
                    )
                )

        chains.append(
            ChainSummary(
                id=chain.id,
                residue_count=chain_protein_residue_count,
                atom_count=chain_atom_count,
            )
        )

    return StructureData(
        structure_id=str(structure.id),
        atoms=atoms,
        residues=residues,
        chains=chains,
        ligands=ligands,
        warnings=warnings,
    )


def classify_residue(residue) -> ResidueKind:
    hetero_flag = residue.id[0].strip()
    residue_name = residue.get_resname().strip()

    if not hetero_flag:
        return "protein"
    if residue_name in WATER_NAMES:
        return "water"
    if hetero_flag:
        return "ligand"
    return "other"


def format_residue_number(residue) -> str:
    _, sequence_number, insertion_code = residue.id
    insertion = insertion_code.strip()
    return f"{sequence_number}{insertion}" if insertion else str(sequence_number)


def make_residue_id(chain_id: str, residue) -> str:
    hetero_flag, sequence_number, insertion_code = residue.id
    insertion = insertion_code.strip()
    hetero = hetero_flag.strip() or "protein"
    return f"{chain_id}:{hetero}:{sequence_number}:{insertion}"
