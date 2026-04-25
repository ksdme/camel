# Project Structure

## Overview

```
backend/
├── lib/              # Shared infrastructure (DB client, etc.)
├── main/             # The single Encore service
│   ├── encore.service.ts
│   ├── middleware/   # Auth handler and gateway
│   ├── repos/        # Data access layer (one file per entity)
│   ├── services/     # API endpoints (HTTP handlers)
│   │   ├── auth/
│   │   └── settings/
│   ├── types/        # Shared domain types
│   └── utils/        # Pure helpers (no Encore/DB dependencies)
│       ├── auth/     # JWT, password, session, audit helpers
│       └── ...
```

## Layers

Each request flows through:

```
HTTP request
  → middleware/auth.ts        (authentication, session validation)
  → services/**               (parse input, call repos, return response)
  → repos/**                  (all DB access)
  → lib/db.ts (Prisma)
```

No layer skips one below it. Services never import from `lib/db` directly; they go through repos. Repos never import from other services.

---

## `types/` — when to put something here

`types/` holds **shared domain types** — types that appear in the public contract between layers (repo return values, API response shapes, or both).

**Put a type in `types/` when:**
- It is returned by a repo method AND consumed by a service (or vice versa).
- It is part of an API response shape used in more than one service file.
- It represents a core domain concept (Note, Folder, Tag, Share, Session) that the rest of the codebase reasons about.

**Keep a type local to its file when:**
- It is only used inside one repo (e.g. `NoteRow`, `ShareRow` — raw DB row shapes before transformation).
- It is only used inside one service (e.g. a request body interface).
- It is an internal implementation detail (a helper interface, a partial shape used during construction).

**Current shared types (`main/types/`):**

| Type | Where it comes from | Where it goes |
|------|---------------------|---------------|
| `NoteItem` | `noteRepo` return value | `services/notes.ts` response |
| `FolderItem` | `folderRepo` return value | `services/folders.ts` response |
| `TagItem` | `tagRepo` return value | `services/tags.ts` response |
| `ShareItem` | `shareRepo` return value | `services/shares.ts` response |
| `UserProfile` | `userRepo` return value | `services/auth/me.ts`, profile routes |
| `SessionItem` | `sessionRepo` return value | `services/settings/sessions.ts` |
| `AuthEventItem` | `eventLogRepo` return value | `services/settings/event_logs.ts` |

---

## Database types

There are three categories of types that touch the database:

### 1. Prisma-generated model types (`@prisma/client`)

Prisma generates full TypeScript types from `schema.prisma`. These are available via `import { User, RefreshToken, ... } from "@prisma/client"`. Use them when calling Prisma's fluent API (`prisma.user.findUnique(...)`) or when you need a complete model shape.

```typescript
import type { User } from "@prisma/client";
```

These types reflect every column in the table. Avoid leaking them directly into service or route code — wrap them in a domain type first (see `UserProfile`, `PublicUser`).

### 2. Raw row types (defined in each repo file)

When using `$queryRaw`, Prisma returns `unknown[]` unless you annotate the call. Each repo defines its own row type for this:

```typescript
// Only used inside note.repo.ts — not exported to types/
interface NoteRow {
  id: string;
  userId: string;
  folderId: string | null;
  title: string;
  content: string;
  isArchived: boolean | number; // SQLite returns 0/1, not true/false
  // (...)
}

const rows = await this.db.$queryRaw<NoteRow[]>(Prisma.sql`SELECT ...`);
```

These are **internal to the repo file**. They handle quirks like SQLite's `0`/`1` for booleans that the domain type (`NoteItem`) already normalises away.

### 3. Domain types (`main/types/`)

The clean, normalised shape that the rest of the application works with. Repo methods return these; services consume them. They have no DB-specific quirks (booleans are `boolean`, not `boolean | number`).

```typescript
// main/types/notes.ts
export interface NoteItem {
  id: string;
  userId: string;
  isArchived: boolean;  // already normalised from DB 0/1
  tags: TagItem[];      // already joined in
  // (...)
}
```

### Summary

| Category | Location | Used by |
|----------|----------|---------|
| Prisma model types | `@prisma/client` (generated) | Repo internals using fluent API |
| Raw row types | Each `*.repo.ts` file (not exported) | Only the repo that defines them |
| Domain types | `main/types/` | Repos (return values) + services (responses) |

---

## `utils/` — what goes here

Pure helper functions with no Encore framework or DB dependencies. They can be imported from anywhere without creating circular dependencies.

| Module | Purpose |
|--------|---------|
| `utils/auth/tokens.ts` | Issue and verify JWTs (access tokens) |
| `utils/auth/refresh.ts` | Issue and verify refresh token JWTs |
| `utils/auth/password.ts` | Hash and verify bcrypt passwords |
| `utils/auth/cache.ts` | In-memory blocklist for revoked access tokens |
| `utils/auth/revocation.ts` | Interpret blocklist values |
| `utils/auth/audit.ts` | `safeRecordAuthEvent` — fire-and-forget auth event logging |
| `utils/cookies.ts` | Read/write HTTP cookies, send JSON responses |
| `utils/pagination.ts` | Offset pagination helpers |
| `utils/request_meta.ts` | Extract IP and user-agent from request headers |
| `utils/validation.ts` | ID normalisation, input sanitisation |

If a helper needs the DB, it belongs in `repos/`, not `utils/`.
