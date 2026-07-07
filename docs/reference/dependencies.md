# Dependencies

Every runtime dependency is a **pip wheel or npm package** — no external binaries (no DSSP, HMMER,
freesasa, TM-align, or MSMS binary). This is what makes the backend deploy-safe on a 512 MB box.

## Backend (Python — `backend/requirements.txt`)

| Package | Version | Used for |
|---|---|---|
| `fastapi` | ≥ 0.115 | HTTP API framework. |
| `uvicorn[standard]` | ≥ 0.30 | ASGI server. |
| `pydantic` | ≥ 2.8 | Response schema / validation (`app/models.py`). |
| `python-multipart` | ≥ 0.0.9 | File-upload parsing. |
| `python-dotenv` | ≥ 1.0 | Load `.env` (API key, `CHAT_ENABLED`). |
| `httpx` | ≥ 0.27 | Outbound fetch (RCSB, AlphaFold, UniProt, ChEMBL). |
| `gemmi` | ≥ 0.7.5 | PDB/mmCIF parsing, structure model. |
| `numpy` | ≥ 1.26 | All numeric geometry (contacts, SASA, lDDT, DockQ, clashes, PAE). |
| `scipy` | ≥ 1.11 | KD-tree neighbour search, linear algebra (SASA, lDDT, DockQ). |
| `rdkit` | ≥ 2024.9.1 | Ligand chemistry (SMILES, descriptors, conformers, strain). |
| `posebusters` | ≥ 0.3.1 | Ligand physical-validity suite (`mol` config). |
| `antpack` | 0.3.8.6.3 | Antibody Fv/CDR numbering (IMGT/Kabat/Martin/Aho) — replaces the ANARCI+HMMER binary. |
| `tmtools` | ≥ 0.0.3 | TM-align (fold clustering / comparison) — replaces the TM-align binary. |
| `anthropic` | ≥ 0.112 | LLM features only (chat / review / batch query); unused when `CHAT_ENABLED` is off. |

**Note on size:** RDKit + PoseBusters are the heavy wheels; on a memory-starved instance they can be
dropped and ligand validity simply fails soft. AntPack v0.3.x is GPL, so the project is licensed
GPLv3.

## Frontend (npm — `frontend/package.json`)

| Package | Used for |
|---|---|
| `next` (16) · `react` / `react-dom` (19) | App framework + UI runtime. |
| `molstar` | 3-D structure viewer. |
| `zustand` | Client state store (persisted to IndexedDB). |
| `framer-motion` | Mode/tab transitions and micro-interactions. |
| `lucide-react` | Icon set. |
| `react-markdown` + `remark-gfm` | Rendering LLM narration / reports. |
| `jspdf` + `jspdf-autotable` | PDF structure / campaign reports. |
| `nanoid` | Client-side ids. |
| `@vercel/analytics` | Usage analytics. |
| `tailwindcss` (v4) + `@tailwindcss/postcss` | Utility CSS (colours come from `--pio-*` tokens, not Tailwind palette). |
| `typescript`, `eslint`, `eslint-config-next`, `@types/*` | Tooling (dev). |

## External data providers (network, no dependency)

RCSB PDB · AlphaFold DB · UniProt · ChEMBL · Foldseek — fetched over HTTPS at request time; the
backend stores nothing.

## The one hosted service: Anthropic

`claude-sonnet-4-6` powers the three opt-in LLM features. It is **off on the public deployment**
(`CHAT_ENABLED=false`) and requires a self-provided `ANTHROPIC_API_KEY` to enable locally.
