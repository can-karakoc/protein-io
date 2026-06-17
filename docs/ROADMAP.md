# Roadmap

## Phase 1: Backend MVP

- Implement `/health`.
- Implement `/api/analyze`.
- Accept multipart PDB upload.
- Support `distance_cutoff` parameter.
- Return `AnalysisResult`.
- Add FastAPI endpoint tests.

## Phase 2: Frontend MVP

- Scaffold Next.js with TypeScript and Tailwind CSS.
- Build upload panel.
- Add distance cutoff input.
- Send file to backend.
- Display loading and error states.
- Render structure with 3Dmol.js.
- Display summary cards.
- Display chain, ligand, and contact tables.
- Add CSV export button.
- Verify the frontend/backend flow with local servers.

## Phase 3: Documentation and Polish

- Complete `docs/architecture.md`.
- Complete `docs/biology_notes.md`.
- Add screenshots.
- Add exact local run commands.
- Add deployment notes.
- Keep `docs/RELEASE_PLAN.md` updated before public launch.
- Improve sample-file workflow.

## Phase 4: Public Demo

- Deploy frontend.
- Deploy backend on Render using `render.yaml`.
- Configure `FRONTEND_ORIGIN` on Render after Vercel frontend deploy.
- Add minimal health monitoring.
- Test public demo with sample PDB.

## Later Enhancements

- Fetch by PDB ID.
- Add mmCIF support.
- Add AlphaFold, ColabFold, and Boltz output viewing.
- Add background model prediction jobs.
- Add saved/shareable reports.
- Add richer contact categories.
- Add chain coloring and ligand highlighting in the viewer.
- Add downloadable PDF or HTML reports.
