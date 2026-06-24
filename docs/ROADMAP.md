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
- Practical structure comparison endpoint and UI.
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
5. **Quality / validation panel** — Quality tab with clash counts, resolution, and warnings.
6. **Contact confidence warnings** — confidence-aware filtering toggle, low-confidence badge counts.
7. **Methods / provenance panel** — Methods tab with deposition metadata and provenance record.
8. **Example gallery** — sidebar gallery with 6 curated examples (Hemoglobin, AlphaFold, ligand-bound, comparison starter, etc.).
9. **Richer report / export experience** — Report tab redesign: white card, deduped title, download buttons, section dividers; CSV export for contacts and ligands.
10. **Responsive layout** — mobile drawer sidebar, fluid 2-column tablet grid, 3-column desktop grid, `minmax(0, 1fr)` scroll fix.
11. **Design system** — DM Sans font, `#EDEAE2` page background, `#1A406A` primary blue, full token set in `globals.css` and `DESIGN_SYSTEM.md`.
12. **UI polish** — tab count badges, metadata row hover tint, Framer Motion tab/mode transitions, selection bar slide animation, floating ligand panel scale animation.
13. **Structure cache** — `localStorage` (`pio_cache_v1`) persists last structure + analysis across hard refresh and back/forward navigation.

---

## ▶️ Next Milestone — Compare Mode

Compare is currently a placeholder card. The explicit next milestone is a working two-structure comparison workflow:

- Side-by-side upload or fetch for structures A and B.
- Shared / gained / lost contact diff table.
- Chain and residue alignment summary.
- Mol* dual-viewer or overlay highlighting.
- Export comparison report as CSV or PDF.

**Future comparison scope (do not implement until base workflow is clean):** structural alignment, RMSD, TM-score, Foldseek integration, viewer-side alignment highlighting.

---

## Deferred / Out of Scope

- **Dark mode** — formally deferred; no `[data-theme="dark"]` CSS exists. Requires a dedicated design pass after light mode is finalised.
- **Screenshot comparison vs. reference design** — outstanding; compare `protein-io-design-system-boltz.html` against live Report tab, Ligand panel, Contacts table.
- Authentication, database persistence, user accounts, cloud storage, background jobs, GPU/model inference, plugin registries — avoid until a concrete workflow demands them.
