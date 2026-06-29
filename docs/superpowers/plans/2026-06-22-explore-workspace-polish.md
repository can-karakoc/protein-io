# Explore Workspace Polish + Load Animation Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove column-divider borders, introduce a cycling-text LoadingOverlay component, update gallery cards to 2-col with semantic tag colors, swap the font to DM Sans, and tighten design tokens (page bg, radius, no raw hex in components).

**Architecture:** All changes are purely visual/CSS — no API, no state, no routing changes. Tokens live in `globals.css`; font registration lives in `layout.tsx`. The LoadingOverlay is a self-contained function component extracted from the inline overlay in `ProteinWorkbench.tsx`. Gallery card semantic coloring is handled by two pure helper functions (`tagBackground` / `tagColor`) co-located with the `EXAMPLE_GALLERY` constant.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4, `next/font/google` (DM Sans + IBM Plex Mono).

---

## File Map

| File | What changes |
|---|---|
| `frontend/src/app/layout.tsx` | Swap `Plus_Jakarta_Sans` → `DM_Sans` |
| `frontend/src/app/globals.css` | Page bg token, `--pio-radius-lg` 28→24px, new `.pio-bg-page` class |
| `frontend/src/components/workbench/ExploreSidebar.tsx` | Remove `border-r`, set sidebar bg to `#F5F2EA` |
| `frontend/src/components/workbench/ProteinWorkbench.tsx` | Remove results `border-l`; update results bg; richer outer shadow; extract LoadingOverlay; gallery: 2-col grid + semantic tags |
| `frontend/CLAUDE.md` | Add dated entry for this pass |

---

## Task 1 — Font swap (layout.tsx)

**Files:**
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Replace the font import and variable**

Change `layout.tsx` from:

```tsx
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";

const pioSans = Plus_Jakarta_Sans({
  variable: "--font-pio-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
```

to:

```tsx
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";

const pioSans = DM_Sans({
  variable: "--font-pio-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
```

The `pioMono`, `metadata`, and `RootLayout` JSX stay untouched.

- [ ] **Step 2: Verify dev server compiles**

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer/frontend
npm run dev 2>&1 | head -20
```

Expected: no `Module not found` errors; Next.js starts on port 3000.

- [ ] **Step 3: Commit**

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer
git add frontend/src/app/layout.tsx
git commit -m "feat: swap font to DM Sans"
```

---

## Task 2 — Token + CSS updates (globals.css)

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Update `--pio-radius-lg` and add page background token**

In the `:root` block, change line 30 and add new token after it:

```css
:root {
  /* ... existing tokens ... */
  --pio-radius-lg: 24px;       /* was 28px */
  /* ... rest ... */
  --pio-bg-page: #EDEAE2;       /* warm stone — shell/page background */
  --background: var(--pio-bg-page);
  /* ... */
}
```

Also update `.pio-shell`:

```css
.pio-shell {
  min-height: 100vh;
  overflow-x: hidden;
  background: var(--pio-bg-page);
  color: var(--pio-ink);
}
```

The `--pio-paper: #fbfbf8`, `--pio-green: #8fbf8a`, `--pio-green-deep: #2f5c33` token **values** stay as-is — these are correct token definitions. The rule is no raw hex in component TSX, and a grep confirms there are none.

- [ ] **Step 2: Verify no raw hex in component files**

```bash
grep -rn "#8fbf8a\|#8FBF8A\|#fbfbf8\|#FBFBF8\|#2f5c33\|#2F5C33" \
  /Users/cankarakoc/Codex/protein-interaction-explorer/frontend/src/components/
```

Expected: no output. If any match appears, replace with the corresponding CSS variable reference.

