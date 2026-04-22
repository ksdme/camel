# Camel — Frontend

Camel is a workspace system built around agents. The editor exists, but agents are the primary way users interact with their notes and knowledge. Fast, keyboard-first, realtime.

This project uses [Vite+](https://viteplus.dev), a unified toolchain that replaces the usual combination of Vite + ESLint + Prettier + Vitest with a single `vp` CLI. If you have not installed it yet, see the [installation guide](https://viteplus.dev/guide/).

<br/>

### Getting Started

1. Clone the repo and navigate to the frontend

```
git clone <repo-url>
cd camel/frontend
```

2. Install dependencies

```
pnpm install
```

3. Add environment variables

Copy the example env file and fill in the values (if there are any)

```
cp .env.example .env
```

4. Start the dev server

```
vp dev
```

If everything is set up correctly you should see:

```
  VITE+ v0.1.19

  ➜  Local:   http://localhost:5173/
```

<br/>

### Commands

| Command | Description |
|---|---|
| `vp dev` | Start the dev server |
| `vp build` | Type-check and build for production |
| `vp preview` | Preview the production build locally |
| `vp check` | Run lint + format + type-check in one pass |
| `vp lint` | Lint only (oxlint) |
| `vp fmt` | Format only (oxfmt) |
| `vp test` | Run unit tests |
| `vp test --watch` | Run tests in watch mode |

Run `vp check` before pushing. It catches lint errors, formatting issues, and type errors together.

<br/>

### What is Vite+?

Vite+ is not a framework — it is a toolchain. It wraps several tools under the `vp` CLI so you do not need to configure or invoke them separately.

| Vite+ handles | Instead of |
|---|---|
| `oxlint` | ESLint |
| `oxfmt` | Prettier |
| `vitest` | Jest |
| `rolldown` | esbuild / Rollup |

Lint and format config lives in `vite.config.ts` under the `lint` and `fmt` keys, not in separate `.eslintrc` or `.prettierrc` files.

<br/>

### Stack

| Layer | Library |
|---|---|
| Framework | React 19 + TypeScript 6 |
| Toolchain | Vite+ (`vp`) |
| Routing | React Router v7 |
| Server state | TanStack Query v5 |
| Client state | Zustand v5 |
| Styling | Tailwind CSS v4 |
| Icons | Lucide React |
| Command palette | cmdk |
| Validation | Zod v4 |
| Class utilities | clsx + tailwind-merge |

<br/>

### Project Structure

```
frontend/
  src/
    main.tsx          # entry — wires QueryClient + RouterProvider
    router.tsx        # all route definitions live here
    App.tsx           # root component
    styles/
      globals.css     # Tailwind import + CSS tokens
  vite.config.ts      # Vite + React plugin + Tailwind + lint config
  tsconfig.json       # TypeScript config
```

<br/>

### Adding a new page

1. Create the component under `src/pages/`
2. Add the route to `src/router.tsx`

<br/>

### Notes

- Do not add an `.eslintrc` or `.prettierrc` — Vite+ handles both via oxlint and oxfmt.
- Tailwind v4 uses `@import "tailwindcss"` in CSS, not a `tailwind.config.js` file.
- `pnpm` is the package manager. Do not use `npm` or `yarn` in this project.
