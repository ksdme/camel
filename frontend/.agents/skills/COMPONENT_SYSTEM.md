# Component System & Reuse Guide

How components are organized, when to build vs. reuse, and the conventions every new component must follow. Pair this with `DESIGN_SYSTEM.md` for tokens.

---

## 1. Folder layout

```
src/
├─ components/
│  ├─ ui/              # shadcn primitives — DO NOT modify in place
│  ├─ sketches/        # Self-contained animated SVG vignettes
│  ├─ AppSidebar.tsx   # App-shell composites
│  ├─ AgentChat.tsx
│  ├─ NoteEditor.tsx
│  ├─ NavLink.tsx
│  └─ SketchShowcase.tsx
├─ pages/              # Route entry points (one per route)
├─ stores/             # Zustand stores — no UI here
├─ hooks/              # Reusable hooks (use-mobile, use-toast)
├─ lib/                # Pure helpers (utils.ts, motion.ts, lottie-palette.ts)
└─ types/              # Shared TS types
```

**The three component tiers**

| Tier | Folder | Examples | Edit policy |
|---|---|---|---|
| **Primitive** | `components/ui/` | `Button`, `Input`, `Dialog`, `Sidebar` | Treat as vendored. Extend via variants, not by editing. |
| **Composite** | `components/` | `AppSidebar`, `NoteEditor`, `AgentChat` | App-specific assemblies of primitives + state. |
| **Decorative** | `components/sketches/` | `SketchDj` | Self-contained; no app state, no side effects. |

---

## 2. shadcn primitives — the reuse contract

Every primitive in `components/ui/` follows the same pattern:

```tsx
const buttonVariants = cva("base classes", {
  variants: {
    variant: { default, destructive, outline, secondary, ghost, link },
    size:    { default, sm, lg, icon },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(...)
```

**To extend a primitive:** add a new entry to its `cva` variants object in the same file. Do **not** wrap it in another component just to change a color.

```tsx
// ✅ good — adds a "premium" variant to the existing button
variant: {
  ...,
  premium: "bg-gradient-to-r from-primary to-teal-500 text-primary-foreground shadow-md",
}

// ❌ bad — creates a parallel button that drifts over time
export function PremiumButton({ children, ...p }) {
  return <button className="bg-gradient-to-r from-..." {...p}>{children}</button>;
}
```

**Never** import a non-shadcn button library, or write a raw `<button className="px-4 py-2 bg-primary…">`. Always go through `<Button variant="…">`.

### Primitives currently in use
`accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip`

Before building anything new, search this list. If a primitive matches, use it.

---

## 3. Composites — the build rules

A composite lives in `components/` (no subfolder unless 3+ related files exist).

**Anatomy**
```tsx
// 1. Imports — primitives first, then app components, then hooks/stores, then lib
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { ease } from "@/lib/motion";

// 2. Local types
interface Props { ... }

// 3. Component — named export, no default
export function MyPanel({ ... }: Props) { ... }
```

**Rules**
- **Named exports** only. Default exports break grep-ability.
- **One component per file** unless a sub-component is purely internal and < 30 lines.
- **No business logic in JSX files** — pull it into a Zustand store (`src/stores/`) or a hook (`src/hooks/`).
- **Props** are explicit interfaces, never `any`. Optional callbacks go last.
- **Refs** via `forwardRef` only when the component renders a single DOM element that consumers might want to focus/measure.

**File-size heuristic:** if a composite passes ~250 lines, split it. `AppSidebar` is the upper bound — anything bigger needs subfolders (`components/sidebar/Header.tsx`, etc.).

---

## 4. Sketches — the decorative tier

Pattern in `src/components/sketches/`:

```tsx
export function SketchX() {
  return (
    <svg viewBox="0 0 300 200" className="w-full h-full">
      <motion.g animate={{ rotate: 360 }} transition={{ repeat: Infinity, ... }}>
        ...
      </motion.g>
    </svg>
  );
}
```

**Rules**
- Pure presentational. No props, no app state, no fetches.
- One default `viewBox`; size by parent via `w-full h-full`.
- Colors come from `currentColor` or token-mapped fills (`fill="hsl(var(--primary))"`). Never raw hex.
- Animation values inline (these are visual flourishes, not part of the motion system).
- Registered in `SketchShowcase.tsx → SKETCHES` array. Each entry = `{ id, Component, label, tagline, accent }`.

