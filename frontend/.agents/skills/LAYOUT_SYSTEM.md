# Layout Skill — Build Exact Layouts

> **Purpose** — A repeatable recipe for composing pixel-precise, responsive layouts in this project. Use this alongside `DESIGN_SYSTEM.md` (tokens) and `COMPONENT_SYSTEM.md` (components).

---

## 1. Mental Model — 4 Concentric Rings

Every screen in this app fits into a **4-ring** anatomy. Build outside-in.

```
┌─ App Shell ───────────────────────────────────────────┐
│  Sidebar │ ┌─ Page ─────────────────────────────────┐ │
│          │ │ Header                                 │ │
│          │ ├────────────────────────────────────────┤ │
│          │ │ ┌─ Section ──────────────────────────┐ │ │
│          │ │ │ ┌─ Block (Card / Form / List) ──┐ │ │ │
│          │ │ │ │  …content…                    │ │ │ │
│          │ │ │ └───────────────────────────────┘ │ │ │
│          │ │ └────────────────────────────────────┘ │ │
│          │ └────────────────────────────────────────┘ │
└──────────┴────────────────────────────────────────────┘
```

| Ring        | Element                              | Owns                                    |
|-------------|--------------------------------------|-----------------------------------------|
| 1. Shell    | `SidebarProvider` + `AppSidebar`     | Sidebar, global header, viewport flex   |
| 2. Page     | Route component (`pages/Index.tsx`)  | Header bar, scrollable main area        |
| 3. Section  | Wrapper `<section>` w/ max-width     | Vertical rhythm, hero/grid composition  |
| 4. Block    | `Card`, custom composite             | Internal padding, content layout        |

**Rule:** Each ring sets only its own padding/gap. Never reach across rings.

---

## 2. The Spacing System (8pt grid)

All spacing comes from Tailwind's default scale, which is 4 px-based but we **use multiples of 2** (`0.5` = 2 px).

| Token  | px   | Use                                   |
|--------|------|---------------------------------------|
| `1`    | 4    | Icon ↔ label gap                       |
| `2`    | 8    | Tight inline gap, badge padding        |
| `3`    | 12   | Sidebar item padding, compact stacks   |
| `4`    | 16   | Default block padding                  |
| `5`    | 20   | Card body padding                      |
| `6`    | 24   | Section padding inside main            |
| `8`    | 32   | Section vertical rhythm                |
| `10`   | 40   | Page edge gutter (sm+)                 |
| `12+`  | 48+  | Hero spacing, large dividers           |

**Vertical rhythm pattern** (used in `Index.tsx` empty-state):

```tsx
<div className="px-6 sm:px-10 pt-6 pb-40 space-y-8">
  <SectionA />
  <SectionB />
</div>
```

- `px-6 sm:px-10` — page gutter (responsive).
- `pt-6 pb-40` — top tight, bottom large (clears the floating chat).
- `space-y-8` — uniform 32 px between sections.

---

## 3. Responsive Breakpoints

Tailwind defaults — **mobile first**, override upward only.

| Prefix  | Min width | Typical use                              |
|---------|-----------|------------------------------------------|
| (none)  | 0         | Phone-first stack, full width            |
| `sm:`   | 640       | Larger gutters, side-by-side toolbars    |
| `md:`   | 768       | Two-column splits, sidebars              |
| `lg:`   | 1024      | Three-column dashboards                  |
| `xl:`   | 1280      | Wide editor + side panel                 |
| `2xl:`  | 1400      | Container max-width (set in tailwind cfg)|

**Container** is configured in `tailwind.config.ts`:

```ts
container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } }
```

Use `container` only when you want the centered, padded, max-width behavior. Most internal pages do **not** need it — they use `max-w-3xl mx-auto` or similar inside a section.

---

## 4. Recipes (Copy-paste templates)

### 4.1 App Shell (already implemented — reference only)

