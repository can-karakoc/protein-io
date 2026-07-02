from __future__ import annotations

from app.models import AnalysisResponse, BatchAnalysisResponse, BatchDesignEntry
from app.service import _add_interface_bsa, analyze_pdb_content


async def batch_analyze(
    files: list[tuple[str, bytes]],
    cutoff_angstrom: float = 4.0,
) -> BatchAnalysisResponse:
    entries: list[BatchDesignEntry] = []
    for filename, content in files:
        try:
            analysis: AnalysisResponse = analyze_pdb_content(content, filename=filename, cutoff_angstrom=cutoff_angstrom)
            # Interface buried surface area for multimer designs (the key binder-campaign
            # metric). Fast + fail-soft; skipped for single-chain designs.
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
