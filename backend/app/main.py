import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import router


def get_allowed_origins() -> list[str]:
    configured_origins = os.getenv("FRONTEND_ORIGIN", "")
    origins = ["http://localhost:3000", "http://localhost:3001"]
    origins.extend(origin.strip() for origin in configured_origins.split(",") if origin.strip())
    return list(dict.fromkeys(origins))


app = FastAPI(title="Protein Interaction Explorer API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-ProteinIO-Timing"],
)

app.include_router(router)
