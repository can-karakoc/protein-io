# Roadmap

Protein Interaction Explorer is an open-source structural biology workspace for uploading, fetching, visualizing, analyzing, and reporting protein structures.

See [Product Direction](PRODUCT_DIRECTION.md) for product framing and [Action Plan](ACTION_PLAN.md) for implementation status.

## Completed MVP Foundation

- FastAPI backend with `/health`, `/analyze`, and `/api/analyze`.
- Multipart structure upload.
- PDB and mmCIF parsing into app-owned `StructureData`.
- RCSB mmCIF fetch by PDB ID with metadata and removed-entry replacement IDs.
- Table-to-viewer row selection for chains, ligands, and contacts.
- AlphaFold-style pLDDT confidence summaries for predicted-structure uploads.
- Contact categories and interaction summary output.
- Residue, chain, atom, ligand, and contact summaries.
- Configurable distance cutoff.
- Hydrogen filtering.
- Contact result capping.
- Backend tests.
- Next.js frontend with upload panel, sample loader, 3Dmol.js viewer, summary cards, tables, and CSV export.
- Vercel frontend deployment.
- Render backend deployment.
- Public docs, screenshots, QA checklist, and benchmark baseline.

## Immediate Priorities

1. Review and merge the Gemmi/mmCIF branch. Done.
2. Add PDB ID fetch and RCSB metadata. Done.
3. Add table-to-viewer interaction. Done.
4. Add AlphaFold/pLDDT confidence support. Done.
5. Add contact categories and better interaction summaries. Done.

## Later Priorities

6. Add AlphaFold DB fetch by UniProt ID.
7. Add PAE JSON sidecar support.
8. Evaluate a Mol* viewer upgrade only if 3Dmol.js becomes limiting.
9. Add advanced ligand interaction summaries.
10. Add structure comparison.

## Boundaries

Avoid authentication, database persistence, user accounts, cloud storage, background jobs, GPU/model inference, plugin registries, and complex infrastructure until there is a concrete workflow that needs them.
