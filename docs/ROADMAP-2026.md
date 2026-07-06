# Protein I/O — Roadmap 2026

This document merges the **completed implementation history** with the **2026 forward
direction**. It supersedes the scattered "next iteration" notes in `ACTION_PLAN.md`
and `PRODUCT_DIRECTION.md` for planning purposes; those remain the source of truth for
the original priority definitions.

---

## Positioning (the one-line thesis)

**Protein I/O is the free, open, local-first, no-GPU _review layer_ for predicted
protein structures.** Models like Boltz-2, AlphaFold3, and Chai generate a pose +
confidence + affinity in seconds. They do **not** tell you whether that output is
_trustworthy_: they produce physically invalid poses, their global confidence numbers
mislead, and they hallucinate. Every one of those is a **review** problem, not a
prediction problem.

Commercial tools (Rowan, Neurosnap, Tamarind) sell **hosted compute** — you pay and
you upload your IP to their cloud. The opening for Protein I/O is the opposite: the
tool that reads the output of _any_ model and returns an auditable verdict, runs on a
laptop with no GPU, and never sends data off the machine.

> We never run the models. We review what they emit. This keeps us CPU-only, private,
> and complementary to (not competitive with) Boltz/AF3/Chai.

**Design constraints (unchanged):** no auth, no database, no cloud storage, no
background jobs, no GPU/model inference, keep dependencies reviewable. The one
consciously-approved exception is **RDKit + PoseBusters** (CPU-only, but heavier than
the prior deps) — mandatory to be credible in drug discovery.

---

## ✅ Done (shipped to `main`)

Full detail lives in `ACTION_PLAN.md`. Summary of what exists today:

- **Parsing & fetch:** Gemmi parser (PDB + mmCIF), RCSB fetch + metadata, AlphaFold DB
  fetch by UniProt, PAE JSON sidecar, Boltz-1 and Chai-1 output support (CIF +
  confidence sidecars → pTM/ipTM/pLDDT/PAE).
- **Analysis:** contact detection + 6-way interaction classification (in-house PLIP
  equivalent), pLDDT confidence, per-contact confidence annotation + trust labels,
  ligand interaction summaries (pharmacophore tiers, contact efficiency, water
  bridges), interface analysis (chain-pair cards, interface residues, SVG contact map).
- **Comparison:** structure delta + shared/gained/lost contacts, **TM-align**
  (structural alignment: TM-score + RMSD), **PDF comparison report** (jsPDF).
- **Similarity:** **Foldseek** structural search (pdb100 + afdb50) with a Similar tab.
- **Batch:** multi-file design review, ranked table, CSV export.
- **Workbench:** Mol* viewer, three-mode shell (Explore/Compare/Report), floating
  ligand panel, quality/validation panel, methods/provenance panel, saved runs
  (localStorage), chat workspace (tool-calling agent), dark mode, design-token system.
- **CLI:** `protein-io analyze | compare | batch`.

---

## 🚧 Forward roadmap (2026)

Phases are ordered by **impact ÷ effort**. Each is independently shippable.

### Phase 9 — Physical Validity layer  ✅ DONE (`feat/physical-validity`)

The signature "we understand co-folding failure modes" feature.

- `[x]` **PoseBusters** validity per ligand pose: sanitization, atoms connected, bond
  lengths/angles, internal steric clash, aromatic-ring flatness, double-bond flatness,
  internal energy ratio → a single **PB-valid ✓/✗** badge + per-check breakdown.
- `[x]` **RDKit** ligand chemistry card: 2D depiction (SVG), SMILES, formula, MW, logP,
  HBD, HBA, TPSA, rotatable bonds, ring count, QED, Lipinski pass/violations, PAINS
  alerts.
- `[x]` **Ligand strain energy** (pose vs relaxed conformer, MMFF/UFF).
- `[x]` Robust bond-order perception: CCD template (by residue name) → hydrogen-present
  geometric → heavy-atom neutral fallback. Correctly recovers real heavy-atom-only
  crystal ligands (verified on 1HSG indinavir, 613 Da).
- `[x]` Fail-soft per ligand (ions/cofactors below a heavy-atom floor are flagged, not
  errored); never breaks the core analysis. Opt-in (`include_validity`), off for batch.
- `[x]` Frontend "Physical validity & chemistry" section in the Ligands tab: badges,
  failing-check list, theme-neutral depiction, drug-likeness grid.
- `[x]` 5 new backend tests (172 total pass); RDKit + PoseBusters added as deps.

### Phase 10 — Interface-aware confidence  ✅ DONE (`feat/interface-confidence`)

Global pLDDT/PAE correlate poorly with quality; interface-specific metrics are the fix.

- `[x]` Retain the raw PAE matrix (on `PaeSummary`, excluded from API), aligned to
  protein residues by parse order (guarded on exact count match).
