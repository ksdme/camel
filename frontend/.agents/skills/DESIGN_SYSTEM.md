# Design System — Camel

A scannable handbook of the visual language used across the app. Every color, font, and motion value lives in `src/index.css`, `tailwind.config.ts`, and `src/lib/motion.ts`. **Never** hand-write hex codes or one-off `text-white` / `bg-black` classes in components.

---

## 1. Token architecture

Three layers, in order of abstraction:

| Layer | Where | Example | Use it for |
|---|---|---|---|
| **Primitive** | `:root` in `src/index.css` | `--sand-500: 35.3 20.3% 50.8%` | Source of truth. Never reference directly in JSX. |
| **Semantic** | `:root` in `src/index.css` | `--background`, `--foreground`, `--primary`, `--accent` | What components consume. Maps to a primitive. |
| **Utility** | `tailwind.config.ts` → `colors` | `bg-background`, `text-primary`, `border-border` | What you actually type in JSX. |

> **Rule:** Components reference utilities → utilities reference semantics → semantics reference primitives. Changing a brand color = edit one primitive.

All colors are **HSL** (no hex, no rgb). Required by `hsl(var(--token))` consumption.

---

## 2. Color palette

### Sand (neutrals)
9-step ramp from cream (`sand-50`) to near-black (`sand-900`). Drives backgrounds, surfaces, borders, body text.

```
sand-50   → app background
sand-100  → secondary surfaces, sidebar bg
sand-200  → borders, inputs, dividers
sand-500  → muted text
sand-900  → foreground / body text
```

### Teal (accent / brand)
5-step ramp. The only chromatic family. Used sparingly: primary actions, focus rings, active nav.

```
teal-100  → accent surfaces (hover, active row)
teal-600  → primary buttons, ring
teal-700  → accent foreground (text on teal-100)
```

### Status
`--success` (green), `--warning` (amber), `--info` (blue), `--destructive` (red). Use for system feedback only — not decoration.

### Semantic mapping (the API your components use)

| Token | Primitive | Where it shows up |
|---|---|---|
| `background` | sand-50 | App canvas |
| `foreground` | sand-900 | All body copy |
| `card` | white | Elevated surfaces |
| `primary` | teal-600 | CTAs, brand accents |
| `secondary` | sand-100 | Secondary buttons, soft fills |
| `muted` | sand-200 | Disabled, skeletons, subtle bg |
| `muted-foreground` | sand-500 | Secondary text, captions |
| `accent` | teal-100 | Hover/active row backgrounds |
| `accent-foreground` | teal-700 | Text on `accent` surfaces |
| `border` / `input` | sand-200 | All strokes |
| `ring` | teal-600 | Focus outline |
| `destructive` | red | Delete actions only |
| `sidebar-*` | sand/teal | Mirrors above, scoped to nav |

**Forbidden:** `bg-white`, `text-black`, `bg-gray-200`, `text-slate-500`, custom hex in `style=`. Always use the semantic class.

---

## 3. Typography

Defined in `tailwind.config.ts → fontSize` and applied via `text-{size}` classes.

**Fonts**
- Primary UI: `Plus Jakarta Sans` (loaded in `index.html`, set in `body` rule)
- Accent display (when present): `Fraunces`
- Never serif body. Never Inter / Poppins.

**Type scale** (use these, not raw `text-sm` / `text-xl`)

| Class | Size / line-height | Weight | Use |
|---|---|---|---|
| `text-display` | 40 / 48 | 600 | Hero only |
| `text-h1` | 32 / 40 | 600 | Page title |
| `text-h2` | 24 / 32 | 600 | Section header |
| `text-h3` | 20 / 28 | 600 | Card / dialog title |
| `text-body-lg` | 16 / 24 | 500 | Lead paragraph |
| `text-body` | 14 / 20 | 500 | Default body |
| `text-meta` | 12 / 16 | 500 | Captions, timestamps |
| `text-label-xs` | 11 / 14 | 600 | Uppercase labels |

Pair size with semantic color: `text-h2 text-foreground`, `text-meta text-muted-foreground`.

---

## 4. Spacing & layout

8-point system. Tailwind's default scale already aligns: `2 / 4 / 6 / 8 / 10 / 12 / 16` map to 8 / 16 / 24 / 32 / 40 / 48 / 64 px.

- Component inner padding: `p-4` (16) or `p-6` (24)
- Stack rhythm: `space-y-3` between dense rows, `space-y-6` between sections
- Page gutters: `px-6 sm:px-10`
- Container max: `1400px` (`tailwind.config.ts → container.screens.2xl`)

---

## 5. Radius

Defined in `tailwind.config.ts → borderRadius` and `--radius` (10px).

| Class | Px | Use |
|---|---|---|
| `rounded-sm` | 6 | Inline pills, small chips |
| `rounded-md` | 10 | Buttons, inputs (default) |
| `rounded-lg` | 14 | Cards, popovers |
| `rounded-xl` | 20 | Hero cards, sketches, dialogs |
| `rounded-full` | — | Avatars, dots |

Avoid arbitrary values like `rounded-[7px]`.

---

## 6. Elevation & strokes

- **Borders:** always `border border-border`. One pixel, sand-200. No double borders.
- **Shadows:** `shadow-sm` for raised cards/popovers. `shadow-md` for transient overlays (toasts, dropdowns). Avoid heavy `shadow-2xl` — the design is flat-ish.
- **Glass / gradients:** use sparingly via `bg-gradient-to-br from-... to-...` with low opacity (`/10`, `/20`). See `SketchShowcase` accent overlay.

---

## 7. Motion

All motion config lives in `src/lib/motion.ts`. **Import from there**, do not inline easing arrays.

```ts
import { ease, fadeIn, spring, staggerContainer, staggerItem } from "@/lib/motion";
```

| Export | When to use |
|---|---|
| `ease` | Default cubic-bezier `[0.22, 1, 0.36, 1]` for all standard tweens |
| `easeOut` | Exits and dismissals |
| `spring` | Interactive drags, popovers opening |
| `springGentle` | Layout shifts, sidebars |
| `fadeIn` (0.4s) | Section reveals |
| `fadeInFast` (0.25s) | Hover states, swap-ins |
| `slideUp` (0.35s) | Panels rising |
| `staggerContainer` + `staggerItem` | Lists, menu items |
| `editorEntrance` | Editor / large panel mount |
| `chatPanelVariants` | Chat / floating panels |
| `messageBubble` | Chat messages |

**Rules**
- Use `AnimatePresence mode="wait"` when swapping a single keyed element (see `SketchShowcase`).
- Respect `prefers-reduced-motion` for any animation > 300 ms or with translation > 16 px.
- Hover/focus transitions are handled globally in `index.css` (`a, button, input… { transition-all 200ms }`). Don't re-add `transition` to every element.

---

## 8. Accessibility

- Focus ring: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (already on shadcn primitives).
- Contrast: every `*-foreground` token is paired to pass WCAG AA on its base.
- Hit targets: minimum 32 px (`h-8`); icon-only buttons use `h-10 w-10` (`size="icon"`).
- Sidebar: must remain operable when collapsed — keep `SidebarTrigger` outside the sidebar in the header.

---

## 9. Editing the system

To add a new color, font, or radius:

1. Add the **primitive** to `:root` in `src/index.css` as raw HSL channels.
2. Map it to a **semantic** token in the same `:root` block.
3. Expose it in `tailwind.config.ts → theme.extend.colors` with `hsl(var(--token))`.
4. Use the resulting utility class (`bg-foo`) in components.

Never skip steps 1–3 to short-circuit a single component — that's how design systems rot.
