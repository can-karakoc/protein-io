# Roadmap

Protein Interaction Explorer is an open-source structural biology workspace for loading, visualising, analysing, comparing, and reporting protein structures.

See [Product Direction](PRODUCT_DIRECTION.md) for product framing, [Action Plan](ACTION_PLAN.md) for implementation status, and [Implementation Guidelines](IMPLEMENTATION_GUIDELINES.md) for the next frontend/product phase.

---

## ✅ Completed — MVP Foundation

- FastAPI backend with `/health`, `/analyze`, `/api/analyze`.
- Multipart structure upload (PDB + mmCIF).
- RCSB mmCIF fetch by PDB ID with metadata.
- AlphaFold DB mmCIF fetch by UniProt accession with pLDDT confidence reuse.
- Optional PAE JSON sidecar summaries.
- Residue, chain, atom, ligand, and contact summaries.
- Contact categories and interaction summary output.
- Configurable distance cutoff and hydrogen filtering.
- AlphaFold pLDDT confidence summaries and residue-level confidence annotations.
- Practical structure comparison endpoint; the dedicated UI remains a future milestone.
- Ligand interaction summaries and ligand CSV export.
- pLDDT colouring mode in Mol*.
- Backend tests, public docs, and QA checklist.

---

## ✅ Completed — Workbench Redesign (sessions 1–6, 2026-06)

All items that were listed as "Next Product Priorities" are now shipped:

1. **Frontend workbench redesign** — three-mode shell (`Explore | Compare | Report`), sticky top nav, unified 3-column grid.
2. **Empty, loading, and error states** — cycling `LoadingOverlay`, `EmptyWorkbenchState` with example gallery, per-field error messages.
3. **Table-to-viewer selection** — row highlight (`rgba(199,217,236,0.6)` + 2px inset border), Mol* focus, inline selection bar.
4. **Ligand detail drawer** — `FloatingLigandPanel`: draggable frosted-glass panel over the 3D viewer, clamped to viewer bounds, minimize/expand animation.
5. **Quality / validation panel** — Quality tab with very-close-contact review flags, confidence, PAE, ligand state, and limitations.
6. **Contact confidence warnings** — confidence-aware contact annotations, low-confidence filtering, and badge counts.
7. **Methods / provenance panel** — Methods tab with deposition metadata and provenance record.
8. **Example gallery** — curated experimental, ligand-bound, large-structure, and AlphaFold examples.
9. **Richer report / export experience** — Report tab redesign: white card, deduped title, download buttons, section dividers; CSV export for contacts and ligands.
10. **Responsive layout** — mobile drawer sidebar, fluid 2-column tablet grid, 3-column desktop grid, `minmax(0, 1fr)` scroll fix.
11. **Design system** — DM Sans font, `#EDEAE2` page background, `#1A406A` primary blue, full token set in `globals.css` and `DESIGN_SYSTEM.md`.
12. **UI polish** — tab count badges, metadata row hover tint, Framer Motion tab/mode transitions, selection bar slide animation, floating ligand panel scale animation.
13. **Public structure cache** — `localStorage` (`pio_public_structure_cache_v2`) restores the last RCSB or AlphaFold analysis. Local uploads and PAE sidecars are not persisted.
14. **Dark mode** — light/dark theme tokens and a persisted theme preference.

---

## ✅ Completed — Compare Mode Foundation

- Local PDB/mmCIF inputs for structures A and B.
- A/B structure summaries and B-minus-A count deltas.
- Shared / gained / lost residue-contact identity tabs.
- Transparent limitation copy for numbering sensitivity and lack of structural alignment.
- CSV export for the representative comparison examples returned by the API.

This is the functional foundation, not the final frontend treatment. The next comparison iteration should combine feature depth with UI polish: public-database inputs, clearer result hierarchy, richer reporting, stronger empty/error/loading states, and responsive table refinement. Chain/residue alignment and viewer overlays remain future work.

**Future comparison scope (do not implement until base workflow is clean):** structural alignment, RMSD, TM-score, Foldseek integration, viewer-side alignment highlighting.

---

## Deferred / Out of Scope

- **Screenshot comparison vs. reference design** — outstanding; compare `protein-io-design-system-boltz.html` against live Report tab, Ligand panel, Contacts table.
- Authentication, database persistence, user accounts, cloud storage, background jobs, GPU/model inference, plugin registries — avoid until a concrete workflow demands them.