```tsx
<SidebarProvider>
  <div className="min-h-screen flex w-full">          {/* w-full is critical */}
    <AppSidebar />
    <div className="flex-1 flex flex-col min-w-0">    {/* min-w-0 prevents overflow */}
      <header className="h-12 flex items-center justify-between border-b border-border px-4 shrink-0">
        <SidebarTrigger />
        <ThemeToggle />
      </header>
      <main className="flex-1 overflow-hidden relative">
        {/* Page goes here */}
      </main>
    </div>
  </div>
</SidebarProvider>
```

**Why each class matters:**
- `min-h-screen` — fills viewport vertically.
- `w-full` on the flex parent — without it the sidebar collapses oddly.
- `min-w-0` on the right column — allows flex children to shrink below their intrinsic content width (prevents horizontal overflow from long titles).
- `overflow-hidden` on `<main>` — locks the outer scroll; inner scroll containers handle their own.
- `shrink-0` on header — never let the header collapse.

### 4.2 Scrollable page with sticky header

```tsx
<main className="flex-1 overflow-hidden flex flex-col">
  <header className="h-12 px-4 flex items-center border-b border-border shrink-0">
    <h1 className="text-h3">Page title</h1>
  </header>
  <div className="flex-1 overflow-y-auto">
    <div className="px-6 sm:px-10 py-8 space-y-8 max-w-5xl mx-auto">
      {/* sections */}
    </div>
  </div>
</main>
```

### 4.3 Centered hero (empty state)

```tsx
<div className="flex flex-col items-center justify-center min-h-full py-12">
  <h2 className="text-h2 tracking-tight mb-3">Something's cooking…</h2>
  <p className="text-body text-muted-foreground max-w-sm text-center">
    Drop an idea below
  </p>
</div>
```

### 4.4 Responsive 2-column split (`DjDashboard` pattern)

```tsx
<div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-0">
  <div className="p-5 space-y-4">{/* main */}</div>
  <div className="border-t md:border-t-0 md:border-l border-border">
    {/* sidebar panel */}
  </div>
</div>
```

- Use **named track sizes** (`[1fr_220px]`) instead of `grid-cols-2` when one column has a fixed natural width.
- Borders flip from top-only (mobile) to left-only (desktop).

### 4.5 Card with header / body / footer

```tsx
<div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
  <div className="px-5 py-3 border-b border-border bg-secondary/40">
    {/* header */}
  </div>
  <div className="p-5 space-y-4">
    {/* body */}
  </div>
  <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
    {/* footer */}
  </div>
</div>
```

### 4.6 Toolbar (icons + spacer + actions)

```tsx
<div className="flex items-center gap-2 px-4 h-12 border-b border-border">
  <Button variant="ghost" size="icon"><Icon /></Button>
  <Button variant="ghost" size="icon"><Icon /></Button>
  <div className="flex-1" />                    {/* push right */}
  <Button size="sm">Action</Button>
</div>
```

### 4.7 Form field stack

```tsx
<form className="space-y-4 max-w-md">
  <div className="space-y-1.5">
    <Label htmlFor="x">Label</Label>
    <Input id="x" />
    <p className="text-meta text-muted-foreground">Helper</p>
  </div>
  {/* repeat */}
</form>
```

### 4.8 Responsive grid of cards

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(i => <Card key={i.id}>…</Card>)}
</div>
```

Add `auto-rows-fr` if cards must equalize height.

### 4.9 Floating element pinned to bottom-center (`AgentChat` pattern)

Inside a `relative` parent:

```tsx
<div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4">
  {/* chat */}
