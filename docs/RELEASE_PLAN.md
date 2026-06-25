# Release Plan

## ✅ v0.1 — MVP Launch (shipped)

- Upload PDB and mmCIF files.
- Parse chains, residues, atoms, and ligands.
- Calculate residue-residue and protein-ligand contacts.
- Visualise uploaded structures in the browser with Mol*.
- Export contacts as CSV.
- Deploy frontend to Vercel, backend to Render.

## ✅ v0.2 — Public Demo Polish (shipped)

- Sample-file loader and example gallery (6 curated structures).
- Improved empty, loading, and error states.
- Public docs, screenshots, and QA checklist.
- Basic UI polish for scientific SaaS credibility.
- Warning messages for unsupported or unusual structures.

## ✅ v0.3 — Scientific Credibility (shipped)

- Contact categories: protein-protein, protein-ligand, protein-water, ligand-water, inter-chain, and very close contacts.
- AlphaFold pLDDT confidence summaries and residue-level confidence annotations.
- Confidence-aware contact warnings and low-confidence filtering.
- Ligand interaction summaries, floating ligand detail panel.
- Structure comparison endpoint (shared / gained / lost contacts).
- PAE sidecar support, Methods and Provenance panel, Quality tab.
- RCSB and AlphaFold DB fetch by ID / UniProt accession.

## ✅ v0.4 — Workbench Redesign (shipped 2026-06)

- Three-mode shell: `Explore | Compare | Report`.
- Responsive layout: mobile drawer, tablet 2-col, desktop 3-col grid.
- Full design system: DM Sans, `#1A406A` primary, token set in `globals.css`.
- Report tab: white card, deduped title, download buttons, section dividers.
- Floating ligand panel, selection bar, Framer Motion animations.
- Tab count badges, metadata row hover, Mol* artifact suppression.
- Dark theme with persisted user preference.
- `localStorage` public-structure cache — the last RCSB or AlphaFold analysis survives refresh; local uploads are not persisted.
- Dead code cleanup, TypeScript clean throughout.

## ▶️ v0.5 — Compare Mode (next)

- Working two-structure comparison workflow in the Compare tab (currently placeholder).
- Side-by-side upload or fetch for structures A and B.
- Shared / gained / lost contact diff table with export.
- Chain and residue alignment summary.
- Mol* dual-viewer or overlay highlighting.

## v0.6 — Persistence & Sharing (future)

- Shareable report URLs.
- Saved analysis history.
- Add persistence only after the core comparison workflow is proven.

## v0.7 — Advanced Structural Analysis (future)

- Structural alignment and RMSD.
- TM-score and Foldseek integration.
- Viewer-side alignment highlighting.
- Plugin-style analysis modules once repeated patterns are clear.
