import logging
from time import perf_counter

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from starlette.responses import Response

from app.integrations.alphafold import AlphaFoldFetchError
from app.models import AlphaFoldAnalysisResponse, AnalysisResponse, BatchAnalysisResponse, RcsbAnalysisResponse, StructureComparisonResponse
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


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(
    response: Response,
    file: UploadFile = File(...),
    pae_file: UploadFile | None = File(None),
    cutoff_angstrom: float = Form(4.0),
) -> AnalysisResponse:
    if cutoff_angstrom <= 0:
        raise HTTPException(status_code=400, detail="cutoff_angstrom must be greater than zero.")

    try:
        read_started = perf_counter()
        content = await file.read()
        pae_content = await pae_file.read() if pae_file is not None else None
        read_ms = elapsed_ms(read_started)
        pae, pae_warnings = analyze_pae_json(pae_content) if pae_content is not None else (None, [])
        analysis = analyze_pdb_content_with_timing(
            content,
            filename=file.filename,
            cutoff_angstrom=cutoff_angstrom,
            pae=pae,
            pae_warnings=pae_warnings,
        )
        timing_header = analysis.timing.as_header_value(read_ms=read_ms)
        response.headers[TIMING_HEADER] = timing_header
        logger.info("analysis timing filename=%s %s", file.filename or "uploaded", timing_header)
        return analysis.response
    except StructureParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PaeParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/analyze", response_model=AnalysisResponse)
async def analyze_api(
    response: Response,
    file: UploadFile = File(...),
    pae_file: UploadFile | None = File(None),
    cutoff_angstrom: float = Form(4.0),
) -> AnalysisResponse:
    return await analyze(response=response, file=file, pae_file=pae_file, cutoff_angstrom=cutoff_angstrom)


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
