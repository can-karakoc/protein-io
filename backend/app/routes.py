import logging
from time import perf_counter
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from starlette.responses import Response

from app.chat import run_chat
from app.integrations.alphafold import AlphaFoldFetchError
from app.integrations.boltz import BoltzParseError, parse_boltz_confidence
from app.integrations.chai import ChaiParseError, parse_chai_scores
from app.models import AlphaFoldAnalysisResponse, AnalysisResponse, BatchAnalysisResponse, ChemblTargetSummary, FoldseekSearchResult, RcsbAnalysisResponse, StructureComparisonResponse, StructureMetadata
from app.pae import PaeParseError, analyze_pae_json
from app.integrations.rcsb import RcsbFetchError
from app.parser import StructureParseError
from app.service import analyze_alphafold_id_with_timing, analyze_pdb_content_with_timing, analyze_rcsb_id_with_timing, compare_pdb_contents, elapsed_ms


router = APIRouter()
logger = logging.getLogger(__name__)
TIMING_HEADER = "X-ProteinIO-Timing"


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


async def _parse_confidence_sidecar(
    pae_file: UploadFile | None,
    confidence_file: UploadFile | None,
) -> tuple[object, object, list[str], str | None]:
    """Return (pae_summary, global_scores, warnings, source_hint) from whichever sidecar was supplied.

    source_hint is "boltz", "chai", or None — used to seed metadata.source when the CIF
    has no _software.name block (e.g. files exported without provenance headers).
    Priority: confidence_file (Boltz JSON / Chai NPZ) > pae_file (AlphaFold JSON).
    """
    if confidence_file is not None:
        content = await confidence_file.read()
        fname = (confidence_file.filename or "").lower()
        if fname.endswith(".npz"):
            try:
                pae, scores, warnings = parse_chai_scores(content)
                return pae, scores, warnings, "chai"
            except ChaiParseError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
        else:
            try:
                pae, scores, warnings = parse_boltz_confidence(content)
                return pae, scores, warnings, "boltz"
            except BoltzParseError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

    if pae_file is not None:
        pae_content = await pae_file.read()
        try:
            pae, pae_warnings = analyze_pae_json(pae_content)
            return pae, None, pae_warnings, None
        except PaeParseError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return None, None, [], None


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(
    response: Response,
    file: UploadFile = File(...),
    pae_file: UploadFile | None = File(None),
    confidence_file: UploadFile | None = File(None),
    cutoff_angstrom: float = Form(4.0),
) -> AnalysisResponse:
    if cutoff_angstrom <= 0:
        raise HTTPException(status_code=400, detail="cutoff_angstrom must be greater than zero.")

    try:
        read_started = perf_counter()
        content = await file.read()
        pae, global_scores, sidecar_warnings, source_hint = await _parse_confidence_sidecar(pae_file, confidence_file)
        read_ms = elapsed_ms(read_started)
        # Seed metadata with source hint so the CIF badge shows even without _software.name
        hint_metadata = StructureMetadata(source=source_hint) if source_hint else None  # type: ignore[arg-type]
        analysis = analyze_pdb_content_with_timing(
            content,
            filename=file.filename,
            cutoff_angstrom=cutoff_angstrom,
            metadata=hint_metadata,
            pae=pae,
            pae_warnings=sidecar_warnings,
            global_scores=global_scores,
            include_validity=True,
        )
        timing_header = analysis.timing.as_header_value(read_ms=read_ms)
        response.headers[TIMING_HEADER] = timing_header
        logger.info("analysis timing filename=%s %s", file.filename or "uploaded", timing_header)
        return analysis.response
    except StructureParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/analyze", response_model=AnalysisResponse)
async def analyze_api(
    response: Response,
    file: UploadFile = File(...),
    pae_file: UploadFile | None = File(None),
    confidence_file: UploadFile | None = File(None),
    cutoff_angstrom: float = Form(4.0),
) -> AnalysisResponse:
    return await analyze(
        response=response,
        file=file,
        pae_file=pae_file,
        confidence_file=confidence_file,
        cutoff_angstrom=cutoff_angstrom,
    )


