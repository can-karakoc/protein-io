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
- `Export contacts CSV` → moves to the results panel Contacts tab header (contextual)
- `Load sample` → moves to sidebar as a small link below the drop zone
- `Reset` → moves to sidebar below Analyze, only shown when a structure is loaded

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

**Status / error / warning banners** — same as today, rendered below the card (errors and warnings only — in-progress status moves to the viewer overlay).

### 2b. Metadata summary card

Same `CompactMetadataSummary` component as today — appears below the load card once a structure is loaded. No changes to content.

### 2c. Structure comparison — moved to Compare mode

The "Structure comparison" panel currently lives in the Explore sidebar. Move it to be the primary content of the Compare mode sidebar. In Explore mode the sidebar only contains the two cards above.

---

## 3. Main layout — WorkbenchShell

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

## 4. Viewer loading overlay

When a fetch or upload is in progress, the Mol* viewer column shows a centered overlay instead of a blank/stale canvas:

- Semi-transparent `--pio-sage` background (`position: absolute; inset: 0`)
- Centered: blob logo mark (pulsing via `pio-loading-pulse`) + mono status label that updates with the current step: `"Fetching from RCSB…"` / `"Fetching from AlphaFold…"` / `"Uploading…"` / `"Analyzing…"`
- The overlay sits on top of the viewer — Mol* stays mounted underneath so it doesn't reinitialise on success
- Dismissed as soon as `isLoading` returns false and analysis data arrives

This replaces the sidebar status banner for the in-progress moment. The sidebar banner is kept only for errors and warnings.

---

## 5. Results panel (right column)

No content changes — same tabs (Overview / Chains / Ligands / Contacts / Confidence / PAE / Quality / Methods), same data, same components.

Changes:
- `Export contacts CSV` button moves here — rendered in the Contacts tab header when contacts are loaded
- `Export ligand CSV` button moves here — rendered in the Ligands tab header when ligands are loaded
- Panel header shows the loaded structure name (filename or PDB ID) as a small mono badge

Empty state (no structure loaded): concise prompt — "Load a structure to begin." No gallery here — gallery moves below the 3-column layout (see Section 6).

---

## 6. Example gallery (below the 3-column workbench)

The example gallery moves out of the results panel and becomes a full-width section **below** the 3-column workbench, always visible regardless of whether a structure is loaded.

**Layout:** horizontal scroll row of cards. Each card:
- Uses the `cap-card` / card-in-card pattern from the design system (sand outer frame, white inner panel, `--pio-radius-lg`)
- Inner panel: structure type icon or a small molecule blob SVG in `--pio-sage` background
- Tags as `pio-badge-neutral` mono chips (e.g. `local`, `ligand`, `fast`)
- Title, source line (mono), one-line description
- "What to look at" hint in `--pio-graphite`
- A single `pio-button-secondary` CTA ("Load 2HHB", "Load sample", etc.)

**Section header:** eyebrow label "Example gallery" + subtitle "Guided structures for quickly testing common workflows."

**Data source:** the existing `EXAMPLE_GALLERY` array in `ProteinWorkbench.tsx` — no new data, just re-rendered with the new card style.

---

## 7. Files to change

| File | Change |
|---|---|
| `TopNav.tsx` | Remove Export/Reset/Load sample buttons; keep mode tabs + Docs/GitHub links |
| `ExploreSidebar.tsx` | Replace 4-panel stack with unified load card (pill switcher) + metadata card; remove comparison panel |
| `WorkbenchShell.tsx` | Change to fixed-height 3-column grid layout |
| `ProteinWorkbench.tsx` | Update prop wiring, viewer overlay, Export buttons into results tab headers, Reset into sidebar, comparison into Compare mode, gallery below workbench |

No new component files needed.

---

## 8. Out of scope

- No changes to result tab content (Overview, Chains, Contacts, Ligands, Confidence, PAE, Quality, Methods)
- No changes to `StructureViewer.tsx`
- No changes to backend
- No dark mode
- No Compare mode content changes (placeholder stays as-is)
- No Report mode changes
