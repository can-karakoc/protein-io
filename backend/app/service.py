from dataclasses import dataclass
from time import perf_counter

from app.contacts import calculate_contacts
from app.contact_classification import summarize_interactions, summarize_ligand_interactions
from app.confidence import analyze_plddt_confidence
from app.integrations.alphafold import AlphaFoldStructure, fetch_alphafold_structure
from app.integrations.rcsb import fetch_rcsb_structure
from app.integrations.rcsb import RcsbStructure
from app.models import AlphaFoldAnalysisResponse, AnalysisResponse, PaeSummary, RcsbAnalysisResponse, StructureMetadata
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


@dataclass(frozen=True)
class TimedRcsbAnalysis:
    response: RcsbAnalysisResponse
    timing: AnalysisTiming


@dataclass(frozen=True)
class TimedAlphaFoldAnalysis:
    response: AlphaFoldAnalysisResponse
    timing: AnalysisTiming


def analyze_pdb_content(
    content: bytes,
    filename: str | None = None,
    cutoff_angstrom: float = 4.0,
    pae: PaeSummary | None = None,
    pae_warnings: list[str] | None = None,
) -> AnalysisResponse:
    """Run the MVP analysis pipeline for uploaded structure content."""
    return analyze_pdb_content_with_timing(
        content,
        filename=filename,
        cutoff_angstrom=cutoff_angstrom,
        pae=pae,
        pae_warnings=pae_warnings,
    ).response


def analyze_pdb_content_with_timing(
    content: bytes,
    filename: str | None = None,
    cutoff_angstrom: float = 4.0,
    metadata: StructureMetadata | None = None,
    pae: PaeSummary | None = None,
    pae_warnings: list[str] | None = None,
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
    confidence, residue_confidences, confidence_warnings = analyze_plddt_confidence(structure)
    summary = structure.summary.model_copy(update={"contact_count": len(contacts)})
    response = AnalysisResponse(
        summary=summary,
        metadata=metadata,
        confidence=confidence,
        residue_confidences=residue_confidences,
        pae=pae,
        interaction_summary=summarize_interactions(contacts),
        ligand_interactions=summarize_ligand_interactions(contacts),
        chains=structure.chains,
        ligands=structure.ligands,
        contacts=contacts,
        warnings=[*structure.warnings, *contact_warnings, *confidence_warnings, *(pae_warnings or [])],
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


def analyze_rcsb_id_with_timing(
    pdb_id: str,
    cutoff_angstrom: float = 4.0,
) -> TimedRcsbAnalysis:
    rcsb_structure = fetch_rcsb_structure(pdb_id)
    analysis = analyze_pdb_content_with_timing(
        rcsb_structure.content,
        filename=rcsb_structure.filename,
        cutoff_angstrom=cutoff_angstrom,
        metadata=rcsb_structure.metadata,
    )
    return TimedRcsbAnalysis(
        response=rcsb_response_from_structure(rcsb_structure, analysis.response),
        timing=analysis.timing,
    )


def analyze_alphafold_id_with_timing(
    uniprot_id: str,
    cutoff_angstrom: float = 4.0,
) -> TimedAlphaFoldAnalysis:
    alphafold_structure = fetch_alphafold_structure(uniprot_id)
    analysis = analyze_pdb_content_with_timing(
        alphafold_structure.content,
        filename=alphafold_structure.filename,
        cutoff_angstrom=cutoff_angstrom,
        metadata=alphafold_structure.metadata,
    )
    return TimedAlphaFoldAnalysis(
        response=alphafold_response_from_structure(alphafold_structure, analysis.response),
        timing=analysis.timing,
    )


def rcsb_response_from_structure(
    rcsb_structure: RcsbStructure,
    analysis: AnalysisResponse,
) -> RcsbAnalysisResponse:
    return RcsbAnalysisResponse(
        filename=rcsb_structure.filename,
        structure_text=rcsb_structure.content.decode("utf-8"),
        analysis=analysis,
    )


def alphafold_response_from_structure(
    alphafold_structure: AlphaFoldStructure,
    analysis: AnalysisResponse,
) -> AlphaFoldAnalysisResponse:
    return AlphaFoldAnalysisResponse(
        filename=alphafold_structure.filename,
        structure_text=alphafold_structure.content.decode("utf-8"),
        analysis=analysis,
    )


def structure_id_from_filename(filename: str | None) -> str:
    if not filename:
        return "uploaded"
    return filename.rsplit("/", maxsplit=1)[-1].rsplit(".", maxsplit=1)[0] or "uploaded"


def elapsed_ms(started_at: float) -> float:
    return (perf_counter() - started_at) * 1000
