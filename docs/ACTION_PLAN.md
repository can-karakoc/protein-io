# Action Plan

This is the working implementation roadmap for Protein Interaction Explorer. Keep it aligned with [Product Direction](PRODUCT_DIRECTION.md).

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

- `[ ]` Add `backend/app/integrations/alphafold.py`.
- `[ ]` Fetch AlphaFold metadata and structure by UniProt ID.
- `[ ]` Add frontend mode: upload file, fetch PDB ID, or fetch AlphaFold by UniProt ID.
- `[ ]` Mock network calls in tests.

Do not add model inference, job queues, or permanent storage.

## Priority 7: PAE JSON Sidecar Support

- `[ ]` Allow structure upload plus optional PAE JSON sidecar.
- `[ ]` Show whether PAE was uploaded.
- `[ ]` Add high-level PAE summary or warning if easy.
- `[ ]` Add PAE heatmap later, not first.

## Priority 8: Optional Mol* Viewer Evaluation

- `[ ]` Continue with 3Dmol.js unless it blocks table-to-viewer highlighting, confidence coloring, or large-structure rendering.
- `[ ]` Add a viewer abstraction only when there is a concrete product reason.

## Priority 9: Advanced Ligand Interaction Module

- `[ ]` Start with MVP-safe ligand summaries: closest ligand contacts, contacting residues per ligand, distance distribution, ligand-specific export.
- `[ ]` Evaluate ProLIF, RDKit, MDAnalysis, or PLIP-inspired output later.
- `[ ]` Check Render deployment compatibility before adding heavy dependencies.

## Priority 10: Structure Comparison

- `[ ]` Compare two structures only after single-structure analysis is strong.
- `[ ]` Later workflows may include alignment, RMSD, contact differences, gained/lost contacts, and viewer highlighting.
