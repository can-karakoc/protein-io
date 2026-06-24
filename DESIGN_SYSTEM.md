# Protein I/O — Design System Reference

Quick-copy patterns for all recurring UI components. Keep in sync with `globals.css` and `ProteinWorkbench.tsx`.

---

## Color palette

| Token | Hex | Use |
|---|---|---|
| `--pio-bg-page` | `#EDEAE2` | Page / shell background |
| `--pio-paper` | `#fbfbf8` | Card / panel backgrounds |
| `--pio-ink` | `#14140f` | Primary text |
| `--pio-graphite` | `#6b6f63` | Secondary / muted text |
| `--pio-line` | `rgba(20,20,15,0.08)` | Dividers |
| `--pio-line-strong` | `rgba(20,20,15,0.14)` | Button borders |
| `#1A406A` | — | Primary interactive (active tabs, buttons, icons) |
| `rgba(199,217,236,0.6)` | — | Row selection highlight bg |
| `#C8E3EE` | — | Icon button circle fill (download buttons) |
| `rgba(199,217,236,0.4)` | — | Empty-state icon circle bg |

---

## Typography

- **Font:** DM Sans (`--font-pio-sans`) + IBM Plex Mono (`--font-pio-mono`)
- **Report H1:** `fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: "#111610"`
- **Section heading:** `fontSize: 22, fontWeight: 700, letterSpacing: "-0.015em", color: "#111610"`
- **Sub-heading:** `fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em"`
- **Label / eyebrow:** `fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#636860"`
- **Body small:** `fontSize: 13.5, color: "#636860", lineHeight: 1.5`
- **Mono value:** `fontFamily: "var(--font-pio-mono)", fontSize: 13`

---

## Border radius

All pills, buttons, and tags use **`rounded-[12px]`** — never `rounded-full` for rectangular elements.

| Use | Value |
|---|---|
| Page-level cards | `rounded-[16px]` |
| Nav pills / tab buttons / filter pills | `rounded-[12px]` |
| Icon circles | `borderRadius: "50%"` |
| Data tiles (REPORT_TILE) | `borderRadius: 10` |

---

## Cards

### White content card (Report, Compare empty state)
```tsx
className="rounded-[16px] border border-[rgba(20,20,15,0.09)] bg-white shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)]"
```

### 3-col workbench wrapper (Explore)
```tsx
className="rounded-[16px] border overflow-hidden shadow"
// viewer column: edge-to-edge, no padding card inside
// results column: bg-[var(--pio-paper)] overflow-y-auto
```

### Empty / placeholder centered card (480px max)
```tsx
<div className="flex min-h-full items-center justify-center p-8">
  <div className="w-full max-w-[480px] rounded-[16px] border border-[rgba(20,20,15,0.09)] bg-white p-10 text-center shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)]">
    {/* Icon circle */}
    <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(199,217,236,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
      <SomeIcon size={22} color="#1A406A" />
    </div>
    <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111610" }}>Title</h2>
    <p style={{ fontSize: 13.5, color: "#636860", lineHeight: 1.6, marginTop: 8 }}>Description</p>
    {/* Action buttons */}
    <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "center", flexWrap: "wrap" }}>
      <button className="rounded-[12px] border border-[rgba(17,22,16,0.14)] bg-white px-4 py-2 text-[13px] font-semibold text-[#111610] hover:bg-[rgba(17,22,16,0.04)]">
        Action
      </button>
    </div>
  </div>
</div>
```

---

## Buttons & pills

### Top nav / tab button
```tsx
className={[
  "flex h-[34px] items-center rounded-[12px] px-5 text-[13.5px] font-semibold transition-colors",
  isActive
    ? "bg-[#1A406A] text-white"
    : "text-[var(--pio-ink)] opacity-70 hover:opacity-100 hover:bg-[rgba(26,64,106,0.07)]",
].join(" ")}
```
**Important:** use `font-semibold` on BOTH states to prevent layout shift from weight change.

### Results tab strip button
```tsx
className={[
  "rounded-[12px] px-3.5 py-[7px] text-[13px] font-semibold transition-colors",
  selectedTab === tab.id
    ? "bg-[#1A406A] text-white"
    : "text-[#1A406A] opacity-70 hover:opacity-100 hover:bg-[rgba(26,64,106,0.08)]",
].join(" ")}
```

### Contact / filter pill (rectangular card style)
```tsx
style={{
  borderRadius: 10,
  padding: "8px 18px",
  fontSize: 13,
  fontWeight: 500,
  border: "none",
  background: isSelected ? "rgba(199,217,236,0.5)" : "rgba(17,22,16,0.05)",
  color: isSelected ? "#1A406A" : "#636860",
  transition: "background 150ms, color 150ms",
}}
```

### Export / download icon button (circle)
```tsx
style={{
  background: "#C8E3EE",
  border: "none",
  borderRadius: "50%",
  width: 30,
  height: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  color: "#1A406A",
  cursor: "pointer",
}}
// icon: <Download size={14} />
```

### Export text button (Report header)
```tsx
style={{
  borderRadius: 12,
  border: "1px solid rgba(17,22,16,0.14)",
  background: "white",
  color: "#111610",
  padding: "8px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 6,
}}
```

