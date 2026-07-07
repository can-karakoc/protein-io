# Features

## Input & sources

- **Upload** a `.pdb` / `.cif` / `.mmcif` file (local-first — with a self-hosted backend the file
  never leaves your machine).
- **Fetch by id** from **RCSB PDB** (experimental) or **AlphaFold DB** (predicted, by UniProt id).
- **Confidence sidecars** — optional PAE / ipTM / pTM JSON (Boltz, Chai, AlphaFold) merged into the
  same analysis.
- Structures persist in the browser (IndexedDB); the last public structure and UI preferences are
  restored on reload.

## Modes

The workbench (`WorkspaceShell`) has distinct modes:

- **Explore** — single-structure review: 3-D viewer (Mol*) + the context panel of result tabs.
- **Compare** — two structures (A/B) side by side: summary deltas and shared / gained / lost
  contact identities; exportable.
- **Batch** — a design campaign (up to 50 structures): a ranked metrics table, fold clustering,
  CSV + campaign-report export, and the AI "Ask the batch" query.
- **Chat** *(local only)* — a per-structure assistant that answers questions grounded in the
  computed metrics via tool calls.

## Result tabs (Explore context panel)

| Tab | Contents |
|---|---|
| Overview | Structure identity + source, a rule-based **Review verdict**, and the local **AI review** card. |
| Chains | Per-chain residue/atom counts. |
| Sequence | Per-chain sequence with **secondary-structure** track (P-SEA estimate). |
| Ligands | Bound ligands + **physical validity** (RDKit / PoseBusters / strain). |
| Pockets | LIGSITE-style **binding pockets** by volume with druggability proxy + lining residues. |
| Antibody | Fv chains, **CDR loops**, **numbering-scheme toggle** (IMGT/Kabat/Martin/Aho), **paratope**, SAbDab link. |
| Contacts | Residue–residue contacts, interaction class, confidence-aware **trust labels**, filtering. |
| Interfaces | Chain-pair interfaces, **buried surface area**, and **interface confidence** (iPAE) when a PAE matrix is present. |
| Confidence | Per-residue **pLDDT** distribution and colouring. |
| PAE | PAE heatmap (from the sidecar) + chain spans. |
| Quality | Clashes, and (model vs reference) **lDDT** / **DockQ** where applicable. |
| Methods | Provenance, versioned **methods report**, session exports. |

## 3-D viewer

Mol* viewer with pLDDT vs. structure colouring toggle, named selections driven from the panel
(click a CDR, pocket, ligand, interface, or paratope to highlight it in 3-D), and a floating,
draggable ligand panel.

## Review & AI features

- **Review verdict** (deterministic, always-on, free) — a rule-based synthesis of the computed
  numbers into a good/caution/warn trust assessment plus the specific things to inspect. Cannot
  fabricate; shown at the top of Overview.
- **Explain this metric** (deterministic) — an info popover on each section with a curated,
  accurate plain-English explanation.
- **AI review** *(local only, `CHAT_ENABLED`)* — one-shot LLM narration of the computed metrics into
  a structured **Assessment** + **Next experiment**, strictly over the real numbers. Persisted per
  structure (survives tab-switch + reload).
- **Chat** *(local only)* — per-structure Q&A grounded in the metrics via tool calls; history
  persisted per structure.
- **Ask the batch** *(local only)* — natural-language ranking/filtering across all analysed designs
  in Batch mode.

> The three LLM features hit the Anthropic API, so they are **disabled on the public deployment**
> (`CHAT_ENABLED` off) and run only in local dev / self-host with an `ANTHROPIC_API_KEY`. The
> deterministic review verdict and explain-metric popovers are always on.

## Exports & reproducibility

- **CSV** of contacts / batch metrics.
- **PDF** structure report and **campaign report** (batch).
- **Methods report** — a citable, versioned Markdown provenance doc listing only the methods used,
  with a software-version table (`/api/versions`) and references.
- **Viewer session export** — a PyMOL `.pml` or ChimeraX `.cxc` that reloads the structure, colours
  by pLDDT, and recreates named selections (ligands, pockets, CDRs, interface residues).
- **Shareable session bundle** — one `.json` with all loaded structures + analyses; re-import
  restores the workspace exactly (no re-fetch / recompute).
- **Python client** (`clients/python`) — a pip-installable HTTP client for the same API
  ("bring your own backend").

## External enrichment

- **RCSB / AlphaFold DB** — structure fetch + metadata.
- **UniProt** — sequence/function annotations for AlphaFold entries.
- **ChEMBL** — known-binder / bioactivity context for a target.
- **Foldseek** — structural-similarity search (where configured).

## Light / dark theme

Full theming via CSS custom properties (`--pio-*`); preference persisted.
