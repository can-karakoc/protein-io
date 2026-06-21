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