- [ ] **Step 3: Commit**

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer
git add frontend/src/app/globals.css
git commit -m "feat: update page bg token and radius-lg to 24px"
```

---

## Task 3 — Remove column borders, update backgrounds + outer shadow

**Files:**
- Modify: `frontend/src/components/workbench/ExploreSidebar.tsx`
- Modify: `frontend/src/components/workbench/ProteinWorkbench.tsx`

### ExploreSidebar.tsx

- [ ] **Step 1: Remove border-r and update sidebar bg**

Find the `<aside>` opening tag (line 73) and change:

```tsx
<aside className="flex h-full flex-col gap-3 overflow-y-auto border-r border-[rgba(20,20,15,0.08)] bg-[var(--pio-paper)] p-4">
```

to:

```tsx
<aside className="flex h-full flex-col gap-3 overflow-y-auto bg-[#F5F2EA] p-4">
```

### ProteinWorkbench.tsx — results column

- [ ] **Step 2: Remove border-l and update results column bg**

Find the results column `<section>` (around line 850) and change:

```tsx
<section className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-[rgba(20,20,15,0.08)] bg-[var(--pio-paper)]">
```

to:

```tsx
<section className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#F5F2EA]">
```

### ProteinWorkbench.tsx — outer wrapper shadow

- [ ] **Step 3: Replace the single-layer shadow on the 3-col grid wrapper**

Find the 3-col grid div (around line 745):

```tsx
className="grid h-full min-w-0 overflow-hidden rounded-[16px] border border-[rgba(20,20,15,0.09)] bg-[var(--pio-white)] shadow-[0_1px_2px_rgba(20,20,15,0.05)]"
```

Change to:

```tsx
className="grid h-full min-w-0 overflow-hidden rounded-[16px] border border-[rgba(20,20,15,0.09)] bg-[var(--pio-white)] shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)]"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer
git add frontend/src/components/workbench/ExploreSidebar.tsx \
        frontend/src/components/workbench/ProteinWorkbench.tsx
git commit -m "feat: remove column borders, warm bg contrast, richer outer shadow"
```

---

## Task 4 — LoadingOverlay component (ProteinWorkbench.tsx)

**Files:**
- Modify: `frontend/src/components/workbench/ProteinWorkbench.tsx`

The loading overlay is currently inline JSX inside the viewer column. Extract it into a `LoadingOverlay` function component with cycling text.

- [ ] **Step 1: Add the LOADING_LINES constant and LoadingOverlay component**

Add after the `EXAMPLE_GALLERY` array (around line 128), before `export function ProteinWorkbench()`:

```tsx
const LOADING_LINES = [
  "Parsing structure…",
  "Computing contacts…",
  "Building interaction graph…",
  "Mapping ligands…",
  "Finalising analysis…",
];

