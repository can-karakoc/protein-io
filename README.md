# Protein Interaction Explorer

Protein Interaction Explorer is an open-source computational biology web app for exploring protein structure interactions. The MVP lets a scientist upload a PDB file, visualize the structure, parse chains/residues/ligands, calculate residue and protein-ligand contacts, and export a clean interaction report.

The project is intentionally simple for the public MVP: no authentication, no database, no Docker, no queues, and no cloud storage.

## MVP Features

- Upload a local PDB file.
- Parse atoms, residues, chains, and ligands.
- Summarize chain counts, residue counts, ligand records, and atom counts.
- Calculate residue-residue contacts.
- Calculate protein-ligand contacts when ligands are present.
- Ignore hydrogen atoms during contact detection.
- Use spatial indexing for contact search.
- Return warnings for useful analysis context.
- Expose a FastAPI backend with health and analysis endpoints.
- Upload or load a sample PDB in the frontend.
- Render structures with 3Dmol.js.
- Show summary cards, chain table, ligand table, and contact table.
- Export contacts as CSV.
- Prepare frontend API calls through `NEXT_PUBLIC_API_URL`.

## Tech Stack

Frontend:

- Next.js
- TypeScript
- Tailwind CSS
- 3Dmol.js
- Vercel

Backend:

- FastAPI
- Python
- Biopython `Bio.PDB`
- Pydantic
- pytest
- Render

## Repo Structure

```text
protein-interaction-explorer/
  README.md
  render.yaml
  frontend/
    .env.example
    src/lib/api.ts
  backend/
    requirements.txt
    pyproject.toml
    app/
      main.py
      routes.py
      service.py
      models.py
      parser.py
      contacts.py
      csv_export.py
    tests/
  examples/
    sample.pdb
  docs/
```

## Local Development

Backend:

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer
python3 -m venv .venv
.venv/bin/pip install -e 'backend[dev]'
.venv/bin/uvicorn app.main:app --reload --app-dir backend --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

Expected:

```json
{"status":"ok"}
```

Frontend:

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer/frontend
cp .env.example .env.local
npm install
npm run dev
```

Local frontend API variable:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Open:

```text
http://localhost:3000
```

## Backend Tests

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer
.venv/bin/pytest backend/tests
```

The tests cover parser behavior, ligand detection, contact calculation, spatial indexing, route behavior, CORS origin parsing, and bad upload handling.

## API

Health:

```text
GET /health
```

Analyze:

```text
POST /analyze
POST /api/analyze
```

The analysis endpoint accepts a multipart PDB upload and an optional `cutoff_angstrom` form value.

Response shape:

```json
{
  "version": "0.1.0",
  "summary": {
    "atom_count": 0,
    "residue_count": 0,
    "chain_count": 0,
    "ligand_count": 0,
    "contact_count": 0
  },
  "chains": [],
  "ligands": [],
  "contacts": [],
  "warnings": []
}
```

## Deployment

Frontend target: Vercel.

Frontend environment variable:

```text
NEXT_PUBLIC_API_URL=https://your-render-backend.onrender.com
```

Backend target: Render.

Render settings:

```text
Root Directory: backend
Build Command: pip install -r requirements.txt
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

Backend environment variable:

```text
FRONTEND_ORIGIN=https://your-vercel-app.vercel.app
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Roadmap

- v0.1 MVP launch: PDB upload, visualization, backend analysis, CSV export, Vercel + Render deployment.
- v0.2 public demo polish: better sample workflow, UI states, screenshots, demo docs.
- v0.3 scientific credibility: richer biology explanations, validation, chain/ligand highlighting.
- v0.4 database-connected version: saved reports and shareable URLs.
- v0.5 AI-structure support: AlphaFold, ColabFold, Boltz, OpenFold-style outputs and confidence panels.

See [docs/RELEASE_PLAN.md](docs/RELEASE_PLAN.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Screenshots

Sample loaded in the deployed app:

![Protein Interaction Explorer sample loaded](docs/screenshots/protein-io-sample-loaded.png)

Sample analysis results:

![Protein Interaction Explorer analysis results](docs/screenshots/protein-io-analysis.png)

Contact table:

![Protein Interaction Explorer contact table](docs/screenshots/protein-io-contacts.png)

## Documentation

- [Action Plan](docs/ACTION_PLAN.md)
- [Architecture](docs/architecture.md)
- [Biology Notes](docs/biology_notes.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Git Workflow](docs/GIT_WORKFLOW.md)
- [Manual QA Checklist](docs/MANUAL_QA.md)
- [MVP Scope](docs/MVP_SCOPE.md)
- [Decisions](docs/DECISIONS.md)
- [Release Plan](docs/RELEASE_PLAN.md)
