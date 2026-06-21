# Action Plan

This is the working implementation roadmap for Protein Interaction Explorer. Keep it aligned with [Product Direction](PRODUCT_DIRECTION.md).

The next phase is product/design polish and workflow clarity. Do not add auth, database persistence, cloud storage, background jobs, payments, user accounts, GPU/model inference, or heavyweight dependencies. Keep changes small, reviewable, and open-source friendly.

## Status Legend

- `[x]` Done
- `[~]` In progress
- `[ ]` Not started

## Completed Foundation

- `[x]` Clean up Git-tracked docs and keep local project memory ignored.
- `[x]` Add public-demo polish docs.
- `[x]` Add `docs/biology_notes.md`.
- `[x]` Add a short manual QA checklist.
- `[x]` Add screenshots to the README.
- `[x]` Confirm the deployed sample flow works.
- `[x]` Add backend timing for parsing, contact detection, and response assembly.
- `[x]` Add frontend timing for sample loading, API request time, response parsing, and viewer render.
- `[x]` Benchmark the current Biopython parser and spatial grid with small, medium, and large structures.

Verification note: deployed sample flow was checked on 2026-06-18. The live app loaded `sample.pdb`, reached the Render backend, and returned 17 atoms, 3 protein residues, 2 chains, 1 ligand, and 6 contacts.

## Priority 1: Merge Gemmi and Add mmCIF Support

Branch:

```text
feature/gemmi-parser
```

- `[x]` Add Gemmi as a backend dependency.
- `[x]` Replace Biopython parser internals while preserving `StructureData` and current parser API functions.
- `[x]` Preserve current behavior for atoms, chains, residues, ligands, waters, warnings, and first-model selection.
- `[x]` Add PDB parser parity tests.
- `[x]` Replace the custom spatial grid with Gemmi NeighborSearch.
- `[x]` Preserve contact semantics: ignore hydrogens, skip same-residue contacts, include residue-residue and protein-ligand contacts.
- `[x]` Keep closest atom pair per residue pair/contact type.
- `[x]` Benchmark current grid against Gemmi NeighborSearch.
- `[x]` Review the existing Gemmi migration.
- `[x]` Add `.cif` and `.mmcif` upload support.
- `[x]` Make parser behavior file-format aware.
- `[x]` Keep the API response shape unchanged.
- `[x]` Keep contact analysis consuming `StructureData`, not raw Gemmi structures.
- `[x]` Add tests for PDB parsing, mmCIF parsing, reasonable chain/residue/atom counts, and typed contacts.
- `[x]` Update docs and README to say the app supports PDB and mmCIF.
- `[x]` Merge `feature/gemmi-parser` into `main` after review.

Avoid in this priority:

- RCSB fetching
- AlphaFold support
- heavy frontend changes beyond accepting `.cif` / `.mmcif`

## Priority 2: Add PDB ID Fetch and RCSB Metadata

- Branch: `feature/rcsb-fetch`
- `[x]` Add `backend/app/integrations/rcsb.py`.
- `[x]` Add PDB ID validation.
- `[x]` Add mocked backend tests for valid/invalid PDB IDs and metadata normalization.
- `[x]` Add analysis pipeline from fetched structure text.
- `[x]` Add frontend PDB ID input with loading and error states.
- `[x]` Show simple metadata: PDB ID, title, method, resolution, organism, deposition date, chain/entity summary, and RCSB link when available.
- `[x]` Handle removed/superseded RCSB entries, including replacement IDs such as `1HHB -> 2HHB, 3HHB, 4HHB`.
- `[x]` Preserve protein residue classification for older mmCIF records that mark standard amino acids with hetero flags.
- `[x]` Update README, roadmap, decisions, and QA docs.
- `[x]` Run full final verification and merge `feature/rcsb-fetch` into `main` after review.

Avoid search by protein name, database caching, user accounts, and saved structures.

## Priority 3: Table-to-Viewer Interaction

- Branch: `feature/table-viewer-interaction`

- `[x]` Add selected item state in the frontend.
- `[x]` Pass selected contact/residue/chain/ligand state to the viewer.
- `[x]` Use 3Dmol.js selection APIs to highlight selected rows in the structure.
- `[x]` Add clear/reset selection control.
- `[x]` Make selected rows visually obvious.
- `[x]` Update manual QA and screenshots if useful.

Do not switch from 3Dmol.js to Mol* in this priority.

