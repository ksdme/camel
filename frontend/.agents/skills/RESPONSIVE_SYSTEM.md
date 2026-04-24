# Responsive Skill — Build for Every Screen

> **Purpose** — A practical playbook for making layouts adapt cleanly from 320 px phones to 1920 px desktops. Pairs with `LAYOUT_SYSTEM.md` (structure) and `DESIGN_SYSTEM.md` (tokens).

---

## 1. The Mobile-First Mandate

**Write base styles for the smallest screen, then add prefixes upward.** Never the reverse.

```tsx
// ✅ Mobile first — base = phone, override at md+
<div className="flex flex-col gap-4 md:flex-row md:gap-8">

// ❌ Desktop first — fights the cascade
<div className="flex flex-row gap-8 max-md:flex-col max-md:gap-4">
```

**Why:** Tailwind's prefixes are `min-width` queries. Stacking `sm:` `md:` `lg:` overrides reads top-down and matches how content scales: phones get the simplest layout, larger screens earn more.

---

## 2. Breakpoint Map

Tailwind defaults — use these names, never invent new ones.

| Prefix  | Min width | Real device                          | Layout shift                      |
|---------|-----------|--------------------------------------|-----------------------------------|
| (none)  | 0         | iPhone SE (375), small Android       | Single column, full-bleed         |
| `sm:`   | 640       | Large phone landscape, small tablet  | Wider gutters, inline buttons     |
| `md:`   | 768       | iPad portrait                        | 2-column splits, sidebar appears  |
| `lg:`   | 1024      | iPad landscape, small laptop         | 3-column dashboards, side panels  |
| `xl:`   | 1280      | Desktop                              | Full editor + tools               |
| `2xl:`  | 1400+     | Large desktop                        | Container caps; whitespace grows  |

**Test at minimum these widths:** 375, 768, 1280. Bonus: 360 (Android), 1024 (iPad land), 1920 (large desktop).

In Lovable, the device toggle above the preview switches phone / tablet / desktop instantly.

---

## 3. The 4 Responsive Axes

Every responsive change falls into one of four categories. Reach for the right one.

| Axis        | Tools                                   | Example                                |
|-------------|------------------------------------------|----------------------------------------|
| **Layout**  | `flex-col → md:flex-row`, `grid-cols-*` | Stack on mobile, split on desktop      |
| **Sizing**  | `w-full md:w-auto`, `max-w-*`            | Buttons full-width on mobile           |
| **Spacing** | `p-4 sm:p-6 lg:p-10`                     | Wider gutters on bigger screens        |
| **Visibility** | `hidden md:block`, `md:hidden`        | Hamburger on mobile, tabs on desktop   |

**Anti-pattern:** Changing typography scale across breakpoints for body text. Pick one body size that works everywhere. Only **headings** should grow (`text-h2 md:text-h1`).

---

## 4. Core Recipes

### 4.1 Stack → Side-by-side

```tsx
<div className="flex flex-col gap-4 md:flex-row md:gap-6">
  <div className="md:w-64 shrink-0">{/* sidebar */}</div>
  <div className="flex-1 min-w-0">{/* main */}</div>
</div>
```

### 4.2 Responsive grid (1 → 2 → 3 columns)

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(i => <Card key={i.id} />)}
</div>
```

Add `auto-rows-fr` to equalize heights.

### 4.3 Hide/show by viewport

```tsx
{/* Hamburger only on mobile */}
<button className="md:hidden">☰</button>

{/* Full nav only on desktop */}
<nav className="hidden md:flex gap-4">…</nav>

{/* Helper text only when there's room */}
<p className="hidden lg:block text-meta text-muted-foreground">Tip…</p>
```

**Caveat:** Hidden elements still render in the DOM. Heavy components → use a state-driven mount instead.

### 4.4 Responsive padding/typography pair

```tsx
<section className="px-4 sm:px-6 lg:px-10 py-8 lg:py-12">
  <h1 className="text-h2 md:text-h1 lg:text-display">Hero</h1>
</section>
```

### 4.5 Buttons: full-width mobile → auto desktop

```tsx
<div className="flex flex-col sm:flex-row gap-2">
  <Button className="w-full sm:w-auto">Primary</Button>
  <Button variant="outline" className="w-full sm:w-auto">Secondary</Button>
</div>
```

### 4.6 Tables → cards on mobile

```tsx
{/* Desktop table */}
<table className="hidden md:table w-full">…</table>

{/* Mobile card list */}
<div className="md:hidden space-y-2">
  {rows.map(r => (
    <div key={r.id} className="rounded-lg border p-3 space-y-1">
      <div className="text-body font-semibold">{r.name}</div>
      <div className="text-meta text-muted-foreground">{r.value}</div>
    </div>
  ))}
</div>
```

### 4.7 Sidebar that becomes a drawer

Already handled by shadcn `Sidebar` — `collapsible="icon"` keeps a mini strip on desktop, `collapsible="offcanvas"` slides in/out as a sheet on mobile. Keep `SidebarTrigger` in the global header (outside the sidebar) so it's always reachable.

### 4.8 Sticky top bar with safe scroll

```tsx
<header className="sticky top-0 z-10 h-12 px-4 md:px-6 flex items-center
                   border-b border-border bg-background/80 backdrop-blur">
```

### 4.9 Aspect-ratio media that scales

```tsx
<div className="aspect-video w-full rounded-lg overflow-hidden bg-muted">
  <img src={src} alt="" className="h-full w-full object-cover" />
