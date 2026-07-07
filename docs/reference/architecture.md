# Architecture

## Topology

```
┌────────────────────────────┐        HTTPS/JSON        ┌────────────────────────────┐
│  Frontend (Next.js 16)     │  ───────────────────────▶ │  Backend (FastAPI)         │
│  React 19 · Mol* viewer    │  ◀─────────────────────── │  Python · gemmi/numpy/scipy│
│  Zustand + IndexedDB state │                           │  stateless, no DB          │
│  Vercel (static/SSR)       │                           │  Render (512 MB, no GPU)   │
└────────────────────────────┘                           └────────────────────────────┘
        │                                                          │
        │ browser only                                            │ outbound fetch only
        ▼                                                          ▼
  localStorage / IndexedDB                              RCSB · AlphaFold DB · UniProt · ChEMBL
```

- **Frontend**: `frontend/` — Next.js app router, one root component (`WorkspaceShell`). The 3-D
  viewer is Mol*. All state is client-side (Zustand store persisted to IndexedDB). The API base
  URL is `NEXT_PUBLIC_API_URL` (falls back to `http://localhost:8000`).
- **Backend**: `backend/` — FastAPI (`app/main.py` builds the app, `app/routes.py` defines the
  endpoints). Pure Python analysis; the only outbound calls are to public data providers
  (RCSB, AlphaFold DB, UniProt, ChEMBL) — never to a database or a stateful service.

## Request / data flow

A typical "analyse" cycle:

1. User provides a structure — an uploaded file, an RCSB PDB id, or an AlphaFold UniProt id.
2. Frontend calls the matching endpoint (`POST /api/analyze`, `GET /api/rcsb/{id}/analyze`,
   `GET /api/alphafold/{id}/analyze`).
3. Backend parses the structure with **gemmi** (`app/parser.py` → `StructureData`), then runs the
   analysis pipeline (`app/service.py::analyze_pdb_content_with_timing`): contacts, interactions,
   confidence, PAE-derived metrics, interfaces, and — on the interactive path — pockets, clashes,
   ligand validity, antibody annotation, BSA.
4. The result is one `AnalysisResponse` (`app/models.py`) — a single self-describing JSON object.
5. Frontend stores it in the Zustand workspace and renders it across the result tabs.

Confidence sidecars (PAE / ipTM / pTM JSON from Boltz, Chai, AlphaFold) are optional second
inputs, matched to a structure and merged into the same `AnalysisResponse`.

## The stateless-backend contract

The backend holds **no state between requests** — no database, no session, no cache of user data.
This is intentional and load-bearing:

- **Privacy**: the hosted backend receives a structure only for the duration of one request and
  keeps nothing. Self-hosting keeps data entirely on the user's machine.
- **Scaling / cost**: any instance can serve any request; nothing to migrate or back up.
- **Persistence lives in the browser.** The Zustand store (`src/lib/workspaceStore.ts`) is
  persisted to **IndexedDB** (key `pio_workspace_v2`) via a debounced storage adapter. Loaded
  structures, their analyses, comparison results, batch results, chat history, and AI-review
  results all survive reloads client-side. A separate `localStorage` cache
  (`pio_public_structure_cache_v2`) restores the last RCSB/AlphaFold structure; UI preferences use
  `pio_workbench_preferences_v1`.

Because there is no server persistence, expensive results (comparison, batch, chat) are cached in
the browser so a refresh never silently re-bills compute or an LLM call.

## Performance gating

The full analysis has a cheap "core" (parse, contacts, interactions, confidence) always run, and
a heavier "validity" tier (`include_validity=True`) that adds pockets, atom-level clashes, ligand
physical validity, antibody annotation, and interface BSA. Public RCSB/AlphaFold fetches run the
full tier; the plain `/analyze` upload path runs core-only unless asked. Every heavy pass is
wrapped to **fail soft** — if it errors or the box runs low on memory, that section is dropped and
the rest of the response still returns.

## Deployment

- **Frontend → Vercel**, auto-deployed on push to `main`. `NEXT_PUBLIC_API_URL` points at the
  backend. LLM features are compiled off in production via `CHAT_ENABLED` / `NEXT_PUBLIC_ENABLE_CHAT`.
- **Backend → Render** (free tier: 512 MB RAM, no GPU) from `render.yaml`, `pip install -r
  backend/requirements.txt`. `CHAT_ENABLED` and `ANTHROPIC_API_KEY` are environment-controlled;
  chat / AI-review / batch-query are disabled on the public deployment to avoid API-credit drain.
- **Self-host**: run the backend anywhere Python runs and point `NEXT_PUBLIC_API_URL` at it; the
  `clients/python` package is a thin HTTP client for the same API ("bring your own backend").