## Priority 4: AlphaFold / Predicted Structure Confidence Support

- Branch: `feature/plddt-confidence`
- `[x]` Support uploaded AlphaFold-style PDB/mmCIF files.
- `[x]` Detect when B-factor values should be interpreted as pLDDT.
- `[x]` Add per-residue confidence annotations to backend output.
- `[x]` Add confidence categories: very high, confident, low, very low.
- `[x]` Add confidence summary generation.
- `[x]` Add confidence panel and low-confidence warning copy.
- `[x]` Add pLDDT coloring mode and legend.
- `[x]` Add tests for pLDDT extraction, category assignment, summary generation, and no-confidence files.
- `[x]` Run final browser verification and merge `feature/plddt-confidence` into `main` after review.

Do not add AlphaFold DB fetching, PAE, or model inference in this priority.

## Priority 5: Contact Categories and Better Interaction Summaries

Branch: `feature/contact-categories`

- `[x]` Keep raw distance search separate from classification.
- `[x]` Add simple categories: protein-protein, protein-ligand, ligand-water, protein-water, intra-chain, inter-chain, and possible clash.
- `[x]` Add summary outputs: top contacting residues, top contacting ligands, inter-chain contact count, protein-ligand contact count, closest contacts, and possible clashes.
- `[x]` Add frontend category filter and summary cards.
- `[x]` Add tests for category assignment and summary counts.
- `[x]` Run final browser verification and merge `feature/contact-categories` into `main` after review.

Do not claim hydrogen bonds, salt bridges, pi-stacking, or hydrophobic interactions unless valid criteria are implemented.

## Priority 6: AlphaFold DB Fetch by UniProt ID

- Branch: `feature/alphafold-fetch`
- `[x]` Add `backend/app/integrations/alphafold.py`.
- `[x]` Fetch AlphaFold metadata and structure by UniProt ID.
- `[x]` Add frontend mode: upload file, fetch PDB ID, or fetch AlphaFold by UniProt ID.
- `[x]` Mock network calls in tests.
- `[x]` Run final browser verification and merge `feature/alphafold-fetch` into `main` after review.

Do not add model inference, job queues, or permanent storage.

## Priority 7: PAE JSON Sidecar Support

- Branch: `feature/pae-sidecar`
- `[x]` Allow structure upload plus optional PAE JSON sidecar.
- `[x]` Show whether PAE was uploaded.
- `[x]` Add high-level PAE summary and warning.
- `[x]` Defer PAE heatmap until there is a concrete visualization need.
- `[x]` Run final browser verification and merge `feature/pae-sidecar` into `main` after review.

## Priority 8: Mol* Viewer Integration

- Branch: `feature/molstar-viewer`
- `[x]` Replace the 3Dmol.js viewer implementation with Mol*.
- `[x]` Load uploaded, RCSB, and AlphaFold PDB/mmCIF text through Mol*.
- `[x]` Keep table-to-viewer selection wired for chains, ligands, and contacts using Mol* select/focus interactivity.
- `[x]` Enable Mol* viewport controls, reset, expand, settings, and fullscreen controls.
- `[x]` Add frontend bundler configuration for Mol*'s browser dependencies.
- `[x]` Rebuild pLDDT coloring as a Mol* representation/theme follow-up.

## Priority 9: Advanced Ligand Interaction Module

- Branch: `feature/ligand-interaction-summaries`
- `[x]` Start with MVP-safe ligand summaries: closest ligand contacts, contacting residues per ligand, distance distribution, ligand-specific export.
- `[x]` Add backend response data without adding heavy chemistry dependencies.
- `[x]` Add frontend ligand interaction panel and ligand CSV export.
- `[x]` Evaluate heavy ligand-analysis libraries for now and defer them because the simple summaries are sufficient for the current MVP.
- `[x]` Preserve Render compatibility by avoiding new backend dependencies.

## Priority 10: Structure Comparison

- Branch: `feature/structure-comparison`
- `[x]` Compare two uploaded structures after single-structure analysis is strong.
- `[x]` Add backend `/api/compare` for parsed count deltas and residue-level contact-set comparison.
- `[x]` Show gained, lost, and shared contact examples in the frontend.
- `[x]` Add tests for comparison service and route behavior.
- `[ ]` Later workflows may include structural alignment, RMSD, aligned contact differences, and viewer highlighting.

## Next Product Priorities

