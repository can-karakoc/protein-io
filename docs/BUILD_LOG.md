# Build Log

## 2026-06-17

### Repository Setup

- Created monorepo structure:
  - `frontend/`
  - `backend/`
  - `examples/`
  - `docs/`

### Backend Analysis Module

- Added `backend/app/models.py`.
- Added `backend/app/parser.py`.
- Added `backend/app/contacts.py`.
- Added `backend/app/csv_export.py`.
- Added `backend/pyproject.toml`.
- Added `examples/sample.pdb`.

### Tests

- Added parser tests.
- Added contact tests.
- Created local virtual environment.
- Installed backend dev dependencies.
- Ran backend tests successfully.

Verification:

```text
7 passed
```

### Backend Architecture Refactor

- Added normalized internal models:
  - `AtomRecord`
  - `ResidueRecord`
  - `StructureData`
  - `StructureSummary`
  - `AnalysisResponse`
- Refactored `parser.py` so Biopython objects stay inside the parser module.
- Refactored `contacts.py` so it accepts `StructureData`.
- Added `service.py` to orchestrate parse, summarize, contact analysis, and response construction.
- Added `routes.py` with thin `/health`, `/analyze`, and `/api/analyze` endpoints.
- Added `main.py` to create the FastAPI app and register routes.
- Added route tests.

Verification:

```text
12 passed
```

### Contact Search Spatial Index

- Replaced naive pairwise contact iteration with a cutoff-sized spatial hash grid.
- Kept exact distance checks after neighbor lookup.
- Added a unit test for contacts across neighboring grid cells.
- Recorded long-term project direction in project memory.

### Render Backend Deployment Prep

- Added `render.yaml` for a Render Python web service with `rootDir: backend`.
- Added backend `requirements.txt`.
- Added Python 3.12.8 pins.
- Made CORS origins configurable with `FRONTEND_ORIGIN`.
- Added frontend `NEXT_PUBLIC_API_URL` helper and `.env.example`.
- Added deployment docs for Render backend plus future Vercel frontend.
- Added release plan.

### Frontend MVP Shell

- Scaffolded Next.js App Router frontend.
- Added upload panel, sample PDB loader, cutoff input, analyze action, reset action.
- Added 3Dmol.js structure viewer.
- Added summary cards and chain, ligand, and contact tables.
- Added CSV export for contacts.
- Added frontend API helper using `NEXT_PUBLIC_API_URL`.
- Added public sample PDB for local demo flow.

### Viewer and Ligand Empty-State Fix

- Fixed 3Dmol viewer containment so the canvas stays inside the viewer panel.
- Removed the parser warning for protein-only structures with no ligands.
- Confirmed `ala_phe_ala.pdb` returns `ligand_count: 0`, no warnings, and residue-residue contacts.

### Workspace Move

- Project canonical location is now `/Users/cankarakoc/Codex/protein-interaction-explorer`.
- Added `/Users/cankarakoc/Codex/AGENTS.md` as the workspace convention for future Codex projects.

### Documentation

- Added project README, license, and documentation memory files.
- Updated docs to explain `StructureData`, thin routes, service orchestration, and future parser/module expansion.
