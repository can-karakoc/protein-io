import logging
from time import perf_counter

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from starlette.responses import Response

from app.models import AnalysisResponse
from app.parser import StructureParseError
from app.service import analyze_pdb_content_with_timing, elapsed_ms


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
    cutoff_angstrom: float = Form(4.0),
) -> AnalysisResponse:
    if cutoff_angstrom <= 0:
        raise HTTPException(status_code=400, detail="cutoff_angstrom must be greater than zero.")

    try:
        read_started = perf_counter()
        content = await file.read()
        read_ms = elapsed_ms(read_started)
        analysis = analyze_pdb_content_with_timing(content, filename=file.filename, cutoff_angstrom=cutoff_angstrom)
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
    cutoff_angstrom: float = Form(4.0),
) -> AnalysisResponse:
    return await analyze(response=response, file=file, cutoff_angstrom=cutoff_angstrom)