### Priority 1: Frontend Workbench Redesign

Goal: restructure the frontend into a scientist-facing workbench organized around `Explore | Compare | Report`.

- `[x]` Inspect the current frontend structure before implementation.
- `[x]` Propose a concrete component architecture before coding.
- `[x]` Add initial workbench shell and mode tabs with app identity.
- `[x]` Add top navigation links for docs/GitHub and export access.
- `[x]` Build an Explore layout with left sidebar, center Mol* viewer, and results tabs.
- `[x]` Extract load inputs, analysis controls, and current sidebar alerts into a focused Explore sidebar component.
- `[x]` Add compact metadata to the left sidebar.
- `[x]` Move results into tabs: Overview, Chains, Ligands, Contacts, Confidence, PAE, and Quality.
- `[x]` Only show Confidence and PAE tabs when relevant.
- `[x]` Make the viewer layout stable so Mol* never widens the page after render.
- `[x]` Preserve all current upload, fetch, analysis, selection, and export behavior.
- `[x]` Run frontend lint/build and browser-check Mol* rendering before calling this done.

### Priority 2: Better Empty, Loading, and Error States

Goal: make the product feel reliable and professional.

- `[x]` Add a useful empty state with upload, RCSB, AlphaFold, and sample CTAs.
- `[x]` Show loading states for file parsing, RCSB fetch, AlphaFold fetch, PAE parsing, comparison, and Mol* rendering.
- `[x]` Add helpful errors for invalid file type, invalid PDB ID, failed RCSB fetch, failed AlphaFold fetch, invalid PAE JSON, backend analysis failure, and Mol* render failure.
- `[x]` Make every error human-readable and suggest what to try next.

### Priority 3: Table-to-Viewer Selection Polish

- `[x]` Improve selected row styling for chain, ligand, and contact rows.
- `[x]` Add selected item detail card/drawer.
- `[x]` Keep clear selection visible.
- `[x]` Add zoom-to-selection only if it is straightforward with Mol*.

### Priority 4: Ligand Detail Drawer

- `[x]` Open a ligand detail drawer when a ligand row is selected.
- `[x]` Show ligand name, chain, residue number, atom count, contact counts, closest contact, contacting residues, and distance buckets.
- `[x]` Add ligand-specific CSV export.
- `[x]` Highlight the selected ligand in Mol*.

### Priority 5: Quality / Validation Panel

- `[x]` Add a Quality tab after analysis.
- `[x]` Surface possible clashes, very close contacts, empty ligand states, low-confidence residues, PAE warnings, and missing PAE notices for predicted structures.
- `[x]` Use non-alarmist language and avoid overclaiming biological certainty.

### Priority 6: Contact Confidence Warnings

- `[x]` Enrich predicted-structure contact rows with residue confidence when available.
- `[x]` Add warning badges for contacts involving low-confidence residues.
- `[x]` Add a low-confidence contacts filter and summary card.
- `[x]` Hide confidence-specific UI for structures without confidence data.

### Priority 7: Methods / Provenance Panel

- `[x]` Add source, source ID, format, parser, cutoff, contact method, app version, timestamp, warnings, PAE status, and experimental/predicted status.
- `[x]` Include provenance in Report mode/export when possible.

### Priority 8: Example Gallery

- `[x]` Add multiple guided examples with title, source, tags, load action, and "what to look at" hint.
- `[x]` Include examples for hemoglobin, ligand-bound protein, large structure, AlphaFold predicted model, and comparison if available.

### Priority 9: Richer Report / Export Experience

- `[x]` Create Report mode with metadata, summary metrics, contact summary, ligand summary, confidence/PAE summary, quality warnings, and provenance.
- `[x]` Keep current contact CSV and ligand CSV exports.
- `[x]` Add analysis JSON export if easy.
- `[x]` Defer HTML/PDF/ZIP exports until the report view is stable.

### Priority 10: Compare Workflow Polish

- `[ ]` Improve Compare mode with structure A/B inputs, summary cards, shared/gained/lost tabs, and transparent limitation copy.
- `[ ]` Add comparison CSV export if easy.
- `[ ]` Do not add alignment, RMSD, TM-score, Foldseek, or superposition until explicitly requested.

## Step Completion Rule

After each major step, stop and explain:

1. what changed
2. which files were edited
3. why the feature matters
4. how to run/test it
5. tradeoffs made
6. what needs to be understood before moving on
7. whether to continue
