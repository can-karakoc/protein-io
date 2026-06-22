# Protein I/O — Agent Handoff

## Design system
The design system reference is `protein-io-design-system-boltz.html`. Every token is in
`frontend/src/app/globals.css`. Fonts load via `next/font/google` in `layout.tsx` — do not
add another `<link>` for them.

**Token rules (non-negotiable):**
- No Tailwind color utilities (`slate-`, `gray-`, `cyan-`, `zinc-`, etc.) — use CSS custom properties via `bg-[var(--pio-*)]` arbitrary values or the shared class names in `globals.css`.
- Color semantics: green = healthy/selected, blue = metadata/structure, lavender = predicted/AI, coral = warning/clash, amber = caution. Only use a color for its meaning.
- Every primary button must use `pio-button-primary` (ink in light, bright green in dark). No flat gray buttons.
- Badges: `pio-badge pio-badge-{active|metadata|predicted|warning|caution|neutral}`.
- Panel cards: `pio-panel` (28px radius, box-shadow). Inner panels: `pio-panel-nested` (18px radius).

## Component map
| File | Purpose |
|---|---|
| `frontend/src/app/page.tsx` | Root — renders `<ProteinWorkbench>` |
| `frontend/src/components/workbench/ProteinWorkbench.tsx` | Main workbench (2 900 lines — all tabs, sidebar, report, compare, ligand detail) |
| `frontend/src/components/workbench/ExploreSidebar.tsx` | Left sidebar (input forms, fetch, gallery) |
| `frontend/src/components/workbench/TopNav.tsx` | Sticky top nav |
| `frontend/src/components/workbench/WorkbenchShell.tsx` | Layout shell |
| `frontend/src/components/viewer/StructureViewer.tsx` | Mol* 3-D viewer wrapper |

## Explore workspace polish pass — 2026-06-22 (third session)

**Files touched:**
- `frontend/src/app/layout.tsx` — font swapped from Plus Jakarta Sans to DM Sans (`DM_Sans` from `next/font/google`).
- `frontend/src/app/globals.css` — `--pio-radius-lg` 28px → 24px; `--pio-bg-page: #EDEAE2` added; `.pio-shell` background → `var(--pio-bg-page)`; `--background` → `var(--pio-bg-page)`.
- `frontend/src/components/workbench/ExploreSidebar.tsx` — removed `border-r` divider; sidebar bg changed to `#F5F2EA`.
- `frontend/src/components/workbench/ProteinWorkbench.tsx` — removed `border-l` on results column; results bg → `#F5F2EA`; outer 3-col wrapper gains 3-layer shadow; loading overlay extracted to `LoadingOverlay` component with cycling `LOADING_LINES` text; gallery grid changed to `grid-cols-2 sm:grid-cols-3` with semantic tag colors via `tagBackground`/`tagColor` helpers.

**Deliberately NOT touched:**
- Mol* internals, dark mode, Compare mode, Report tab.
- `--pio-paper`, `--pio-green`, `--pio-green-deep` token values — only the page bg (`--pio-bg-page`) is new.

## UI polish & bug-fix pass — 2026-06-22 (second session)

**Files touched:**
- `frontend/src/components/workbench/WorkbenchShell.tsx` — removed `overflow:hidden` on container wrapper, added `px-4 pb-4 pt-3` so the 3-col grid's 16px corners are visible against the page background.
- `frontend/src/components/workbench/ProteinWorkbench.tsx` — 3-col grid: added unified `rounded-[16px] border overflow-hidden shadow` wrapper; viewer column now edge-to-edge sage bg (no `p-3` card-inside-column); `ViewerModeToggle` replaced by inline absolute top-right pill; `SelectionBar` replaced by inline absolute bottom bar; results column gets `bg-[var(--pio-paper)] border-l`; results tab strip changed to `flex-nowrap overflow-x-auto` with underline-style active; `EmptyWorkbenchState` action buttons stacked vertically as full-width pill links; `ExampleGallery` cards in right panel get `overflow:hidden line-clamp-3` treatment.
- `frontend/src/components/workbench/ExploreSidebar.tsx` — sidebar gets `bg-[var(--pio-paper)] border-r border-[rgba(20,20,15,0.08)]`; "or load bundled sample →" link changed to `--pio-green-deep` with hover underline.
- `frontend/src/components/viewer/StructureViewer.tsx` — removed `rounded-[var(--pio-radius-lg)]` and `shadow` from both empty-state and loaded-state root divs (parent wrapper + `overflow:hidden` clips corners now).

**Deliberately NOT touched:**
- Mol* internals — no changes to Mol* canvas behaviour, only the outer wrapper div.
- `ViewerModeToggle` / `SelectionBar` functions still exist at bottom of `ProteinWorkbench.tsx` as dead code (safe to delete in a future pass).
- Report, Compare, Confidence, PAE, Quality, Methods tab content — out of scope for this pass.
- Dark mode — unchanged.

**Known remaining gaps:**
- Compare mode sidebar still placeholder.
- The bottom-left Mol* mini-map bar (visible when structure is loaded) overlaps the sidebar/viewer seam — it's a Mol* artifact, not custom code; requires hiding via Mol* PluginUISpec if desired.
- Tab count badges (e.g. "Contacts 1,284") not yet implemented.
- Metadata KV row hover tints not added.

## Visual alignment pass — 2026-06-22
**What changed:** Replaced all `slate-*`, `cyan-*`, and `amber-*` Tailwind color utilities in
`ProteinWorkbench.tsx` with the design-system tokens (`--pio-ink`, `--pio-graphite`,
`--pio-line`, `--pio-line-strong`, `--pio-sand`, `--pio-blue-pale`, `--pio-blue-deep`,
`--pio-blue`, `--pio-amber-pale`, `--pio-amber-deep`, `--pio-amber`). Also added
`rounded-[var(--pio-radius-lg/md/sm)]` to panel and KV-row containers that had no
border-radius. Export buttons switched to `.pio-button-secondary`.

**What was NOT touched this pass:**
- Mol* 3-D viewer internals (`StructureViewer.tsx`) — Mol* ships its own CSS; don't override it.
- Dark mode — light is the primary theme; dark mode wasn't verified on the live app and was left for a dedicated session.
- `ExploreSidebar.tsx`, `TopNav.tsx`, `WorkbenchShell.tsx` — already clean (no off-token color utilities found).
- Gallery cards, empty states, tab panels — content layer was confirmed correct by the brief; not touched.

**Open questions for next session:**
- Compare mode is still a placeholder per Section 5 of the redesign brief — content, not style.
- A side-by-side screenshot comparison against the reference HTML (per the alignment brief's Definition of Done) was not done in this session — run the dev server and compare the Report tab, Ligand detail panel, and Contacts table against the reference file.
- Dark mode: if it ships, verify `[data-theme="dark"]` on `<html>` and that `--pio-accent` resolves to `#3DCB76` on primary buttons.
