# Manual QA Checklist

Use this checklist before public demo updates and after meaningful frontend or backend changes.

## Local Backend

- `[ ]` Start the backend from the repo root.
- `[ ]` Visit `http://localhost:8000/health`.
- `[ ]` Confirm the response is `{"status":"ok"}`.
- `[ ]` Run `.venv/bin/pytest backend/tests`.

## Local Frontend

- `[ ]` Start the frontend from `frontend/`.
- `[ ]` Open `http://localhost:3000`.
- `[ ]` Confirm the upload panel, sample button, viewer area, summary cards, tables, and export button render.
- `[ ]` Confirm no obvious console errors.

## Sample Flow

- `[ ]` Click `Load sample`.
- `[ ]` Confirm the sample file name appears.
- `[ ]` Confirm the structure renders in the 3D viewer.
- `[ ]` Click `Analyze structure`.
- `[ ]` Confirm summary cards update.
- `[ ]` Confirm chain rows are shown.
- `[ ]` Confirm ligand rows are shown when ligands exist.
- `[ ]` Confirm contact rows are shown.
- `[ ]` Confirm `Export CSV` downloads a contacts CSV.

## Upload Flow

- `[ ]` Upload a local `.pdb` file.
- `[ ]` Confirm the file name appears.
- `[ ]` Confirm the structure renders in the 3D viewer.
- `[ ]` Analyze with the default `4.0` angstrom cutoff.
- `[ ]` Change the cutoff and rerun analysis.
- `[ ]` Confirm contact count changes when appropriate.
- `[ ]` Confirm invalid or empty files show useful errors.

## Deployed Demo

- `[ ]` Open `https://protein-io.vercel.app`.
- `[ ]` Click `Load sample`.
- `[ ]` Click `Analyze structure`.
- `[ ]` Confirm the deployed frontend reaches the deployed backend.
- `[ ]` Confirm the viewer, summary cards, chains, ligands, contacts, and CSV export work.

## Visual Layout

- `[ ]` Check desktop layout.
- `[ ]` Check mobile-width layout.
- `[ ]` Confirm the 3Dmol canvas stays inside its panel.
- `[ ]` Confirm text does not overlap controls or tables.
