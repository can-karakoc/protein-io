from __future__ import annotations

from collections import defaultdict

from app.models import ConfidenceCategory, ConfidenceSummary, ResidueConfidence, StructureData


PREDICTED_STRUCTURE_MARKERS = ("alphafold", "colabfold", "openfold", "boltz", "plddt", "af-")


def analyze_plddt_confidence(structure: StructureData) -> tuple[ConfidenceSummary | None, list[ResidueConfidence], list[str]]:
    """Interpret B-factor values as pLDDT for predicted-structure uploads."""
    if not looks_like_predicted_structure(structure.structure_id):
        return None, [], []

    residue_scores = plddt_by_residue(structure)
    if not residue_scores:
        return None, [], ["Predicted-structure filename detected, but no protein pLDDT values were found."]

    residue_confidences = [
        ResidueConfidence(
            chain_id=chain_id,
            residue_number=residue_number,
            residue_name=residue_name,
            plddt=round(score, 2),
            category=confidence_category(score),
        )
        for (chain_id, residue_number, residue_name), score in sorted(residue_scores.items())
    ]
    summary = confidence_summary(residue_confidences)
    warnings = confidence_warnings(summary)
    return summary, residue_confidences, warnings


def looks_like_predicted_structure(structure_id: str) -> bool:
    normalized = structure_id.lower()
    return any(marker in normalized for marker in PREDICTED_STRUCTURE_MARKERS)


def plddt_by_residue(structure: StructureData) -> dict[tuple[str, str, str], float]:
    scores_by_residue: dict[tuple[str, str, str], list[float]] = defaultdict(list)

    for atom in structure.atoms:
        if atom.residue_kind != "protein" or atom.b_factor is None:
            continue
        if not 0 <= atom.b_factor <= 100:
            continue
        key = (atom.chain_id, atom.residue_number, atom.residue_name)
        scores_by_residue[key].append(atom.b_factor)

    return {key: sum(scores) / len(scores) for key, scores in scores_by_residue.items() if scores}


def confidence_category(plddt: float) -> ConfidenceCategory:
    if plddt >= 90:
        return "very_high"
    if plddt >= 70:
        return "confident"
    if plddt >= 50:
        return "low"
    return "very_low"


def confidence_summary(residue_confidences: list[ResidueConfidence]) -> ConfidenceSummary:
    very_high_count = count_category(residue_confidences, "very_high")
    confident_count = count_category(residue_confidences, "confident")
    low_count = count_category(residue_confidences, "low")
    very_low_count = count_category(residue_confidences, "very_low")
    average_plddt = sum(residue.plddt for residue in residue_confidences) / len(residue_confidences)

    return ConfidenceSummary(
        residue_count=len(residue_confidences),
        average_plddt=round(average_plddt, 2),
        very_high_count=very_high_count,
        confident_count=confident_count,
        low_count=low_count,
        very_low_count=very_low_count,
        low_confidence_count=low_count + very_low_count,
    )


def count_category(residue_confidences: list[ResidueConfidence], category: ConfidenceCategory) -> int:
    return sum(1 for residue in residue_confidences if residue.category == category)


def confidence_warnings(summary: ConfidenceSummary) -> list[str]:
    if summary.low_confidence_count == 0:
        return []

    return [
        (
            f"{summary.low_confidence_count} residues have low or very low predicted confidence; "
            "interpret contacts involving these regions cautiously."
        )
    ]