### External link button (navy circle)
```tsx
<a href={url} target="_blank" rel="noreferrer"
  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: "#1A406A", color: "white", flexShrink: 0, textDecoration: "none" }}>
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2.5 11.5L11.5 2.5M11.5 2.5H6M11.5 2.5V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
</a>
```

---

## Data tables

Tables need fixed `px` column widths (not `fr`) + a `minWidth` that exceeds the container so horizontal scroll is guaranteed.

```tsx
// Scroll wrapper
<div style={{ overflowX: "auto", marginTop: 12 }}>
  <div style={{ minWidth: 1050 }}>  {/* must exceed container width */}
    {/* Header row */}
    <div style={{ display: "grid", gridTemplateColumns: "140px 80px 80px ...", columnGap: 12, borderBottom: "1px solid rgba(17,22,16,0.08)", padding: "8px 0" }}>
      {COLS.map(col => <p key={col} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", color: "#636860" }}>{col}</p>)}
    </div>
    {/* Data rows */}
    {rows.map(row => (
      <div style={{ display: "grid", gridTemplateColumns: "140px 80px 80px ...", columnGap: 12, padding: "10px 0", alignItems: "start" }}>
        ...
      </div>
    ))}
  </div>
</div>
```

**Rule:** `fr` units expand to fill space, so `minWidth: 700` < `888px` available = no scrollbar ever appears. Always use `px`.

---

## Row selection

```tsx
// Row wrapper — add 2px padding to prevent border clipping under overflow containers
<div style={{ padding: "0 2px" }}>
  <div
    onClick={onSelect}
    style={{
      background: selected ? "rgba(199,217,236,0.6)" : undefined,
      border: selected ? "2px solid #1A406A" : "2px solid transparent",
      borderRadius: 8,
      cursor: "pointer",
      // ...other row styles
    }}
  >
```

---

## Report section constants

Copy these into any Report-adjacent component:

```tsx
const REPORT_DIVIDER: React.CSSProperties = { paddingTop: 24, marginTop: 8 };
// No border — sections separated by spacing only, not lines

const REPORT_H2: React.CSSProperties = { fontSize: 22, fontWeight: 700, letterSpacing: "-0.015em", color: "#111610" };
const REPORT_SUB: React.CSSProperties = { fontSize: 13.5, color: "#636860", lineHeight: 1.5, marginTop: 4 };
const REPORT_TILE: React.CSSProperties = { background: "rgba(17,22,16,0.04)", borderRadius: 10, padding: "12px 14px" };
const REPORT_LABEL: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: "#636860", textTransform: "uppercase" };
const REPORT_MONO: React.CSSProperties = { fontFamily: "var(--font-pio-mono)" };
const REPORT_ICON_BTN: React.CSSProperties = {
  background: "#C8E3EE", border: "none", borderRadius: "50%",
  width: 30, height: 30, display: "flex", alignItems: "center",
  justifyContent: "center", flexShrink: 0, color: "#1A406A", cursor: "pointer",
};
```

### Report card wrapper (loaded content only — never wrap empty states)
```tsx
<div className="flex min-h-full items-start justify-center p-6">
  <div className="w-full max-w-[960px] rounded-[16px] border border-[rgba(20,20,15,0.09)] bg-white shadow-[0_2px_4px_rgba(17,22,16,0.06),0_12px_32px_rgba(17,22,16,0.10),0_1px_0px_rgba(17,22,16,0.04)]">
    <div style={{ padding: "32px 36px 56px" }}>
      {/* sections separated by REPORT_DIVIDER */}
    </div>
  </div>
</div>
```

---

## Floating panel (frosted glass)

Used for `FloatingLigandPanel` over the 3D viewer:

```tsx
style={{
  position: "absolute",
  background: "rgba(255,255,255,0.88)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  border: "1px solid rgba(17,22,16,0.10)",
  borderRadius: 14,
  boxShadow: "0 8px 32px rgba(17,22,16,0.18)",
  width: 327,
  zIndex: 20,
}}
```

Drag clamping: use `panelRef.current?.offsetHeight` (not a hardcoded constant) so clamping works for both minimized (44px) and expanded states.

---

## Viewer selection bar (bottom of 3D viewer)

```tsx
<div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-4 bg-[rgba(26,64,106,0.75)] px-5 py-3 backdrop-blur-md">
  <div className="min-w-0">
    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/50">Selected</p>
    <p className="truncate text-[14px] font-bold text-white">{label}</p>
  </div>
  <button className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
    <X size={13} />
  </button>
</div>
```

---

## Layout rules

- **Tab strip:** `sticky top-0 z-10 bg-white shadow-[0_1px_0_rgba(17,22,16,0.07)]` — prevents scroll jumping
- **Tab buttons:** `font-semibold` on BOTH active and inactive states — prevents width shift on weight change
- **Nav items:** identical `h-[34px] px-5` on all items — prevents layout shift when switching modes
- **Contact table:** wrap in `overflowX: "auto"` + inner `minWidth: 420` div; row wrapper gets `padding: "0 2px"` to prevent 2px border clipping
- **Report sections:** use `REPORT_DIVIDER` (spacing only, no border) between all sections; data table header/row lines are the only borders in Report

---

## Branch

All Report redesign work lives on **`feat/report-redesign`** (not yet merged to `main`).
