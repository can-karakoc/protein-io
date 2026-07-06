# Protein Interaction Explorer

Protein Interaction Explorer is an open-source structural biology workspace for uploading, fetching, visualizing, analyzing, and reporting protein structures. The MVP lets a scientist upload a PDB or mmCIF file, optionally attach an AlphaFold PAE JSON sidecar, fetch a PDB ID from RCSB, fetch a predicted model from AlphaFold DB by UniProt accession, visualize the structure, parse chains/residues/ligands, calculate categorized contacts, summarize interaction participants, and export a clean interaction report.

The project is intentionally simple for the public MVP: no authentication, no database, no Docker, no queues, and no cloud storage.

## MVP Features

- Upload a local PDB or mmCIF file.
- Attach an optional AlphaFold-style PAE JSON sidecar for uploaded structures.
- Fetch a deposited structure by PDB ID from RCSB.
- Fetch a predicted AlphaFold DB model by UniProt accession.
- Parse atoms, residues, chains, and ligands.
- Summarize chain counts, residue counts, ligand records, and atom counts.
- Calculate residue-residue contacts.
- Calculate protein-ligand contacts when ligands are present.
- Categorize contacts as protein-protein, protein-ligand, protein-water, ligand-water, intra-chain, inter-chain, or very close.
- Summarize top contacting residues, top contacting ligands, closest contacts, ligand interaction details, and category counts.
- Detect AlphaFold-style pLDDT confidence values from predicted structures.
- Color predicted structures by pLDDT confidence in Mol*.
- Summarize PAE sidecars with residue count, mean PAE, max PAE, and high-error pair count.
- Ignore hydrogen atoms during contact detection.
- Use Gemmi NeighborSearch for contact search.
- Return warnings for useful analysis context.
- Expose a FastAPI backend with health and analysis endpoints.
- Upload PDB/mmCIF files or load a sample PDB in the frontend.
- Fetch RCSB mmCIF structures from a PDB ID.
- Fetch AlphaFold DB mmCIF structures from a UniProt accession.
- Render structures with Mol*.
- Show RCSB/AlphaFold metadata, confidence summaries, PAE summaries, interaction summaries, ligand interaction summaries, summary cards, chain table, ligand table, and contact table.
- Filter the contact table by contact category.
- Compare local, RCSB, or AlphaFold structures using residue-level shared, gained, and lost contact identities.
- Export contacts and ligand interaction summaries as CSV.
- Export representative comparison examples as CSV.
- Prepare frontend API calls through `NEXT_PUBLIC_API_URL`.

Very-close-contact flags identify heavy-atom pairs under 2.0 Å for review. They are not proof of a steric clash and may include expected covalent geometry.

Public RCSB and AlphaFold analyses may be retained in browser local storage so they survive a refresh. Uploaded local coordinates and PAE sidecars are not persisted.

## Tech Stack

Frontend:

- Next.js
- TypeScript
- Tailwind CSS
- Mol*
- Vercel

Backend:

- FastAPI
- Python
- Gemmi
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
      pae.py
      contacts.py
      contact_classification.py
      integrations/
      csv_export.py
    tests/
  examples/
    sample.pdb
    sample.cif
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

The tests cover PDB and mmCIF parser behavior, PAE sidecar parsing, ligand detection, contact calculation, contact classification, interaction summaries, neighbor search, RCSB PDB ID validation, AlphaFold DB UniProt validation, route behavior, CORS origin parsing, and bad upload handling.

## API

### Python client (local-first)

Protein I/O is local-first — there is **no hosted public API**. Run a backend yourself and
drive it from Python with the [`proteinio`](clients/python) client (`pip install ./clients/python`):

```python
from proteinio import Client
pio = Client("http://localhost:8000")     # a backend you run
a = pio.analyze_pdb("1hsg")
print(a["summary"]["contact_count"], len(a["pockets"]))
```

The client wraps `analyze_pdb` / `analyze_alphafold` / `analyze_file` / `compare` /
`batch_analyze` / `batch_cluster` / `chembl` / `versions`. See
[clients/python/README.md](clients/python/README.md). Interactive OpenAPI docs are served at
`/docs` when the backend runs.

### Endpoints

Health:

```text
GET /health
GET /api/versions
```

Analyze:

```text
POST /analyze
POST /api/analyze
GET /api/rcsb/{pdb_id}/analyze
GET /api/alphafold/{uniprot_id}/analyze
```

The analysis endpoint accepts a multipart PDB, `.cif`, or `.mmcif` upload, an optional `pae_file` JSON sidecar, and an optional `cutoff_angstrom` form value.
The RCSB endpoint accepts a 4-character PDB ID and optional `cutoff_angstrom` query value, fetches mmCIF coordinates, and returns fetched structure text plus analysis results. Removed or superseded entries can still be analyzed when coordinates are available; metadata marks them as `removed` and includes replacement IDs, for example `1HHB` replaced by `2HHB`, `3HHB`, and `4HHB`.
The AlphaFold endpoint accepts a UniProt accession such as `P69905`, fetches AlphaFold DB metadata and an mmCIF model, then returns the same analysis shape. AlphaFold DB models are predicted monomers; no model inference is run by this app.

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
  "metadata": null,
  "confidence": null,
  "pae": null,
  "interaction_summary": null,
  "residue_confidences": [],
  "chains": [],
  "ligands": [],
  "contacts": [],
  "warnings": []
}
```

RCSB response shape:

```json
{
  "filename": "4HHB.cif",
  "structure_format": "cif",
  "structure_text": "data_...",
  "analysis": {
    "version": "0.1.0",
    "summary": {},
    "metadata": {
      "source": "rcsb",
      "status": "current",
      "pdb_id": "4HHB",
      "replaced_by": []
    },
    "confidence": null,
    "pae": null,
    "interaction_summary": null,
    "residue_confidences": [],
    "chains": [],
    "ligands": [],
    "contacts": [],
    "warnings": []
  }
}
```

AlphaFold response shape:

```json
{
  "filename": "AF-P69905-F1-model_v4.cif",
  "structure_format": "cif",
  "structure_text": "data_...",
  "analysis": {
    "version": "0.1.0",
    "summary": {},
    "metadata": {
      "source": "alphafold",
      "status": "current",
      "uniprot_id": "P69905",
      "alphafold_url": "https://alphafold.ebi.ac.uk/entry/P69905",
      "model_version": 4
    },
    "confidence": null,
    "pae": null,
    "interaction_summary": null,
    "residue_confidences": [],
    "chains": [],
    "ligands": [],
    "contacts": [],
    "warnings": []
  }
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

- v0.1 MVP launch: PDB/mmCIF upload, visualization, backend analysis, CSV export, Vercel + Render deployment.
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
- [Performance Baseline](docs/PERFORMANCE_BASELINE.md)
- [Product Direction](docs/PRODUCT_DIRECTION.md)
- [Release Plan](docs/RELEASE_PLAN.md)

## License

Protein I/O is licensed under the **GNU General Public License v3.0 or later** (see
[`LICENSE`](LICENSE)). It was previously MIT; it moved to GPLv3 to incorporate
[**AntPack**](https://pypi.org/project/antpack/) (GPL) for antibody Fv numbering — a
pip-installable, HMMER-free alternative to ANARCI that keeps the "no binaries,
deploy-safe" property. Antibody detection still fails soft to an in-house estimate if
AntPack isn't available.
