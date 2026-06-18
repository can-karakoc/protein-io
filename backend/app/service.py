from dataclasses import dataclass
from time import perf_counter

from app.contacts import calculate_contacts
from app.models import AnalysisResponse
from app.parser import detect_structure_format_from_filename, parse_pdb_content


@dataclass(frozen=True)
class AnalysisTiming:
    parse_ms: float
    contacts_ms: float
    response_ms: float

    @property
    def total_ms(self) -> float:
        return self.parse_ms + self.contacts_ms + self.response_ms

    def as_header_value(self, read_ms: float | None = None) -> str:
        parts = []
        if read_ms is not None:
            parts.append(f"read_ms={read_ms:.2f}")
        parts.extend(
            [
                f"parse_ms={self.parse_ms:.2f}",
                f"contacts_ms={self.contacts_ms:.2f}",
                f"response_ms={self.response_ms:.2f}",
                f"analysis_ms={self.total_ms:.2f}",
            ]
        )
        return ", ".join(parts)


@dataclass(frozen=True)
class TimedAnalysis:
    response: AnalysisResponse
    timing: AnalysisTiming


def analyze_pdb_content(
    content: bytes,
    filename: str | None = None,
    cutoff_angstrom: float = 4.0,
) -> AnalysisResponse:
    """Run the MVP analysis pipeline for uploaded structure content."""
    return analyze_pdb_content_with_timing(
        content,
        filename=filename,
        cutoff_angstrom=cutoff_angstrom,
    ).response


def analyze_pdb_content_with_timing(
    content: bytes,
    filename: str | None = None,
    cutoff_angstrom: float = 4.0,
) -> TimedAnalysis:
    """Run analysis and return coarse timings for development diagnostics."""
    structure_id = structure_id_from_filename(filename)

    parse_started = perf_counter()
    structure = parse_pdb_content(
        content,
        structure_id=structure_id,
        file_format=detect_structure_format_from_filename(filename),
    )
    parse_ms = elapsed_ms(parse_started)

    contacts_started = perf_counter()
    contacts, contact_warnings = calculate_contacts(structure, cutoff_angstrom=cutoff_angstrom)
    contacts_ms = elapsed_ms(contacts_started)

    response_started = perf_counter()
    summary = structure.summary.model_copy(update={"contact_count": len(contacts)})
    response = AnalysisResponse(
        summary=summary,
        chains=structure.chains,
        ligands=structure.ligands,
        contacts=contacts,
        warnings=[*structure.warnings, *contact_warnings],
    )
    response_ms = elapsed_ms(response_started)

    return TimedAnalysis(
        response=response,
        timing=AnalysisTiming(
            parse_ms=parse_ms,
            contacts_ms=contacts_ms,
            response_ms=response_ms,
        ),
    )


def structure_id_from_filename(filename: str | None) -> str:
    if not filename:
        return "uploaded"
    return filename.rsplit("/", maxsplit=1)[-1].rsplit(".", maxsplit=1)[0] or "uploaded"


def elapsed_ms(started_at: float) -> float:
    return (perf_counter() - started_at) * 1000