function LoadingOverlay({ statusLabel }: { statusLabel: string | null }) {
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setLineIndex((i) => (i + 1) % LOADING_LINES.length);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--pio-sage)]">
      <svg
        viewBox="0 0 100 100"
        className="pio-loading-pulse h-14 w-14 text-[var(--pio-green-deep)]"
        aria-hidden="true"
      >
        <g filter="url(#goo)">
          <circle cx="42" cy="45" r="17" fill="currentColor" />
          <circle cx="66" cy="30" r="10" fill="currentColor" />
          <circle cx="64" cy="56" r="9" fill="currentColor" />
          <circle cx="28" cy="68" r="12" fill="currentColor" />
          <circle cx="20" cy="38" r="7" fill="currentColor" />
        </g>
      </svg>
      <p className="mt-3 font-mono text-xs text-[var(--pio-green-deep)]">
        {statusLabel ?? LOADING_LINES[lineIndex]}
      </p>
    </div>
  );
}
```

Note: `useState` and `useEffect` are already imported at the top of `ProteinWorkbench.tsx`. Confirm the import line includes both — if it only has `useState`, add `useEffect` to the import.

- [ ] **Step 2: Replace the inline loading overlay with `<LoadingOverlay>`**

Find the inline loading overlay block (around line 827–846):

```tsx
{/* Loading overlay */}
{isAnyLoading && (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--pio-sage)]">
    <svg
      viewBox="0 0 100 100"
      className="pio-loading-pulse h-14 w-14 text-[var(--pio-green-deep)]"
      aria-hidden="true"
    >
      <g filter="url(#goo)">
        <circle cx="42" cy="45" r="17" fill="currentColor" />
        <circle cx="66" cy="30" r="10" fill="currentColor" />
        <circle cx="64" cy="56" r="9" fill="currentColor" />
        <circle cx="28" cy="68" r="12" fill="currentColor" />
        <circle cx="20" cy="38" r="7" fill="currentColor" />
      </g>
    </svg>
    {viewerStatusLabel && (
      <p className="mt-3 font-mono text-xs text-[var(--pio-green-deep)]">{viewerStatusLabel}</p>
    )}
  </div>
)}
```

Replace with:

```tsx
{/* Loading overlay */}
{isAnyLoading && <LoadingOverlay statusLabel={viewerStatusLabel} />}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer
git add frontend/src/components/workbench/ProteinWorkbench.tsx
git commit -m "feat: extract LoadingOverlay with cycling text"
```

---

## Task 5 — Gallery card overhaul (ProteinWorkbench.tsx)

**Files:**
- Modify: `frontend/src/components/workbench/ProteinWorkbench.tsx`

Changes: 2-col grid, semantic tag colors, `overflow:hidden` on cards.

- [ ] **Step 1: Add tag color helpers above the gallery JSX**

Add these two pure functions right before the gallery `<section>` (around line 930), after `WorkbenchModePlaceholder`:

```tsx
function tagBackground(tag: string): string {
  const t = tag.toLowerCase();
  if (t === "alphafold" || t === "plddt" || t === "predicted") return "var(--pio-lavender-pale)";
  if (t === "rcsb" || t === "experimental" || t === "multi-chain") return "var(--pio-blue-pale)";
  if (t === "ligand" || t === "contacts") return "var(--pio-green-pale)";
  if (t === "large" || t === "performance") return "var(--pio-amber-pale)";
  return "var(--pio-sand)";
}

function tagColor(tag: string): string {
  const t = tag.toLowerCase();
  if (t === "alphafold" || t === "plddt" || t === "predicted") return "var(--pio-lavender-deep)";
  if (t === "rcsb" || t === "experimental" || t === "multi-chain") return "var(--pio-blue-deep)";
  if (t === "ligand" || t === "contacts") return "var(--pio-green-deep)";
  if (t === "large" || t === "performance") return "var(--pio-amber-deep)";
  return "var(--pio-graphite)";
}
```

- [ ] **Step 2: Update the gallery section JSX**

Find the gallery `<section>` block (lines 930–982) and replace with:

```tsx
{/* ── Example gallery — always visible below the workbench ── */}
<section className="mx-auto w-full max-w-[1500px] px-6 py-10">
  <p className="pio-label mb-1">Example gallery</p>
  <p className="pio-section-copy mb-6">Guided structures for quickly testing common workflows.</p>
  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
    {EXAMPLE_GALLERY.map((card) => (
      <div
        key={card.id}
        className="flex flex-col overflow-hidden rounded-[var(--pio-radius-lg)] bg-[var(--pio-sand)] p-3"
      >
        {/* Fixed-height thumbnail */}
        <div className="mb-3 flex h-20 shrink-0 items-center justify-center rounded-[var(--pio-radius-md)] bg-[var(--pio-sage)]">
          <svg
            viewBox="0 0 100 100"
            className="pio-loading-pulse h-10 w-10 text-[var(--pio-green-deep)]"
            aria-hidden="true"
          >
            <g filter="url(#goo)">
              <circle cx="42" cy="45" r="17" fill="currentColor" opacity="0.7" />
              <circle cx="66" cy="30" r="10" fill="currentColor" opacity="0.7" />
              <circle cx="64" cy="56" r="9" fill="currentColor" opacity="0.7" />
              <circle cx="28" cy="68" r="12" fill="currentColor" opacity="0.7" />
            </g>
          </svg>
        </div>
        <p className="line-clamp-1 text-sm font-bold leading-tight text-[var(--pio-ink)]">{card.title}</p>
        <p className="pio-value mt-0.5 line-clamp-1 text-[11px]">{card.source}</p>
        <p className="pio-section-copy mt-1.5 line-clamp-3 text-[11px] leading-snug">{card.description}</p>
        <div className="mt-2 flex h-[22px] shrink-0 flex-wrap gap-1 overflow-hidden">
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: tagBackground(tag), color: tagColor(tag) }}
            >
              {tag}
            </span>
          ))}
        </div>
        <p className="mt-2 line-clamp-2 text-[11px] italic text-[var(--pio-graphite)]">{card.hint}</p>
        <button
          type="button"
          onClick={() => loadGalleryExample(card.id)}
          className="pio-button-secondary mt-auto h-8 w-full shrink-0 text-xs"
        >
          {card.actionLabel}
        </button>
      </div>
    ))}
  </div>
