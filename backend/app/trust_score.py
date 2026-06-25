from __future__ import annotations
from typing import Literal
from app.models import ContactRecord

TrustLabel = Literal[
    "high-confidence",
    "inspect-manually",
    "low-confidence",
    "possible-clash",
    "no-confidence-data",
]

_LOW_PLDDT_CATEGORIES = frozenset({"low", "very_low"})


def assign_trust_label(contact: ContactRecord) -> TrustLabel:
    """Assign a review heuristic label to a contact. Not a validated scientific metric."""
    if "possible-clash" in contact.contact_categories:
        return "possible-clash"

    src = contact.source_residue_confidence
    tgt = contact.target_residue_confidence

    if src is None and tgt is None:
        return "no-confidence-data"

    src_low = src is not None and src.category in _LOW_PLDDT_CATEGORIES
    tgt_low = tgt is not None and tgt.category in _LOW_PLDDT_CATEGORIES

    if src_low or tgt_low:
        return "low-confidence"

    src_high = src is not None and src.category == "very_high"
    tgt_high = tgt is not None and tgt.category == "very_high"

    if src_high and tgt_high:
        return "high-confidence"

    return "inspect-manually"
