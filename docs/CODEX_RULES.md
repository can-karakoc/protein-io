# Codex Rules for This Project

## Workspace

- Work in `/Users/cankarakoc/Codex/protein-interaction-explorer`.
- Do not create duplicate project folders outside `/Users/cankarakoc/Codex`.
- Preserve user changes. Do not reset or discard uncommitted work unless explicitly asked.

## Build Order

Follow this order unless the user redirects:

1. Repo structure.
2. Backend parser and contact logic.
3. Backend tests.
4. FastAPI endpoints.
5. Frontend upload flow.
6. 3Dmol.js viewer.
7. Result tables and cards.
8. CSV export.
9. README and docs polish.
10. Exact run commands.

## Engineering Style

- Prefer clarity over cleverness.
- Keep files readable and well-commented, but avoid noisy comments.
- Do not introduce major libraries beyond the agreed stack without asking.
- Use existing project patterns once they exist.
- Add focused tests for backend behavior.
- Keep FastAPI route handlers thin.
- Keep parser and analysis logic independent from FastAPI upload/request objects.
- Do not let Biopython objects leak outside `parser.py`; convert to `StructureData`.
- New analysis modules should accept `StructureData` and return typed Pydantic models.
- Preserve the long-term direction: structural biology workspace with future mmCIF, RCSB fetch, AlphaFold/ColabFold/Boltz/OpenFold outputs, ligand analysis, structure comparison, confidence/metadata panels, reports, and eventually plugin-style analysis modules.
- Do not implement future systems until requested; keep the MVP focused.

## MVP Constraints

- No authentication.
- No database.
- No background queue.
- No live model inference.
- No mmCIF until PDB flow works.
- No shareable reports until the core app works.
- No plugin registry until there are real analysis modules that need one.

## Teaching Requirement

For major components, explain:

- what file changed
- what the component or function does
- why it exists
- how it connects to the rest of the app
- what should be understood manually rather than blindly accepted

## Verification

Run backend tests after backend changes:

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer
.venv/bin/pytest backend/tests
```

When the frontend exists, run its build and visually verify the app before calling UI work complete.

## Deployment

- Backend target is Render.
- Frontend target is Vercel.
- Keep backend CORS controlled by `FRONTEND_ORIGIN`.
- Frontend backend requests should use `NEXT_PUBLIC_API_URL`.
- Render backend uses root directory `backend`, build command `pip install -r requirements.txt`, and start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- Do not add Docker unless Render native Python deployment becomes insufficient.