</section>
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer
git add frontend/src/components/workbench/ProteinWorkbench.tsx
git commit -m "feat: gallery 2-col grid, semantic tag colors, overflow:hidden cards"
```

---

## Task 6 — Update CLAUDE.md, push, deploy

**Files:**
- Modify: `frontend/CLAUDE.md`

- [ ] **Step 1: Add dated entry to CLAUDE.md**

Append a new section at the top of the existing notes (after the first `##` heading block):

```markdown
## Explore workspace polish pass — 2026-06-22 (third session)

**Files touched:**
- `frontend/src/app/layout.tsx` — font swapped from Plus Jakarta Sans to DM Sans (`DM_Sans` from `next/font/google`).
- `frontend/src/app/globals.css` — `--pio-radius-lg` 28px → 24px; `--pio-bg-page: #EDEAE2` added; `.pio-shell` background → `var(--pio-bg-page)`; `--background` → `var(--pio-bg-page)`.
- `frontend/src/components/workbench/ExploreSidebar.tsx` — removed `border-r` divider; sidebar bg changed to `#F5F2EA`.
- `frontend/src/components/workbench/ProteinWorkbench.tsx` — removed `border-l` on results column; results bg → `#F5F2EA`; outer 3-col wrapper gains 3-layer shadow; loading overlay extracted to `LoadingOverlay` component with cycling `LOADING_LINES` text; gallery grid changed to `grid-cols-2 sm:grid-cols-3` with semantic tag colors via `tagBackground`/`tagColor` helpers.

**Deliberately NOT touched:**
- Mol* internals, dark mode, Compare mode, Report tab.
- `--pio-paper`, `--pio-green`, `--pio-green-deep` token values — only the page bg (`--pio-bg-page`) is new.
```

- [ ] **Step 2: Commit CLAUDE.md**

```bash
cd /Users/cankarakoc/Codex/protein-interaction-explorer
git add frontend/CLAUDE.md
git commit -m "docs: record explore workspace polish pass"
```

- [ ] **Step 3: Push and deploy**

```bash
git push origin main
cd frontend && vercel deploy --prod --force
```

Expected: Vercel prints a deployment URL ending in `protein-io.vercel.app`.

---

## Self-Review

**Spec coverage:**
- ✅ Remove ALL column borders → Task 3 (sidebar border-r, results border-l removed)
- ✅ New 3-layer outer shadow → Task 3 step 3
- ✅ LoadingOverlay component with cycling text → Task 4
- ✅ Gallery 2-col grid → Task 5 step 2
- ✅ Semantic tag colors (`tagBackground`/`tagColor`) → Task 5 steps 1–2
- ✅ Font → DM Sans → Task 1
- ✅ Page bg `#EDEAE2` → Task 2 step 1
- ✅ `--pio-radius-lg` → 24px → Task 2 step 1
- ✅ Hex sweep verification → Task 2 step 2
- ✅ CLAUDE.md + commit + push → Task 6

**Placeholder scan:** No TBD, no "add appropriate" language, all steps have concrete code.

**Type consistency:** `LoadingOverlay` uses `statusLabel: string | null` — referenced correctly in the call site `statusLabel={viewerStatusLabel}` where `viewerStatusLabel` is `string | null`. ✅
