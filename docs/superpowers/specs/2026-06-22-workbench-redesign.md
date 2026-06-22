# Workbench UI Redesign — Spec
**Date:** 2026-06-22
**Scope:** Frontend only — `TopNav`, `ExploreSidebar`, `WorkbenchShell`, `ProteinWorkbench` layout wiring. No backend changes. No new tabs or result types.

---

## Problem

The current UI has three structural issues:
1. A large "Structure upload and contact analysis" page heading wastes the top third of the viewport — nav already carries context.
2. The sidebar stacks four separate panels (Input, RCSB fetch, AlphaFold fetch, Structure comparison) as equal-weight cards, making the primary workflow unclear and the page long.
3. The top nav carries too many actions at equal visual weight (Docs, GitHub, Load sample, Export CSV, Reset) making nothing feel primary.

---

## Decisions

| Decision | Choice |
|---|---|
| Layout | A — compact left sidebar, max viewer, results right |
| Sidebar load workflow | A — segmented pill switcher (File / PDB ID / AlphaFold) |
| Nav | B — brand + mode tabs + plain links only, no actions |

---

## 1. Top Nav

**Remove:** Page heading ("Structure upload and contact analysis") and its subtitle — eliminated entirely.

**Keep:**
- Logo mark + "Protein I/O" brand name (left)
- Mode pills: `Explore` / `Compare` / `Report` (center-left, active = ink fill)
- `Docs` and `GitHub` as plain text links (right, `--pio-graphite`, no border)

**Move out of nav:**
- `Export contacts CSV` → moves to the results panel header (contextual: only visible when contacts are loaded)
- `Load sample` → moves to sidebar (below the drop zone as a small secondary link)
- `Reset` → moves to sidebar (small secondary button below Analyze, only shown when a structure is loaded)

`TopNav.tsx` receives no new props — the action buttons it currently renders are removed; the mode tabs and links stay.

---

## 2. Sidebar — Explore mode

Replace the four stacked panels with one unified "Load structure" card + one contextual metadata card below it.

### 2a. Load structure card

Single `pio-panel` containing:

**Source switcher** — three-segment pill at the top:
```
[ File ]  [ PDB ID ]  [ AlphaFold ]
```
Active segment = ink fill pill. Switching swaps the input below it. Default: `File`.

**File tab:**
- Drop zone / file input (`.pdb`, `.cif`, `.mmcif`) — same logic as today
- Below drop zone: small `Load sample` secondary link ("or load bundled sample →")
- Optional PAE sidecar: collapsible row below the drop zone, label "Add PAE JSON (optional)" — only visible on the File tab since PAE only makes sense with a local file

**PDB ID tab:**
- Mono text input (`e.g. 2HHB`), max 4 chars, auto-uppercase
- `Fetch` primary button — triggers RCSB fetch + auto-runs analysis on success

**AlphaFold tab:**
- Mono text input (`e.g. P69905`), max 10 chars, auto-uppercase
- `Fetch` primary button — triggers AlphaFold fetch + auto-runs analysis on success

**Distance cutoff** — below the source switcher area, always visible:
- Number input (1–12, step 0.1) + "angstroms" label
- Keep existing `pio-input` styling

**Actions row** — below cutoff:
- `▶ Analyze structure` — full-width `pio-button-primary`, disabled when no structure loaded or loading
- `↺ Reset` — small `pio-button-secondary` below Analyze, only rendered when `hasStructure === true`

**Status / error / warning banners** — same as today, rendered below the card.

### 2b. Metadata summary card

Same `CompactMetadataSummary` component as today — appears below the load card once a structure is loaded. No changes to content, just remove duplicate spacing.

### 2c. Structure comparison — moved to Compare mode

The "Structure comparison" panel currently lives in the Explore sidebar. Move it to be the primary content of the Compare mode sidebar. In Explore mode the sidebar only contains the two cards above.

---

## 3. Main layout — WorkbenchShell

Current layout: full-height scroll with sidebar on left. 

New layout: fixed-height 3-column grid that fills the viewport:

```
[Sidebar 260px] [Viewer flex-1] [Results 340px]
```

- `WorkbenchShell` sets `height: calc(100vh - nav-height)` and `overflow: hidden` on the outer container
- Each column scrolls independently (`overflow-y: auto`)
- Viewer column: `StructureViewer` fills 100% of the column height — no wasted space above/below it
- Sidebar and results columns scroll if content overflows

On screens ≤ 900px: collapse to single column, sidebar on top, viewer, results below.

---

## 4. Results panel (right column)

No content changes — same tabs (Overview / Chains / Ligands / Contacts / Confidence / PAE / Quality / Methods), same data, same components.

Changes:
- `Export contacts CSV` button moves here — rendered in the Contacts tab header when contacts are loaded
- `Export ligand CSV` button moves here — rendered in the Ligands tab header when ligands are loaded
- Panel header shows the loaded structure name (filename or PDB ID) as a small mono badge

Empty state (no structure loaded): show a concise prompt — "Load a structure to begin" with the example gallery cards below it. Gallery stays in the results panel, not the sidebar.

---

## 5. Files to change

| File | Change |
|---|---|
| `TopNav.tsx` | Remove Export/Reset/Load sample buttons; keep mode tabs + Docs/GitHub links |
| `ExploreSidebar.tsx` | Replace 4-panel stack with unified load card (pill switcher) + metadata card; remove comparison panel |
| `WorkbenchShell.tsx` | Change to fixed-height 3-column grid layout |
| `ProteinWorkbench.tsx` | Update prop wiring for new sidebar, move Export buttons into results tab headers, add Reset to sidebar, move comparison to Compare mode |

No new components needed. PAE sidecar stays in `ExploreSidebar` (File tab only).

---

## 6. Out of scope

- No changes to result tab content (Overview, Chains, Contacts, Ligands, Confidence, PAE, Quality, Methods)
- No changes to `StructureViewer.tsx`
- No changes to backend
- No dark mode
- No Compare mode content changes (placeholder stays as-is)
- No Report mode changes