To **add** a sketch:
1. Create `src/components/sketches/SketchFoo.tsx`.
2. Import + push into the `SKETCHES` array in `SketchShowcase.tsx`.
3. Auto-cycling and dot-nav pick it up for free.

To **remove**: delete from the array (component file can stay or be deleted). The showcase guards `sketches.length <= 1` to prevent crashes when only one remains.

---

## 5. Pages

`src/pages/` holds one file per route. A page:
- Imports composites and assembles them.
- Reads/writes Zustand stores for shared state.
- Holds **no styling logic** beyond layout containers (`flex`, `grid`, `min-h-screen`).
- Sets `<title>` and meta via `react-helmet-async` (or `document.title` if helmet absent).

Routes are wired in `src/App.tsx` using `react-router-dom`.

---

## 6. State

| Kind | Where | Why |
|---|---|---|
| Server / persistent | Lovable Cloud (Supabase) | Survives reload; multi-user. |
| Cross-component UI | Zustand store in `src/stores/` | One source of truth; no prop drilling. |
| Local UI | `useState` in the component | Lifetimes scoped to mount. |
| Derived | `useMemo` | Never recompute on every render. |

**Existing stores**
- `chatStore` — agent chat messages, streaming state.
- `workspaceStore` — folders, notes, selection.

Add a new store only when 2+ components need to share state and lifting it would cross 3+ levels.

---

## 7. Routing & navigation

- Use `<NavLink>` from `src/components/NavLink.tsx` (a wrapper around react-router's NavLink that adds an `activeClassName` prop).
- Active state in the sidebar: pass `activeClassName="bg-accent text-accent-foreground font-medium"`.
- Keep the sidebar group containing the active route open (`defaultOpen={isExpanded}`).

---

## 8. Icons

- Library: `lucide-react` only. No emoji, no SVG sprites, no other icon packs.
- Default size: 16 px (`className="h-4 w-4"`). 20 px (`h-5 w-5`) for primary nav.
- Color via `text-*` token, never `stroke="..."`.

---

## 9. Forms

Use `react-hook-form` + the `Form` primitive (`components/ui/form.tsx`) + `zod` for schema:

```tsx
const schema = z.object({ title: z.string().min(1) });
const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
```

Never write naked `<form onSubmit>` for anything beyond a single search input.

---

## 10. Toasts & feedback

- **Toasts:** `useToast()` from `@/hooks/use-toast` (shadcn). For sonner-style stack, the `Toaster` is mounted in `App.tsx`.
- **Confirmations:** `AlertDialog`, never `window.confirm`.
- **Empty states:** centered icon + `text-h3` title + `text-body text-muted-foreground` description. See `SketchShowcase` for the canonical pattern.
- **Loading:** `Skeleton` for layout-preserving placeholders; `Progress` for known-duration tasks.

---

## 11. Reuse checklist (read before adding any component)

1. **Does a `components/ui` primitive exist?** → use it with the right `variant`.
2. **Is there an existing composite that almost fits?** → add a prop or extract a shared sub-component, don't fork.
3. **Is the styling reachable via tokens?** → if you need a new color, add it to `index.css` first (see `DESIGN_SYSTEM.md §9`).
4. **Is the motion already in `lib/motion.ts`?** → import it; don't redefine `ease`.
5. **Does the new file fit the tier (primitive / composite / decorative)?** → place it in the matching folder.
6. **Are props typed and named-exported?**
7. **Will state be shared?** → store. **Local only?** → `useState`.
8. **Did you remove dead code/imports the change makes obsolete?**

If any answer is "no", revisit before opening the editor.

---

## 12. Anti-patterns (auto-reject in review)

- Hard-coded colors: `bg-[#fff]`, `text-white`, inline `style={{color:'#000'}}`.
- New button/input wrappers when shadcn primitives + variants would suffice.
- Importing `framer-motion` and inlining easing arrays instead of using `lib/motion.ts`.
- `useEffect` polling without a cleanup / readiness guard (the `SketchShowcase` `length <= 1` bug came from this).
- Components that read from `localStorage` outside of a hook or store.
- Default exports.
- Files > 300 lines.
- Mixing data fetching and presentation in the same file.