</div>
```

Pair with `pb-40` on the scroll container so content never hides under it.

---

## 5. Flexbox vs Grid — When to Use Which

| Use **flex** when                         | Use **grid** when                          |
|--------------------------------------------|--------------------------------------------|
| 1-D row or column                          | 2-D layout (rows AND columns)              |
| Pushing items apart (`flex-1`, `ml-auto`) | Fixed track sizes (`[200px_1fr]`)          |
| Toolbars, headers, list items              | Dashboards, card galleries                 |
| Wrapping content with `flex-wrap`          | Aligning across rows                       |

**Default to flex** for any single-axis arrangement. Grid is a sharper tool — reach for it deliberately.

---

## 6. The "Won't Overflow" Checklist

These bugs show up constantly. Audit every new layout against this list.

1. **`min-w-0` on flex children** that contain text or `truncate`.
2. **`truncate` on text** inside a width-constrained flex item (`flex-1 truncate`).
3. **`shrink-0` on icons** so they don't get squashed (`<Icon className="h-4 w-4 shrink-0" />`).
4. **`overflow-hidden` on the outer scroll container**, `overflow-y-auto` on the inner one.
5. **`break-words` or `overflow-wrap-anywhere`** for user-generated long strings.
6. **`max-w-*` on prose** so reading width stays comfortable (45-75ch).
7. **`overflow-x-auto`** on tables/horizontal lists, never on the page itself.

---

## 7. Z-Index Scale

Use only these named layers — do not invent z values.

| Layer            | z   | Use                                  |
|------------------|-----|--------------------------------------|
| base content     | 0   | Default                              |
| sticky header    | 10  | Sticky page headers                  |
| dropdown / popover | 50 | shadcn defaults                      |
| modal / sheet    | 50  | shadcn defaults                      |
| toast            | 100 | Sonner / toaster                     |

If you need more than these, you're nesting modals — refactor first.

---

## 8. Anti-Patterns

❌ **Hard-coded pixel values** (`style={{ marginTop: 17 }}`). Use Tailwind scale.
❌ **Mixing flex and grid for the same axis** (`flex` parent with `grid-cols-2` child to fake a row).
❌ **`width: 100vw`** — causes horizontal scrollbar on Windows. Use `w-full`.
❌ **Negative margins** to pull elements out of containers. Restructure instead.
❌ **`overflow: visible` on a scroll parent** to "show" overflow — use a portal.
❌ **Skipping `min-w-0`** then patching with `overflow-hidden` — fix the cause.
❌ **`absolute` positioning when flex/grid would work** — only use absolute for true overlays.
❌ **Custom breakpoints** outside Tailwind's scale — extend the config instead.

---

## 9. Build Order — Step-by-step

When given a Figma/sketch/description, build in this order:

1. **Identify the ring** (Shell? Page? Section? Block?). Don't touch outer rings if not asked.
2. **Sketch the grid** — write the `grid-cols-*` or `flex` skeleton with empty `<div>`s and visible borders (`border border-red-500`) to see the boxes.
3. **Apply spacing tokens** — pick from §2, no guessing.
4. **Drop in real content** — text, icons, controls.
5. **Add responsive prefixes** (`sm:` `md:` `lg:`) — only override what changes.
6. **Run the overflow checklist** (§6).
7. **Test viewports** — at minimum 375 (phone), 768 (tablet), 1280 (desktop).
8. **Remove debug borders.**

---

## 10. Quick Reference — One-liners

```tsx
// Stretch child to fill remaining vertical space
<div className="flex-1 min-h-0">…</div>

// Sticky header inside scroll container
<div className="sticky top-0 z-10 bg-background/80 backdrop-blur">…</div>

// Equal-width children in a flex row
<div className="flex gap-4 *:flex-1">…</div>

// Center anything (modal-style)
<div className="grid place-items-center min-h-screen">…</div>

// Aspect-ratio media box
<div className="aspect-video w-full bg-muted rounded-lg" />

// Safe-area padding (mobile)
<div className="pb-[env(safe-area-inset-bottom)]">…</div>
```

---

**Cross-reference:** Tokens → `DESIGN_SYSTEM.md` · Components → `COMPONENT_SYSTEM.md` · This file → Layout.
