# Project Memory

## Canonical Location

This project lives at:

```text
/Users/cankarakoc/Codex/protein-interaction-explorer
```

All Codex-created source projects should live under `/Users/cankarakoc/Codex`.

## Product Goal

Build a launched MVP web app that lets a user upload a PDB protein structure file, visualize it in the browser, analyze chains, residues, ligands, and contacts, and export a clean interaction report.

## Future Direction

Grow this into an open-source structural biology workspace. The long-term direction includes PDB upload, mmCIF support, PDB ID fetching from RCSB, AlphaFold/ColabFold/Boltz/OpenFold-style output support, ligand analysis, contact analysis, structure comparison, confidence and metadata panels, report exports, and future plugin-style analysis modules.

Do not build all of that now. The MVP should stay focused, but backend boundaries should preserve the path: parsers convert inputs into `StructureData`, analysis modules consume `StructureData`, and services compose those modules into API responses.

## Current Implementation State

Completed:

- Monorepo skeleton created.
- Backend analysis models created, including normalized `StructureData`.
- PDB parser implemented with Biopython and contained inside `parser.py`.
- Chain, residue, atom, and ligand summaries implemented.
- Contact calculation implemented with a default 4.0 angstrom cutoff.
- Contact search uses a simple spatial hash grid instead of all-pairs atom scanning.
- Hydrogen atoms ignored during contact detection.
- Large contact result capping supported.
- Thin FastAPI route layer added.
- Service layer added to orchestrate parser plus contact analysis.
- Render backend deployment config added.
- CORS is configurable with `FRONTEND_ORIGIN` for the future Vercel frontend.
- Frontend backend requests should use `NEXT_PUBLIC_API_URL`, defaulting locally to `http://localhost:8000`.
- Next.js frontend scaffolded with upload panel, sample loader, 3Dmol viewer, summary cards, chain/ligand/contact tables, and CSV export.
- Protein-only files with no ligands should show an empty ligand table, not an analysis warning.
- 3Dmol viewer container must remain `position: relative` with `overflow: hidden` so the canvas stays inside its panel.
- Backend tests added and passing.
- Sample PDB file added.

Pending:

- Architecture and biology docs expansion.
- Deployment.

## Important Commands

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer
.venv/bin/pytest backend/tests
```

Frontend verification:

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer/frontend
npm run lint
npm run build
```

Render backend start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Render backend settings:

```text
Root Directory: backend
Build Command: pip install -r requirements.txt
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

## Backend Design Notes

- `main.py` creates the FastAPI app and registers routes.
- `routes.py` exposes `/health`, `/analyze`, and `/api/analyze`, but does not contain biology logic.
- `service.py` orchestrates the MVP analysis flow.
- `parser.py` reads PDB content with Biopython and converts it into app-owned `StructureData`.
- `contacts.py` accepts `StructureData` and performs spatial contact detection.
- `contacts.py` uses cutoff-sized grid cells to compare atoms only against nearby cells.
- `models.py` defines both the internal normalized data model and API response contract.
- `csv_export.py` defines stable contact export columns.
- Biopython objects should not leak outside `parser.py`.
- Future parsers should target `StructureData` so mmCIF, RCSB fetches, and model outputs can reuse analysis modules.
- Deployment remains simple: Vercel frontend, Render backend, no Docker, no database, no auth.

## Testing Notes

The backend test suite currently covers:

- sample PDB parsing into `StructureData`
- chain and ligand summaries
- contact result shape
- hydrogen filtering
- capped contact warnings
- empty and invalid file handling
- `/health` and `/analyze` route behavior
