# Git Workflow

Use this workflow when iterating on Protein Interaction Explorer.

## Remote

```text
https://github.com/can-karakoc/protein-io
```

Default branch:

```text
main
```

## Start Work

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer
git status
git checkout main
git pull origin main
git checkout -b feature/descriptive-name
```

## Branch Naming

Use focused names:

```text
feature/frontend-empty-states
feature/contact-table-filters
feature/backend-parser-errors
fix/viewer-canvas-layout
docs/biology-notes
deploy/render-cors
```

## Frontend Iteration

Run locally:

```bash
cd frontend
npm run dev
```

Local frontend API URL:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Checks:

```bash
cd frontend
npm run lint
npm run build
```

## Backend Iteration

Run locally:

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer
.venv/bin/uvicorn app.main:app --app-dir backend --port 8000
```

Tests:

```bash
.venv/bin/pytest backend/tests
```

## Commit

Review first:

```bash
git status
git diff
```

Commit:

```bash
git add -A
git commit -m "Describe the focused change"
```

Push:

```bash
git push -u origin feature/descriptive-name
```

Open a PR into `main`.

## Deployment

Production deployment is based on `main`.

```text
GitHub main
  -> Vercel redeploys frontend
  -> Render redeploys backend
```

Vercel:

```text
NEXT_PUBLIC_API_URL=https://protein-interaction-explorer-api.onrender.com
```

Render:

```text
FRONTEND_ORIGIN=https://protein-io.vercel.app
```

## Rule of Thumb

One branch should do one thing:

- frontend polish only
- backend parser change only
- deployment config only
- docs only

This keeps PRs easy to review and easy to roll back.
