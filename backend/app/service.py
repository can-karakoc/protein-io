from dataclasses import dataclass
from time import perf_counter

from app.contacts import calculate_contacts, find_water_bridges
from app.contact_classification import summarize_interactions, summarize_ligand_interactions
from app.comparison import compare_analyses
from app.confidence import analyze_plddt_confidence
from app.interfaces import analyze_interfaces
from app.integrations.alphafold import AlphaFoldStructure, fetch_alphafold_structure
from app.integrations.rcsb import fetch_rcsb_structure
from app.integrations.rcsb import RcsbStructure
from app.integrations.uniprot import fetch_uniprot_annotations
from app.models import AlphaFoldAnalysisResponse, AnalysisResponse, ContactRecord, GlobalModelScores, PaeSummary, RcsbAnalysisResponse, ResidueConfidence, StructureComparisonResponse, StructureMetadata
from app.trust_score import assign_trust_label
from app.parser import detect_model_source_from_cif, detect_structure_format_from_filename, parse_pdb_content


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


def build_confidence_lookup(
    residue_confidences: list[ResidueConfidence],
) -> dict[tuple[str, str], ResidueConfidence]:
    """Map (chain_id, residue_number) → ResidueConfidence for O(1) lookups."""
    return {(rc.chain_id, rc.residue_number): rc for rc in residue_confidences}


def annotate_contacts_with_confidence(
    contacts: list[ContactRecord],
    confidence_lookup: dict[tuple[str, str], ResidueConfidence],
) -> list[ContactRecord]:
    """Return a new list of ContactRecords with pLDDT confidence fields filled in."""
    LOW_CATEGORIES = {"low", "very_low"}
    annotated = []
    for contact in contacts:
        src = confidence_lookup.get((contact.chain_a, contact.residue_a))
        tgt = confidence_lookup.get((contact.chain_b, contact.residue_b))
        warning = bool(
            (src is not None and src.category in LOW_CATEGORIES) or
            (tgt is not None and tgt.category in LOW_CATEGORIES)
        )
        annotated_contact = contact.model_copy(update={
            "source_residue_confidence": src,
            "target_residue_confidence": tgt,
            "confidence_warning": warning,
        })
        annotated.append(annotated_contact.model_copy(update={"trust_label": assign_trust_label(annotated_contact)}))
    return annotated


def analyze_pdb_content(
    content: bytes,
    filename: str | None = None,
    cutoff_angstrom: float = 4.0,
    pae: PaeSummary | None = None,
    pae_warnings: list[str] | None = None,
    global_scores: GlobalModelScores | None = None,
) -> AnalysisResponse:
    """Run the MVP analysis pipeline for uploaded structure content."""
    return analyze_pdb_content_with_timing(
        content,
        filename=filename,
        cutoff_angstrom=cutoff_angstrom,
        pae=pae,
        pae_warnings=pae_warnings,
        global_scores=global_scores,
    ).response


def compare_pdb_contents(
    content_a: bytes,
    content_b: bytes,
    filename_a: str | None = None,
    filename_b: str | None = None,
    cutoff_angstrom: float = 4.0,
) -> StructureComparisonResponse:
    analysis_a = analyze_pdb_content(content_a, filename=filename_a, cutoff_angstrom=cutoff_angstrom)
    analysis_b = analyze_pdb_content(content_b, filename=filename_b, cutoff_angstrom=cutoff_angstrom)
    return compare_analyses(analysis_a, analysis_b)


PREDICTED_SOURCES = {"alphafold", "boltz", "chai"}


def analyze_pdb_content_with_timing(
    content: bytes,
    filename: str | None = None,
    cutoff_angstrom: float = 4.0,
    metadata: StructureMetadata | None = None,
    pae: PaeSummary | None = None,
    pae_warnings: list[str] | None = None,
    global_scores: GlobalModelScores | None = None,
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

    # Auto-detect Boltz/Chai/AlphaFold from CIF header when not already known
    if metadata is None:
        try:
            text = content.decode("utf-8", errors="replace")
            detected = detect_model_source_from_cif(text)
            if detected in PREDICTED_SOURCES:
                metadata = StructureMetadata(source=detected)  # type: ignore[arg-type]
        except Exception:
            pass

    contacts_started = perf_counter()
    contacts, contact_warnings = calculate_contacts(structure, cutoff_angstrom=cutoff_angstrom)
    water_bridges = find_water_bridges(structure)
    contacts_ms = elapsed_ms(contacts_started)

    response_started = perf_counter()
    is_predicted = metadata is not None and metadata.source in PREDICTED_SOURCES
    confidence, residue_confidences, confidence_warnings = analyze_plddt_confidence(
        structure, force_predicted=is_predicted
    )
    confidence_lookup = build_confidence_lookup(residue_confidences)
    contacts = annotate_contacts_with_confidence(contacts, confidence_lookup)
    summary = structure.summary.model_copy(update={"contact_count": len(contacts)})
    interface_analysis = analyze_interfaces(contacts, residue_confidences)
    response = AnalysisResponse(
        summary=summary,
        metadata=metadata,
        global_scores=global_scores,
        confidence=confidence,
        residue_confidences=residue_confidences,
        pae=pae,
        interaction_summary=summarize_interactions(contacts),
        ligand_interactions=summarize_ligand_interactions(contacts, water_bridges=water_bridges, ligands=structure.ligands),
        water_bridges=water_bridges,
        chains=structure.chains,
        ligands=structure.ligands,
        contacts=contacts,
        interface_analysis=interface_analysis,
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
    uniprot_annotations = fetch_uniprot_annotations(uniprot_id)
    enriched = analysis.response.model_copy(update={"uniprot_annotations": uniprot_annotations})
    return TimedAlphaFoldAnalysis(
        response=alphafold_response_from_structure(alphafold_structure, enriched),
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
