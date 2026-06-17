from app.contacts import calculate_contacts
from app.models import AnalysisResponse
from app.parser import parse_pdb_content


def analyze_pdb_content(
    content: bytes,
    filename: str | None = None,
    cutoff_angstrom: float = 4.0,
) -> AnalysisResponse:
    """Run the MVP analysis pipeline for uploaded PDB content."""
    structure_id = structure_id_from_filename(filename)
    structure = parse_pdb_content(content, structure_id=structure_id)
    contacts, contact_warnings = calculate_contacts(structure, cutoff_angstrom=cutoff_angstrom)

    summary = structure.summary.model_copy(update={"contact_count": len(contacts)})
    return AnalysisResponse(
        summary=summary,
        chains=structure.chains,
        ligands=structure.ligands,
        contacts=contacts,
        warnings=[*structure.warnings, *contact_warnings],
    )


def structure_id_from_filename(filename: str | None) -> str:
    if not filename:
        return "uploaded"
    return filename.rsplit("/", maxsplit=1)[-1].rsplit(".", maxsplit=1)[0] or "uploaded"