- `[x]` Compute **iPAE** (mean over interface-residue pairs) and **cross-PAE** (all
  inter-chain pairs) per chain pair; interface-pLDDT already on `ChainPairSummary`.
- `[x]` PAE heatmap (downsampled ≤80×80, canvas, chain-block delineation) in the PAE
  tab; per-interface **confidence verdict** (high/moderate/low) in the Interfaces tab.
- `[x]` `interface_pae`, `cross_pae_mean`, `interface_confidence` on `ChainPairSummary`;
  new `PaeMatrix`/`PaeChainBlock` models; `AnalysisResponse.pae_matrix`.
- `[x]` Degrades gracefully when tokens can't be aligned (ligand tokens). 6 new tests
  (184 total pass). Uses real sidecar ipTM/pTM where available (already in `global_scores`).

### Phase 11 — Reference-based benchmarking (Compare)  ✅ DONE (`feat/reference-benchmarking`)

Speak Boltz/AF3's own evaluation language. All metrics in-house (no external deps).

- `[x]` **lDDT** — superposition-free Cα-lDDT (`lddt.py`). A = model vs B = reference.
- `[x]` **DockQ** (Fnat + iRMSD + LRMSD + quality bin) for the primary interface
  (`dockq.py`, numpy Kabsch + scipy contacts).
