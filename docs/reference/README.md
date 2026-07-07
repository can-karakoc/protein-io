# Protein I/O — Technical Reference

Protein I/O is a **confidence-aware review layer for protein structures**: it ingests an
experimental or predicted structure (upload, RCSB PDB, or AlphaFold DB), computes a large set
of interpretable metrics **in-house** (no GPU, no external binaries), and presents them in an
interactive workbench. It reviews structures; it does not predict or design them.

This directory is the authoritative technical reference for the codebase.

| Doc | What it covers |
|---|---|
| [architecture.md](architecture.md) | System topology, request/data flow, the stateless-backend contract, deployment. |
| [features.md](features.md) | Every user-facing feature: the three modes, all result tabs, exports, and the AI features. |
| [methods.md](methods.md) | **The science.** Every computed metric — algorithm, thresholds, assumptions, limitations, and literature references. |
| [api.md](api.md) | REST endpoint reference. |
| [modules.md](modules.md) | Backend (`app/*.py`) and frontend (`src/`) module-by-module reference. |
| [dependencies.md](dependencies.md) | Every third-party library, what it is used for, and license notes. |

## Design constraints (why the code looks the way it does)

These constraints are load-bearing — most implementation choices trace back to one of them:

1. **No GPU, no inference.** The app never runs a neural network to *generate* structure. It
   analyses what it is given. (LLM narration is the one exception and is opt-in / gated.)
2. **No external binaries.** Everything ships as a pip wheel — no DSSP, HMMER, freesasa,
   TM-align, or MSMS binary. Where a standard tool needs a binary, an in-house numpy/scipy
   implementation replaces it (SASA, lDDT, DockQ, secondary structure, pockets, clashes).
3. **Deploy-safe on a small box.** The backend targets a 512 MB Render instance. Heavy passes
   (validity, pockets, antibody, BSA) are gated to the interactive path and fail soft.
4. **Stateless backend.** No database, no session state. Each request is self-contained; all
   persistence lives in the browser (IndexedDB). See [architecture.md](architecture.md).
5. **Honest metrics.** Every number is either directly computed or clearly labelled an estimate.
   Heuristic labels (e.g. contact trust) say so explicitly and are never presented as validated.
