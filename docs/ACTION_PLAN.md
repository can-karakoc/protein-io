# Action Plan

This is the working implementation roadmap for Protein Interaction Explorer. Update the status whenever a roadmap item is completed.

## Status Legend

- `[x]` Done
- `[~]` In progress
- `[ ]` Not started

## Phase 0: Public Demo Polish

- `[x]` Clean up Git-tracked docs and keep local project memory ignored.
- `[x]` Add public-demo polish docs.
- `[x]` Add `docs/biology_notes.md`.
- `[x]` Add a short manual QA checklist.
- `[x]` Add screenshots to the README.
- `[x]` Confirm the deployed sample flow works.

Verification note: deployed sample flow was checked on 2026-06-18. The live app loaded `sample.pdb`, reached the Render backend, and returned 17 atoms, 3 protein residues, 2 chains, 1 ligand, and 6 contacts.

## Phase 1: Performance Baseline

- `[x]` Add backend timing for parsing, contact detection, and response assembly.
- `[x]` Add frontend timing for sample loading, API request time, response parsing, and viewer render.
- `[x]` Benchmark the current Biopython parser and spatial grid with small, medium, and large structures.

## Phase 2: Gemmi Parser Migration

- `[x]` Add Gemmi as a backend dependency.
- `[x]` Replace Biopython parser internals while preserving `StructureData` and current parser API functions.
- `[x]` Preserve current behavior for atoms, chains, residues, ligands, waters, warnings, and first-model selection.
- `[x]` Add PDB parser parity tests.
- `[ ]` Add mmCIF/CIF support after PDB parity is stable.

## Phase 3: Gemmi NeighborSearch Contacts

- `[x]` Replace or parallelize the custom spatial grid with Gemmi NeighborSearch.
- `[x]` Preserve existing contact semantics: ignore hydrogens, skip same-residue contacts, include residue-residue and protein-ligand contacts.
- `[x]` Keep closest atom pair per residue pair/contact type.
- `[x]` Benchmark current grid against Gemmi NeighborSearch.
- `[x]` Consider SciPy `cKDTree` only if Gemmi NeighborSearch is insufficient.

## Phase 4: Interactive Viewer

- `[ ]` Refactor `StructureViewer` into a controlled interactive viewer component.
- `[ ]` Add representation controls: cartoon, stick, sphere, surface, line, and mixed modes.
- `[ ]` Add coloring controls: spectrum, chain, residue type, contact involvement, ligand proximity, and confidence when available.
- `[ ]` Add reset camera and zoom-to-selection controls.

## Phase 5: Table-to-Viewer Interaction

- `[ ]` Click chain rows to highlight or isolate chains.
- `[ ]` Click ligand rows to zoom to ligand and show nearby pocket residues.
- `[ ]` Click contact rows to highlight both residues and closest atom pair.
- `[ ]` Draw contact overlay lines in the viewer.
- `[ ]` Add contact overlay toggles and selected-contact distance display.

## Phase 6: Prediction Output Support

- `[ ]` Support AlphaFold-style PDB and mmCIF uploads.
- `[ ]` Detect when B-factor values should be interpreted as pLDDT.
- `[ ]` Add per-residue confidence annotations to backend output.
- `[ ]` Add pLDDT coloring mode and legend.
- `[ ]` Add optional PAE JSON sidecar support.
- `[ ]` Add PAE heatmap view after sidecar parsing is stable.

## Phase 7: Structure Fetching

- `[ ]` Add PDB ID fetch from RCSB.
- `[ ]` Add AlphaFold DB fetch by UniProt ID if useful.
- `[ ]` Add source and format metadata to analysis responses.
- `[ ]` Add rate-limit-aware error handling.

## Phase 8: Richer Scientific Analysis

- `[ ]` Add richer contact categories where reliable.
- `[ ]` Add residue/property annotations.
- `[ ]` Add ligand-pocket summaries.
- `[ ]` Add contact graph or adjacency output.
- `[ ]` Add graph-driven workflows for neighborhoods, components, interface clusters, and hub residues.

## Phase 9: Reports and Sharing

- `[ ]` Add saved analysis reports.
- `[ ]` Add shareable report URLs.
- `[ ]` Add report history.
- `[ ]` Add downloadable HTML or PDF reports.

## Phase 10: Future Module Interface

- `[ ]` Identify repeated patterns across real parser, contact, confidence, pocket, graph, and report modules.
- `[ ]` Define a small analysis-module interface around `StructureData`.
- `[ ]` Add plugin-style registry behavior only after it removes real complexity.
