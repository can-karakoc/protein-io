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

### Phase 12 — Function & structural context

- `[ ]` Binding-pocket detection + druggability (**P2Rank** or **fpocket**); flag whether
  the co-folded ligand sits in a real pocket.
- `[ ]` **DSSP** secondary-structure track + disorder flags.
- `[ ]` Unified sequence track: pLDDT × secondary structure × domains × disorder.
- `[ ]` **ChEMBL / BindingDB / PubChem** target context: known binders + measured
  affinities for the loaded target.

### Phase 13 — Design-campaign triage

Where the real biotech pain lives: the RFdiffusion → MPNN → co-fold → *filter* loop.

- `[ ]` Campaign dashboard: rank designs by the BindCraft-style composite (pLDDT + ipTM +
  iPAE + PB-valid + dSASA + H-bond count).
- `[ ]` Batch structural clustering (**Foldseek** + **FoldMason**).
- `[ ]` Shareable campaign report.

### Phase 14 — Antibody mode

Antibodies are a large share of biotech; no free review UI offers this.

- `[ ]` **ANARCI** numbering (IMGT/Kabat/Chothia) + CDR annotation.
- `[ ]` CDR-focused interface + confidence view; SAbDab context.

### Phase 15 — Workflow, collaboration, reproducibility

- `[ ]` PyMOL/ChimeraX session export (`.pml` / `.cxc`).
- `[ ]` Shareable session bundle (file-based export/import, no backend).
- `[ ]` Public REST API + documented Python client.
- `[ ]` Citable, versioned methods/provenance report.
- `[ ]` Explicit local-first / privacy story in UI + docs.

### Phase 16 — AI-native review copilot

- `[ ]` Upgrade the chat agent into a review copilot that narrates over computed metrics
  into a plain-English trust verdict + suggested next experiment — **strictly over real
  numbers, never fabricated**.
- `[ ]` Natural-language query across a structure or a whole batch.
- `[ ]` Inline "explain this metric".

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
