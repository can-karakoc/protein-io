from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
from typing import Literal

import gemmi

from app.models import AtomRecord, ChainSummary, LigandSummary, ResidueRecord, ResidueKind, StructureData


WATER_NAMES = {"HOH", "WAT", "H2O"}
GEMMI_PROTEIN_HET_FLAG = "A"
GEMMI_HETATM_FLAG = "H"
StructureFormat = Literal["pdb", "mmcif"]
PDB_SUFFIXES = {".pdb", ".ent"}
MMCIF_SUFFIXES = {".cif", ".mmcif"}


class StructureParseError(ValueError):
    """Raised when uploaded structure content cannot be parsed into useful data."""


def parse_pdb_content(
    content: bytes | str,
    structure_id: str = "uploaded",
    file_format: StructureFormat | None = None,
) -> StructureData:
    """Parse structure content and normalize it into app-owned StructureData.

    Gemmi stays inside this module. Everything downstream receives plain
    Pydantic records, which keeps analysis code independent from parser details.
    """
    text = decode_structure_content(content)
    structure = parse_gemmi_structure(text, structure_id, file_format=file_format)
    return structure_to_data(structure)


def parse_pdb_path(path: str | Path, structure_id: str | None = None) -> StructureData:
    path = Path(path)
    if not path.exists():
        raise StructureParseError(f"Structure file not found: {path}")

    return parse_pdb_content(
        path.read_bytes(),
        structure_id=structure_id or path.stem,
        file_format=detect_structure_format_from_filename(path.name),
    )


def decode_structure_content(content: bytes | str) -> str:
    if isinstance(content, bytes):
        if not content or not content.strip():
            raise StructureParseError("The uploaded structure file is empty.")
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise StructureParseError("The uploaded structure file must be plain text.") from exc

    if not content or not content.strip():
        raise StructureParseError("The uploaded structure file is empty.")
    return content


def parse_gemmi_structure(
    text: str,
    structure_id: str,
    file_format: StructureFormat | None = None,
) -> gemmi.Structure:
    resolved_format = file_format or detect_structure_format_from_content(text)
    try:
        structure = gemmi.read_structure_string(text, format=gemmi_coordinate_format(resolved_format))
        structure.name = structure_id
    except Exception as exc:
        raise StructureParseError(f"Could not parse {format_label(resolved_format)} file: {exc}") from exc

    if not any(True for model in structure for chain in model for residue in chain for _ in residue):
        raise StructureParseError("The uploaded structure file does not contain atoms.")

    return structure


def detect_structure_format_from_filename(filename: str | None) -> StructureFormat | None:
    if not filename:
        return None

    suffix = Path(filename).suffix.lower()
    if suffix in PDB_SUFFIXES:
        return "pdb"
    if suffix in MMCIF_SUFFIXES:
        return "mmcif"
    return None


def detect_structure_format_from_content(text: str) -> StructureFormat:
    stripped = text.lstrip()
    if stripped.startswith("data_") or "_atom_site." in stripped[:5000]:
        return "mmcif"
    return "pdb"


def gemmi_coordinate_format(file_format: StructureFormat) -> gemmi.CoorFormat:
    if file_format == "mmcif":
        return gemmi.CoorFormat.Mmcif
    return gemmi.CoorFormat.Pdb


def format_label(file_format: StructureFormat) -> str:
    if file_format == "mmcif":
        return "mmCIF"
    return "PDB"


def structure_to_data(structure: gemmi.Structure) -> StructureData:
    atoms: list[AtomRecord] = []
    residues: list[ResidueRecord] = []
    chain_counts: OrderedDict[str, dict[str, int]] = OrderedDict()
    ligands: list[LigandSummary] = []
    warnings: list[str] = []

    if len(structure) > 1:
        warnings.append("Multiple models found; only the first model was analyzed.")
    model = structure[0]

    for chain in model:
        chain_count = chain_counts.setdefault(chain.name, {"atoms": 0, "protein_residues": 0})

        for residue in chain:
            residue_kind = classify_residue(residue)
            residue_number = format_residue_number(residue)
            residue_id = make_residue_id(chain.name, residue, residue_kind)
            atom_ids: list[str] = []

            if residue_kind == "protein":
                chain_count["protein_residues"] += 1

            for atom in residue:
                atom_name = atom.name.strip()
                atom_id = f"{residue_id}:{atom_name}"
                atom_record = AtomRecord(
                    id=atom_id,
                    name=atom_name,
                    element=atom.element.name.strip(),
                    x=round(float(atom.pos.x), 3),
                    y=round(float(atom.pos.y), 3),
                    z=round(float(atom.pos.z), 3),
                    chain_id=chain.name,
                    residue_id=residue_id,
                    residue_name=residue.name.strip(),
                    residue_number=residue_number,
                    residue_kind=residue_kind,
                )
                atoms.append(atom_record)
                atom_ids.append(atom_id)
                chain_count["atoms"] += 1

            residues.append(
                ResidueRecord(
                    id=residue_id,
                    name=residue.name.strip(),
                    chain_id=chain.name,
                    residue_number=residue_number,
                    kind=residue_kind,
                    atom_ids=atom_ids,
                )
            )

            if residue_kind == "ligand":
                ligands.append(
                    LigandSummary(
                        name=residue.name.strip(),
                        chain_id=chain.name,
                        residue_number=residue_number,
                        atom_count=len(atom_ids),
                    )
                )

    chains = [
        ChainSummary(
            id=chain_id,
            residue_count=counts["protein_residues"],
            atom_count=counts["atoms"],
        )
        for chain_id, counts in chain_counts.items()
    ]

    return StructureData(
        structure_id=structure.name,
        atoms=atoms,
        residues=residues,
        chains=chains,
        ligands=ligands,
        warnings=warnings,
    )


def classify_residue(residue: gemmi.Residue) -> ResidueKind:
    residue_name = residue.name.strip()

    if residue.het_flag == GEMMI_PROTEIN_HET_FLAG:
        return "protein"
    if residue_name in WATER_NAMES:
        return "water"
    if residue.het_flag == GEMMI_HETATM_FLAG:
        return "ligand"
    return "other"


def format_residue_number(residue: gemmi.Residue) -> str:
    insertion = residue.seqid.icode.strip()
    return f"{residue.seqid.num}{insertion}" if insertion else str(residue.seqid.num)


def make_residue_id(chain_id: str, residue: gemmi.Residue, residue_kind: ResidueKind) -> str:
    insertion = residue.seqid.icode.strip()
    hetero = hetero_id(residue, residue_kind)
    return f"{chain_id}:{hetero}:{residue.seqid.num}:{insertion}"


def hetero_id(residue: gemmi.Residue, residue_kind: ResidueKind) -> str:
    if residue_kind == "protein":
        return "protein"
    if residue_kind == "water":
        return "W"
    if residue_kind == "ligand":
        return f"H_{residue.name.strip()}"
    return residue.het_flag.strip() or "other"
