# Deployment

Protein Interaction Explorer uses a simple public MVP deployment:

- Frontend: Vercel
- Backend: Render FastAPI web service
- No Docker
- No database
- No auth
- No queues or cloud storage

## Frontend on Vercel

The frontend should use this environment variable for backend requests:

```text
NEXT_PUBLIC_API_URL=https://your-render-backend.onrender.com
```

Local frontend development should use:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000
```

The helper in `frontend/src/lib/api.ts` reads `NEXT_PUBLIC_API_URL` and falls back to `http://localhost:8000`.

Vercel setup:

1. Push the repo to GitHub.
2. Create a Vercel project from the repo.
3. Set the frontend root directory to `frontend` after the Next.js app is scaffolded.
4. Add `NEXT_PUBLIC_API_URL` with the Render backend URL.
5. Deploy.

## Backend on Render

The backend is configured for Render with `render.yaml`.

Render settings:

```text
Root Directory: backend
Build Command: pip install -r requirements.txt
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

Python version:

```text
3.12.8
```

Render setup:

1. Push the repo to GitHub.
2. In Render, create a new Blueprint from the GitHub repo.
3. Render reads `render.yaml` from the repo root.
4. Let Render generate the backend `onrender.com` URL.
5. After Vercel deploys the frontend, set `FRONTEND_ORIGIN` in Render.

## Required Environment Variables

Frontend on Vercel:

```text
NEXT_PUBLIC_API_URL=https://your-render-backend.onrender.com
```

Backend on Render:

```text
FRONTEND_ORIGIN=https://your-vercel-app.vercel.app
```

For local development:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000
```

The backend always allows `http://localhost:3000` for local frontend development. `FRONTEND_ORIGIN` adds the deployed Vercel URL.

## Common Deployment Issues

### CORS Errors

If the frontend loads but API requests fail in the browser, check that Render has:

```text
FRONTEND_ORIGIN=https://your-vercel-app.vercel.app
```

The value must include `https://` and must not end with a slash.

### Wrong Backend URL in Vercel

If requests go to localhost in production, set Vercel's `NEXT_PUBLIC_API_URL` and redeploy the frontend.

### Render Build Fails

Confirm Render is using:

```text
Root Directory: backend
Build Command: pip install -r requirements.txt
```

### Render Starts but Health Check Fails

Confirm the start command is:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Then test:

```text
https://your-render-backend.onrender.com/health
```

Expected response:

```json
{"status": "ok"}
```