</div>
```

### 4.10 Fluid typography (rare — use sparingly)

```tsx
<h1 className="text-[clamp(1.75rem,4vw,3rem)] font-semibold">
```

Only when scale steps don't suffice. Prefer `text-h2 md:text-h1` for predictability.

---

## 5. Container Queries (when parent size matters, not viewport)

Use when a card must adapt based on **its slot**, not the page width — e.g. a widget that lives in both a wide hero and a narrow sidebar.

```tsx
<div className="@container">
  <div className="flex flex-col @md:flex-row gap-2">
    {/* responds to parent width, not viewport */}
  </div>
</div>
```

Requires `@tailwindcss/container-queries` plugin (not currently installed — add only if needed).

---

## 6. Touch-Target & Ergonomics

Phones aren't just small desktops — fingers are blunt instruments.

| Rule                      | Spec                                      |
|---------------------------|-------------------------------------------|
| Minimum tap target        | **44×44 px** (use `h-11 w-11` or `p-3`)   |
| Spacing between targets   | ≥ 8 px (`gap-2`)                          |
| Primary action position   | Bottom-reachable on mobile (thumb zone)   |
| Hover-only affordances    | Always provide a tap equivalent           |
| Form inputs               | `text-base` (16px) to prevent iOS zoom    |

```tsx
{/* Icon button — meets touch target */}
<Button variant="ghost" size="icon" className="h-11 w-11 md:h-9 md:w-9">
  <Icon className="h-4 w-4" />
</Button>
```

---

## 7. Safe Areas (notches, home bars)

```tsx
{/* Bottom-pinned bar respects iPhone home indicator */}
<div className="fixed bottom-0 inset-x-0 pb-[env(safe-area-inset-bottom)]
                bg-background border-t border-border">
```

Add to `index.html` `<meta>` once if not present:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

---

## 8. The Responsive Audit (run before claiming done)

For every new screen, check at **375 / 768 / 1280**:

1. ☐ No horizontal scrollbar.
2. ☐ All text readable (≥ 14 px body, ≥ 16 px form inputs).
3. ☐ All interactive targets ≥ 44 px on mobile.
4. ☐ Long strings truncate or wrap (no overflow).
5. ☐ Images scale without distortion (`object-cover` / `object-contain`).
6. ☐ Sticky/fixed elements don't cover content.
7. ☐ Sidebar/drawer accessible at every breakpoint.
8. ☐ Modal fits viewport (use `max-h-[90vh] overflow-y-auto`).
9. ☐ Tables either scroll horizontally or transform to cards.
10. ☐ Touch flows work — test in actual mobile preview.

---

## 9. Detection Hooks (when CSS isn't enough)

Project ships `useIsMobile()` in `src/hooks/use-mobile.tsx`:

```tsx
import { useIsMobile } from "@/hooks/use-mobile";

const isMobile = useIsMobile(); // true when viewport < 768

return isMobile ? <Drawer /> : <Dialog />;
```

**Rule:** Prefer CSS responsiveness. Only use the hook when components themselves must change (different Radix primitives, different data fetched, etc.).

---

## 10. Anti-Patterns

❌ **`max-md:` everywhere** — desktop-first thinking. Flip the base class.
❌ **`100vw` / `100vh`** — mobile browsers lie about height (URL bar). Use `100dvh` or `min-h-screen`.
❌ **Fixed pixel widths** on cards (`w-[420px]`) — use `max-w-*` + `w-full`.
❌ **Hover-only menus** with no tap fallback — invisible on touch.
❌ **Tiny tap targets** (`h-6 w-6` clickable on mobile).
❌ **Different content** between breakpoints — duplicates work, breaks SEO.
❌ **Breakpoint inside a `style={{}}` ternary** — use Tailwind classes.
❌ **`overflow-x: scroll` on `<body>`** — fix the offending child instead.

---

## 11. Build Order — Responsive Pass

After laying out the desktop view (or simultaneously, if you start mobile-first):

1. **Resize to 375 px** in preview. Note every break.
2. **Stack horizontal groups** (`flex-col` base, `md:flex-row`).
3. **Reduce padding** at base, restore at `sm:`/`lg:`.
4. **Promote secondary actions** to `flex-wrap` or hide non-essentials behind a menu.
5. **Verify touch targets** — bump icon buttons to `h-11 w-11` if needed.
6. **Check sticky/fixed elements** don't overlap content (add `pb-*` to scroll container).
7. **Resize back through 640 → 768 → 1024 → 1280** confirming each transition.
8. **Re-run the audit** in §8.

---

## 12. Quick Reference

```tsx
// Mobile-first stack
flex flex-col gap-4 md:flex-row md:gap-6

// Responsive padding
p-4 sm:p-6 lg:p-10

// Hide on mobile / show on desktop
hidden md:block         // and inverse: md:hidden

// Full-width button → auto on desktop
w-full sm:w-auto

// Responsive grid
grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4

// Heading scale
text-h2 md:text-h1 lg:text-display

// Safe min height (handles mobile URL bar)
min-h-screen   // or min-h-[100dvh]

// Touch-friendly icon button
h-11 w-11 md:h-9 md:w-9

// Modal fits viewport
max-h-[90vh] overflow-y-auto
```

---

**Cross-reference:** Layout structure → `LAYOUT_SYSTEM.md` · Tokens → `DESIGN_SYSTEM.md` · Components → `COMPONENT_SYSTEM.md`.