@router.post("/api/compare", response_model=StructureComparisonResponse)
async def compare_structures(
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...),
    cutoff_angstrom: float = Form(4.0),
) -> StructureComparisonResponse:
    if cutoff_angstrom <= 0:
        raise HTTPException(status_code=400, detail="cutoff_angstrom must be greater than zero.")

    try:
        content_a = await file_a.read()
        content_b = await file_b.read()
        return compare_pdb_contents(
            content_a,
            content_b,
            filename_a=file_a.filename,
            filename_b=file_b.filename,
            cutoff_angstrom=cutoff_angstrom,
        )
    except StructureParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/batch/analyze", response_model=BatchAnalysisResponse)
async def batch_analyze_structures(
    files: list[UploadFile] = File(...),
    cutoff_angstrom: float = Form(4.0),
) -> BatchAnalysisResponse:
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 structures per batch request.")
    if cutoff_angstrom <= 0:
        raise HTTPException(status_code=400, detail="cutoff_angstrom must be greater than zero.")
    from app.batch import batch_analyze
    file_contents = [(f.filename or f"file_{i}", await f.read()) for i, f in enumerate(files)]
    return await batch_analyze(file_contents, cutoff_angstrom=cutoff_angstrom)


@router.get("/api/rcsb/{pdb_id}/analyze", response_model=RcsbAnalysisResponse)
async def analyze_rcsb(
    pdb_id: str,
    response: Response,
    cutoff_angstrom: float = 4.0,
) -> RcsbAnalysisResponse:
    if cutoff_angstrom <= 0:
        raise HTTPException(status_code=400, detail="cutoff_angstrom must be greater than zero.")

    try:
        fetch_started = perf_counter()
        analysis = analyze_rcsb_id_with_timing(pdb_id, cutoff_angstrom=cutoff_angstrom)
        fetch_ms = elapsed_ms(fetch_started) - analysis.timing.total_ms
        timing_header = f"fetch_ms={max(fetch_ms, 0):.2f}, {analysis.timing.as_header_value()}"
        response.headers[TIMING_HEADER] = timing_header
        logger.info("analysis timing pdb_id=%s %s", pdb_id, timing_header)
        return analysis.response
    except RcsbFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except StructureParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/alphafold/{uniprot_id}/analyze", response_model=AlphaFoldAnalysisResponse)
async def analyze_alphafold(
    uniprot_id: str,
    response: Response,
    cutoff_angstrom: float = 4.0,
) -> AlphaFoldAnalysisResponse:
    if cutoff_angstrom <= 0:
        raise HTTPException(status_code=400, detail="cutoff_angstrom must be greater than zero.")

    try:
        fetch_started = perf_counter()
        analysis = analyze_alphafold_id_with_timing(uniprot_id, cutoff_angstrom=cutoff_angstrom)
        fetch_ms = elapsed_ms(fetch_started) - analysis.timing.total_ms
        timing_header = f"fetch_ms={max(fetch_ms, 0):.2f}, {analysis.timing.as_header_value()}"
        response.headers[TIMING_HEADER] = timing_header
        logger.info("analysis timing uniprot_id=%s %s", uniprot_id, timing_header)
        return analysis.response
    except AlphaFoldFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except StructureParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Foldseek ─────────────────────────────────────────────────────────────────

@router.post("/api/foldseek/search", response_model=FoldseekSearchResult)
async def foldseek_search(
    file: UploadFile = File(...),
) -> FoldseekSearchResult:
    """Submit a structure to Foldseek and return ranked structural neighbours."""
    from app.integrations.foldseek import FoldseekError, search_foldseek
    content = await file.read()
    try:
        return await search_foldseek(content, file.filename or "structure.cif")
    except FoldseekError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Foldseek search failed: {exc}") from exc


# ── ChEMBL target context ─────────────────────────────────────────────────────

@router.get("/api/chembl/{uniprot_id}/summary", response_model=ChemblTargetSummary | None)
async def chembl_summary(uniprot_id: str) -> ChemblTargetSummary | None:
    """Known-binder / bioactivity summary for a target by UniProt accession."""
    from app.integrations.chembl import ChemblError, fetch_chembl_summary
    try:
        return await fetch_chembl_summary(uniprot_id)
    except ChemblError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ChEMBL lookup failed: {exc}") from exc


# ── Chat ─────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    analysis: AnalysisResponse
    messages: list[dict[str, Any]]
    comparison: dict[str, Any] | None = None


class ChatResponse(BaseModel):
    reply: str | None
    tool_calls: list[dict[str, Any]]
    error: str | None = None


@router.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    result = await run_chat(request.analysis, request.messages, request.comparison)
    return ChatResponse(**result)
