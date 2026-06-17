from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.models import AnalysisResponse
from app.parser import StructureParseError
from app.service import analyze_pdb_content


router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(
    file: UploadFile = File(...),
    cutoff_angstrom: float = Form(4.0),
) -> AnalysisResponse:
    if cutoff_angstrom <= 0:
        raise HTTPException(status_code=400, detail="cutoff_angstrom must be greater than zero.")

    try:
        content = await file.read()
        return analyze_pdb_content(content, filename=file.filename, cutoff_angstrom=cutoff_angstrom)
    except StructureParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/analyze", response_model=AnalysisResponse)
async def analyze_api(
    file: UploadFile = File(...),
    cutoff_angstrom: float = Form(4.0),
) -> AnalysisResponse:
    return await analyze(file=file, cutoff_angstrom=cutoff_angstrom)