- `[x]` **lDDT-PLI** — protein–ligand interface lDDT (co-folded pose accuracy).
- `[x]` **Interface buried surface area (dSASA)** — in-house Shrake-Rupley SASA
  (`sasa.py`; freesasa wheel won't build on py3.13/arm64), shown per chain pair in the
  Interfaces tab.
- `[x]` 13 new tests (191 backend pass); all verified e2e on real structures.

### Phase 12 — Function & structural context  ✅ DONE (`feat/phase12-function`)

All in-house, no external binaries.

- `[x]` **ChEMBL target context** (`integrations/chembl.py`): known-binder / bioactivity
  summary by UniProt accession. Overview "Known binders · ChEMBL" panel.
- `[x]` **Binding-pocket detection** (`pockets.py`): in-house LIGSITE-style grid
  (numpy + scipy.ndimage) — 7-direction enclosure + near-surface shell; volume,
  druggability proxy, lining residues. Pockets tab. Verified on 1HSG (active site).
- `[x]` **Secondary structure** (`secondary_structure.py`): in-house P-SEA (Cα geometry)
  helix/sheet/coil. Validated (myoglobin 69% helix; HIV protease sheet-dominant).
- `[x]` **Unified sequence track**: Sequence tab — per-chain canvas track of SS +
  pLDDT band + UniProt domains + composition summary.

### Phase 13 — Design-campaign triage  ✅ DONE (`feat/phase13-campaign-triage`)

Where the real biotech pain lives: the RFdiffusion → MPNN → co-fold → *filter* loop.

- `[x]` Composite ranking upgraded with **interface buried surface area** (dSASA), the key
  binder-campaign signal: batch computes BSA per multimer design (reuses Phase 11 SASA);
  BatchWorkspace score weights in interface size; new sortable BSA column + CSV.
- `[x]` **ipTM / iPAE / PB-valid in the composite** — the batch endpoint now accepts optional
  per-design confidence sidecars (paired by filename stem → ipTM + interface-PAE) and an
  opt-in `include_validity` flag (→ PoseBusters PB-valid + buried area). The composite score
  is now component-based: only signals present in the campaign contribute, weights normalise
  to 100, missing-per-design gets half credit. New conditional columns (ipTM, iPAE, PB-valid).
- `[x]` **Batch structural clustering** — in-house `clustering.py`: all-vs-all TM-align
  (`tmtools`, no binary) → similarity matrix → leader clustering at TM ≥ 0.5, representative
  per cluster. Opt-in `/api/batch/cluster` action; cluster column/badges + breakdown card.
- `[x]` **Shareable campaign report** — self-contained HTML (`campaignReport.ts`), embedded
  styles + data, opens offline in any browser (local-first): ranked table + score formula +
  clusters. Verified e2e (backend 209 tests; browser: 2HHB+3HHB cluster together).

### Phase 14 — Antibody mode  🚧 PARTIAL (`feat/phase14-antibody`)

Antibodies are a large share of biotech; no free review UI offers this.

- `[x]` **Fv detection + real IMGT numbering** (`antibody.py`) — ANARCI needs the HMMER
  binary, so we use **AntPack** instead: a pip wheel (no binary, deploy-safe) giving true
  IMGT numbering + CDR labels across heavy/light/**nanobody (VHH)** chains. AntPack v0.3.x is
  GPL → the project moved MIT→GPLv3. Falls back to an in-house fit-alignment estimate if the
  wheel isn't importable. Gated behind `include_validity`, fail-soft. Verified: trastuzumab/
  rituximab/caplacizumab-VHH detected, hemoglobin/HER2/lysozyme rejected.
- `[x]` **Antibody tab** — VH/VL chains + CDR loops (sequence, residue range, per-CDR mean
  pLDDT), each clickable to highlight the loop in Mol* (new `cdr` selection). 11 backend tests.
- `[ ]` CDR-focused interface view (paratope contacts) + SAbDab context — DEFERRED.
- `[ ]` Kabat/Chothia/Martin/Aho scheme toggle — DEFERRED (AntPack supports them; UI is IMGT-only).

### Phase 15 — Workflow, collaboration, reproducibility  🚧 PARTIAL (`feat/phase15-session-export`)

- `[x]` **PyMOL / ChimeraX session export** (`sessionExport.ts`) — from the Methods tab,
  download a `.pml` or `.cxc` that loads the structure (fetch/open/`alphafold fetch`),
  colours by pLDDT for predicted models, and lays down named selections for ligands
  (sticks), pocket lining residues, antibody CDRs, and interface residues. Pure text, no
  backend, no deps. Verified on 1HSG (ligand/pockets/interface) and P00533 (AlphaFold +
  pLDDT) across both tools.
- `[x]` **Shareable session bundle** (`sessionBundle.ts`) — export all loaded structures + their
  analyses to one `.json`, re-import to restore the workspace exactly (no re-fetch/recompute).
  Export/Import live in the tray (Import also in the empty state). Verified: export → import into
  an empty workspace restores 1HSG + its analysis.
- `[x]` **Citable, versioned methods report** (`methodsReport.ts` + `/api/versions`) — download a
  Markdown methods/provenance doc listing only the methods actually used, with a software-version
  table (from `/api/versions`) and literature references. Verified on 1HSG.
- `[x]` **Python client + documented API (local-first, "bring your own backend")** —
  `clients/python` (`proteinio`): a pip-installable httpx client (`analyze_pdb`,
  `analyze_alphafold`, `analyze_file`, `compare`, `batch_analyze`, `batch_cluster`, `chembl`,
  `versions`) pointed at a backend you run — no hosted public endpoint, so zero cost/abuse
  surface. Verified live against the local backend (1HSG → 1015 contacts, 3 pockets). A public
  *hosted* API (rate limiting / keys / capacity) is deliberately deferred until there's demand.
- `[x]` **Explicit local-first / privacy story** — README "Data & privacy" section + empty-state
  note + a Methods-tab card, with honest hosted-vs-self-hosted framing (the hosted site *does*
  send your structure to the backend to analyse it; self-host to keep data on your machine).

### Phase 16 — AI-native review copilot  🚧 PARTIAL (`feat/privacy-and-review-verdict`)

- `[x]` **Deterministic review verdict** (`reviewVerdict.ts`) — a plain-English synthesis of the
  *computed* metrics into an overall trust assessment (good/caution/warn) + the specific things
  to inspect (confidence, low-confidence interfaces, clashes, ligand-pose failures, top pocket,
  antibody). Rule-based over real numbers → always-on, free, and **cannot fabricate**; shown at the
  top of the Overview tab. This is the copilot's trust-verdict, done the trustworthy way. Verified
  on P00533 (pLDDT 76 + clashes + pocket) and 1HSG (clashes + pocket).
- `[ ]` LLM narration + suggested next experiment on top of the verdict — DEFERRED (chat is disabled
  on the hosted site to avoid API cost; runs only when enabled locally).
- `[ ]` Natural-language query across a structure or a whole batch — DEFERRED (needs the LLM).
- `[x]` **Inline "explain this metric"** (`metricExplainers.ts` + `MetricInfo` popover) — a small
  info icon on each analysis section (pLDDT, PAE, ipTM, interface confidence, BSA, druggability,
  contact trust labels, secondary structure, CDRs) opens a curated, accurate plain-English
  explanation. Deterministic — always-on, free, never fabricated.

---

## Deferred / explicitly out of scope

- Running structure-prediction or design models in-app (GPU/inference) — we ingest,
  we don't generate.
- Mutation-effect models (ThermoMPNN / ESM) — cross the no-inference line; revisit only
  if we consciously relax it (ThermoMPNN is CPU-feasible; ESM-650M is borderline).
- Molecular dynamics, docking, and FEP — that's the hosted-compute lane we deliberately
  cede.

---

## Open items carried over from prior plans

- Phase 4b: chain-pair PAE heatmap → folded into **Phase 10**.
- Phase 3b: richer comparison report → PDF report **shipped**; campaign report in **Phase 13**.
- Phase 1 polish: README demo walkthrough + GIFs, mobile/tablet layout, cross-browser
  Mol* verification — still open, low priority.
