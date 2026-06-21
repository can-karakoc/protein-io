# Roadmap

Protein Interaction Explorer is an open-source structural biology workspace for loading, visualizing, analyzing, comparing, and reporting protein structures.

See [Product Direction](PRODUCT_DIRECTION.md) for product framing, [Action Plan](ACTION_PLAN.md) for implementation status, and [Implementation Guidelines](IMPLEMENTATION_GUIDELINES.md) for the next frontend/product phase.

## Completed MVP Foundation

- FastAPI backend with `/health`, `/analyze`, and `/api/analyze`.
- Multipart structure upload.
- PDB and mmCIF parsing into app-owned `StructureData`.
- RCSB mmCIF fetch by PDB ID with metadata and removed-entry replacement IDs.
- AlphaFold DB mmCIF fetch by UniProt accession with predicted-confidence reuse.
- Optional PAE JSON sidecar summaries for uploaded structures.
- Table-to-viewer row selection for chains, ligands, and contacts.
- AlphaFold-style pLDDT confidence summaries for predicted-structure uploads.
- Contact categories and interaction summary output.
- Residue, chain, atom, ligand, and contact summaries.
- Configurable distance cutoff.
- Hydrogen filtering.
- Contact result capping.
- Backend tests.
- Next.js frontend with upload panel, sample loader, Mol* viewer, summary cards, tables, and CSV export.
- Vercel deployment.
- Public docs, screenshots, QA checklist, and benchmark baseline.
- Practical structure comparison endpoint and UI.
- Ligand interaction summaries and ligand CSV export.
- pLDDT coloring mode in Mol*.

## Completed Implementation Priorities

1. Review and merge the Gemmi/mmCIF branch. Done.
2. Add PDB ID fetch and RCSB metadata. Done.
3. Add table-to-viewer interaction. Done.
4. Add AlphaFold/pLDDT confidence support. Done.
5. Add contact categories and better interaction summaries. Done.
6. Add AlphaFold DB fetch by UniProt ID. Done.
7. Add PAE JSON sidecar support. Done.

8. Integrate Mol* as the primary structure viewer. Done.
9. Add MVP-safe ligand interaction summaries. Done.
10. Add practical structure comparison. Done.

## Next Product Priorities

1. Frontend workbench redesign around `Explore | Compare | Report`.
2. Better empty, loading, and error states.
3. Table-to-viewer selection polish.
4. Ligand detail drawer.
5. Quality / validation panel.
6. Contact confidence warnings.
7. Methods / provenance panel.
8. Example gallery.
9. Richer report/export experience.
10. Compare workflow polish.

Future comparison scope: structural alignment, RMSD, aligned contact differences, TM-score, Foldseek integration, and viewer-side comparison highlighting. Do not implement these until the base Compare workflow is clean.

## Boundaries

Avoid authentication, database persistence, user accounts, cloud storage, background jobs, GPU/model inference, plugin registries, and complex infrastructure until there is a concrete workflow that needs them.
