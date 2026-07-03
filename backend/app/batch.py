from __future__ import annotations

from app.models import AnalysisResponse, BatchAnalysisResponse, BatchDesignEntry, GlobalModelScores, PaeSummary
from app.service import _add_interface_bsa, analyze_pdb_content_with_timing

# Per-design confidence sidecar, keyed by the structure's filename stem.
Sidecar = tuple[PaeSummary | None, GlobalModelScores | None, list[str]]


async def batch_analyze(
    files: list[tuple[str, bytes]],
    cutoff_angstrom: float = 4.0,
    sidecars: dict[str, Sidecar] | None = None,
    include_validity: bool = False,
) -> BatchAnalysisResponse:
    """Analyze a campaign of designs.

    ``sidecars`` maps a filename stem (e.g. ``design_07``) to its parsed confidence
    (PAE + global ipTM/pTM) so ipTM and interface-PAE become available per design.
    ``include_validity`` runs the RDKit + PoseBusters pass (heavier — opt-in) so
    PB-valid and interface buried surface area are populated. Both fail soft per file.
    """
    sidecars = sidecars or {}
    entries: list[BatchDesignEntry] = []
    for filename, content in files:
        try:
            stem = _stem(filename)
            pae, global_scores, sc_warnings = sidecars.get(stem, (None, None, []))
            timed = analyze_pdb_content_with_timing(
                content,
                filename=filename,
                cutoff_angstrom=cutoff_angstrom,
                pae=pae,
                pae_warnings=sc_warnings,
                global_scores=global_scores,
                include_validity=include_validity,
            )
            analysis: AnalysisResponse = timed.response
            # When validity is off we still want interface BSA (the key binder signal);
            # it's fast enough. Fail-soft; skipped for single-chain designs.
            if not include_validity:
                ia = analysis.interface_analysis
                if ia and ia.chain_pairs:
                    analysis = analysis.model_copy(update={"interface_analysis": _add_interface_bsa(ia, content)})
            entries.append(BatchDesignEntry(filename=filename, analysis=analysis))
        except Exception as exc:
            entries.append(BatchDesignEntry(filename=filename, error=str(exc)))
    succeeded = sum(1 for e in entries if e.error is None)
    return BatchAnalysisResponse(
        entries=entries,
        total=len(entries),
        succeeded=succeeded,
        failed=len(entries) - succeeded,
    )


def _stem(filename: str) -> str:
    """Filename stem used to pair a structure with its sidecar (drop dir + extension)."""
    base = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    # Strip a known structure extension; leave other dots intact.
    for ext in (".pdb", ".cif", ".mmcif", ".ent"):
        if base.lower().endswith(ext):
            return base[: -len(ext)]
    return base
