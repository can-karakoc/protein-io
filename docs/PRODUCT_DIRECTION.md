# Product Direction

## Product Goal

Protein Interaction Explorer should become an open-source, scientist-facing structural biology workspace.

The long-term goal is not just to build a protein viewer or parser. The goal is to create a useful product layer that unifies common structural biology workflows in one clean web app:

- upload or fetch protein structures
- visualize structures in 3D
- inspect chains, residues, ligands, and contacts
- connect structure data to public biological metadata
- support experimental and predicted structures
- help researchers interpret model outputs
- export clean reports for analysis, sharing, or documentation

The project should be relevant to AI-bio and computational biology engineering teams, including teams like Boltz, because it focuses on the practical workflow around structure prediction outputs:

- visualizing structures
- validating contacts
- comparing predicted and experimental structures
- interpreting confidence
- generating useful reports
- integrating open-source structural biology tools instead of reinventing them

## Positioning

Primary framing:

```text
Protein Interaction Explorer is an open-source structural biology workspace for uploading, fetching, visualizing, analyzing, and reporting protein structures.
```

Short framing:

```text
A browser-based structural biology workbench for protein structure exploration and interaction analysis.
```

## Current State

Production branch:

```text
main
```

Production features:

- PDB upload
- mmCIF upload
- RCSB mmCIF fetch by PDB ID
- AlphaFold DB mmCIF fetch by UniProt accession
- sample file loader
- 3Dmol.js structure viewer
- chain, ligand, residue/contact summary
- residue-residue contacts
- protein-ligand contacts
- contact categories for protein-protein, protein-ligand, protein-water, ligand-water, intra-chain, inter-chain, and possible clash contacts
- interaction summary output for counts, top residues, top ligands, closest contacts, and possible clashes
- RCSB metadata panel with removed-entry replacement IDs
- table row selection for chains, ligands, and contacts
- AlphaFold-style pLDDT confidence summaries for predicted-structure uploads
- AlphaFold DB metadata panel for fetched predicted models
- CSV export
- backend timing diagnostics
- frontend timing logs
- public docs, screenshots, QA checklist, roadmap

Production stack:

- Frontend: Next.js, React, TypeScript, Tailwind CSS, 3Dmol.js, Vercel
- Backend: FastAPI, Python, Gemmi, Pydantic, pytest, Render

Latest completed feature branch:

```text
feature/alphafold-fetch
```

This branch adds:

- AlphaFold DB metadata and mmCIF fetch by UniProt accession
- frontend UniProt accession fetch mode
- mocked tests for AlphaFold DB network calls

## Architecture Principle

Keep `StructureData` as the internal app boundary.

Target flow:

```text
PDB/mmCIF/AlphaFold/Boltz/OpenFold/RCSB input
  -> parser/fetcher
  -> StructureData
  -> analysis modules
  -> API response
  -> frontend viewer/tables/reports
```

Do not let raw Gemmi, Biopython, FastAPI, or provider-specific objects leak throughout the app.

## Development Rules

Do not overbuild. Avoid these until there is a concrete product need:

- authentication
- database
- user accounts
- payments
- cloud storage
- background jobs
- GPU/model inference
- plugin registry
- Docker unless strictly necessary
- complex infrastructure

Keep the backend modular:

```text
route -> service -> parser/fetcher -> StructureData -> analysis module -> response
```

Bad pattern:

```text
route does parsing, analysis, formatting, and error handling directly
```

Work in small PR-sized steps:

- Keep the diff scoped.
- Add or update tests.
- Update docs.
- Preserve the existing public API unless a change is necessary.
- Stop after each priority and explain the outcome before moving on.

## Priority Roadmap

1. Merge Gemmi and add mmCIF support. Done.
2. Add PDB ID fetch and RCSB metadata. Done.
3. Add table-to-viewer interaction. Done.
4. Add AlphaFold/pLDDT confidence support. Done.
5. Add contact categories and better interaction summaries. Done.
6. Add AlphaFold DB fetch by UniProt ID. Done.
7. Add PAE JSON sidecar support.
8. Evaluate a Mol* viewer upgrade only if 3Dmol.js becomes limiting.
9. Add advanced ligand interaction summaries.
10. Add structure comparison.

Do not continue to Priority 2 until Priority 1 is reviewed and merged.

## Success Criteria

The project should demonstrate:

- real web software, not just notebooks
- scientist-facing product thinking
- clean backend architecture
- open-source maintainability
- practical structural biology workflows
- smart use of existing tools
- AI-bio relevance through predicted structure support
- careful handling of uncertainty and confidence
- simple deployment and public demo
- clear iteration history
