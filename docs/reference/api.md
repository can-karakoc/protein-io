# API Reference

FastAPI backend (`backend/app/routes.py`). All analysis endpoints return a single self-describing
JSON object (`AnalysisResponse` or a wrapper of it). The backend is stateless — no auth, no
sessions; each request is self-contained. Base URL is configured on the frontend via
`NEXT_PUBLIC_API_URL`.

## Health & provenance

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness — `{"status": "ok"}`. |
| `GET` | `/api/versions` | App + key library versions (gemmi, numpy, scipy, rdkit, …) for the methods report. |

## Analysis

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/analyze` | Analyse an uploaded structure (multipart). Core tier by default. |
| `POST` | `/api/analyze` | Same, JSON-oriented interactive path. |
| `GET` | `/api/rcsb/{pdb_id}/analyze` | Fetch from RCSB + full-tier analysis (validity, pockets, antibody, BSA). |
| `GET` | `/api/alphafold/{uniprot_id}/analyze` | Fetch from AlphaFold DB + UniProt annotations + full-tier analysis. |
| `POST` | `/api/compare` | Compare two structures → summary deltas + shared/gained/lost contacts. |

Query params: `cutoff_angstrom` (default 4.0). Upload paths accept optional confidence
sidecar files.

## Batch

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/batch/analyze` | Analyse up to 50 structures (multipart, optional sidecars, `include_validity`). |
| `POST` | `/api/batch/cluster` | All-vs-all TM-align fold clustering (`tm_threshold`, default 0.5). |
| `POST` | `/api/batch/query` | **LLM.** Natural-language question over the batch metrics. `CHAT_ENABLED`-gated (403 if off). |

## External enrichment

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/foldseek/search` | Structural-similarity search. |
| `GET` | `/api/chembl/{uniprot_id}/summary` | Known-binder / bioactivity context for a target. |

## LLM features (gated)

All three require `CHAT_ENABLED=true` (default on locally, **off on the public deployment**) and a
server `ANTHROPIC_API_KEY`; otherwise `403`. Model: `claude-sonnet-4-6`. Every prompt is grounded
strictly in the computed metrics with an anti-fabrication system prompt.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/chat` | Per-structure Q&A with tool calls over the analysis. |
| `POST` | `/api/copilot/review` | One-shot review → `{assessment, next_experiment}`. |
| `POST` | `/api/batch/query` | Batch NL query → `{answer}`. |

## Limits & behaviour

- Batch: max 50 structures per request; `cutoff_angstrom` and `tm_threshold` are validated (400 on
  bad input).
- Heavy passes fail soft — a section that errors is dropped, the rest of the response returns.
- No rate limiting / API keys on the public backend by design (no hosted analysis API is advertised;
  self-host or use `clients/python` against your own backend).
