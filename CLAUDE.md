# Protein I/O — Agent Handoff

## Design system
The design system reference is `protein-io-design-system-boltz.html`. Every token is in
`frontend/src/app/globals.css`. Fonts load via `next/font/google` in `layout.tsx` — do not
add another `<link>` for them.

**Token rules (non-negotiable):**
- No Tailwind color utilities (`slate-`, `gray-`, `cyan-`, `zinc-`, etc.) — use CSS custom properties via `bg-[var(--pio-*)]` arbitrary values or the shared class names in `globals.css`.
- Color semantics: green = healthy/selected, blue = metadata/structure, lavender = predicted/AI, coral = warning/clash, amber = caution. Only use a color for its meaning.
- Every primary button must use `pio-button-primary` (ink in light). No flat gray buttons.
- Badges: `pio-badge pio-badge-{active|metadata|predicted|warning|caution|neutral}`.
- Panel cards: `pio-panel` (24px radius, box-shadow). Inner panels: `pio-panel-nested` (18px radius).
- **Section headings** use `.pio-section-title` — `font-size: 20px`, `font-weight: 700`.
- **Primary colour** for interactive elements: `#1A406A`. Right panel: `400px`. Left sidebar: `280px`.

**Key design constants:**
- Card shadow: `shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)]`
- Card border: `border border-[rgba(20,20,15,0.09)]`
- Selection bg: `rgba(199,217,236,0.6)` + `2px solid #1A406A` inset border
- Icon circle bg: `rgba(199,217,236,0.4)` — Download circle fill: `#C8E3EE`
- All pill/tab/button border-radius: `rounded-[12px]`

See `DESIGN_SYSTEM.md` at repo root for copy-paste patterns.

## Component map
| File | Purpose |
|---|---|
| `frontend/src/app/page.tsx` | Root — renders `<ProteinWorkbench>` |
| `frontend/src/components/workbench/ProteinWorkbench.tsx` | Main workbench (~2 800 lines — all tabs, sidebar, report, compare, ligand detail) |
| `frontend/src/components/workbench/ExploreSidebar.tsx` | Left sidebar (input forms, fetch, gallery) |
| `frontend/src/components/workbench/TopNav.tsx` | Sticky top nav |
| `frontend/src/components/workbench/WorkbenchShell.tsx` | Layout shell — `h-[calc(100svh-92px)]` outer container |
| `frontend/src/components/viewer/StructureViewer.tsx` | Mol* 3-D viewer wrapper |
| `frontend/src/app/globals.css` | All design tokens + `.wb-explore-grid` layout |

## Current state (as of 2026-06-25)

`main` contains the latest dark-mode and workbench polish. Active feature work should branch from current `main`.

### What is fully built and live
- Three-mode shell: `Explore | Compare | Report` with Framer Motion transitions.
- Responsive layout: mobile drawer sidebar, 2-col tablet, 3-col desktop. `minmax(0, 1fr)` row tracks — critical for results panel scroll.
- Results panel: `overflow-y-auto` section correctly sized to grid track; sticky tab strip; scroll resets on tab change.
- All eight result tabs: Overview, Chains, Ligands, Contacts, Confidence, PAE, Quality, Methods.
- Tab count badges on Chains / Ligands / Contacts (hidden until analysis loads).
- Overview tab: structure title + circular navy arrow button linking to RCSB / AlphaFold DB.
- Floating `FloatingLigandPanel`: draggable, clamped to viewer bounds, minimize/expand animation.
- Inline viewer controls: pLDDT/Structure color toggle pill (top-right), frosted-glass selection bar (bottom).
- Metadata row hover: light blue (`--pio-sky`) tint + `cursor-pointer`.
- Confidence-aware contact annotations and low-confidence filtering.
- Report tab: white card, deduped title + arrow button, section dividers, download buttons.
- Compare tab: local PDB/mmCIF A/B inputs, summary deltas, shared/gained/lost contact-identity tabs, and representative-example CSV export.
- `localStorage` public structure cache (`pio_public_structure_cache_v2`): restores only RCSB/AlphaFold analyses. Local uploads and PAE sidecars are not persisted.
- Workbench preferences (`pio_workbench_preferences_v1`) persist mode, active results tab, and tab-strip position.
- Light/dark theme support with persisted preference.
- CSS hiding residual Mol* bottom-left sequence toggle artifact.
- Dead code removed: `ViewerModeToggle`, `SelectionBar`, `selectionDetails`.

### Next comparison iteration
The comparison foundation is implemented for local files. Possible follow-ups:
1. RCSB/AlphaFold inputs for structures A and B.
2. Richer downloadable comparison report.
3. Chain/residue alignment summary.
4. Mol* dual-viewer or overlay highlighting.

### Formally deferred
- **Screenshot comparison vs. reference design** — still outstanding. Compare `protein-io-design-system-boltz.html` against the live Report tab, Ligand panel, and Contacts table.
- **Mol* bottom-left artifact** — CSS suppression is in `globals.css`. If it resurfaces, check `.msp-layout-bottom-controls` / `.msp-sequence-wrapper` / `.msp-layout-region.msp-layout-bottom`.

## Key technical decisions / gotchas

### Grid row sizing
`.wb-explore-grid` uses `grid-template-rows: minmax(0, 1fr)` on all breakpoints. **Do not change this back to `1fr`.** Plain `1fr` lets the row track expand to content height (811px on a 575px grid), causing the results section to overflow the grid and making the bottom of the scroll area permanently unreachable.

### Mol* wheel events
Mol* registers a non-passive `wheel` listener on its `<canvas>`. This only fires for events that originate on the canvas, so it does not block scrolling in the results panel. The results panel scroll issue was purely the grid track height bug above.

### Structure cache
`PUBLIC_STRUCTURE_CACHE_KEY = "pio_public_structure_cache_v2"` in `ProteinWorkbench.tsx`. Only public RCSB and AlphaFold analyses are cached. Local uploads and PAE sidecars are not persisted. `savePublicStructureCache` silently no-ops on `QuotaExceededError`. UI preferences use the separate `pio_workbench_preferences_v1` key.

### Sticky tab strip
The tab strip uses `sticky top-0 z-10` inside the `overflow-y-auto` results section. This is valid — sticky positions relative to the nearest scroll ancestor (the section itself).

### Percentage heights in the grid
`height: 100%` on a grid item resolves against the **grid container**, not the row track, due to a Chrome quirk. Use `align-self: stretch` (default) + `min-h-0` rather than `h-full` on scrollable grid items.
