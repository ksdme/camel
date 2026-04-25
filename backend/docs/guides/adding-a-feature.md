# Adding a New API Feature

A step-by-step guide for adding new backend functionality. Follow each step in order — each layer depends on the one below it.

---

## Step 1 — Do you need a new domain type?

Before writing any code, ask: does this feature introduce a new entity or a new cross-layer shape?

**Add to `main/types/` if:**
- The repo returns it **and** the service exposes it in a response.
- The same shape is used in more than one service file.
- It represents a first-class concept (e.g. `NoteItem`, `ShareItem`).

**Keep it local if:**
- It is a request body interface — define it at the top of the service file.
- It is a raw DB row shape — define it inside the repo file, unexported.
- It is only used in one place.

```typescript
// main/types/widgets.ts  ← new file for a new entity
export interface WidgetItem {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
}
```

Then re-export it from `main/types/index.ts`:

```typescript
export type { WidgetItem } from "./widgets";
```

---

## Step 2 — Add repo methods

All database access lives in `main/repos/`. If the entity is new, create a new repo file. If it already exists, add methods to it.

### New entity — create `main/repos/widget.repo.ts`

Follow the standard pattern: row type → interface → implementation → factory → lazy getter.

```typescript
import { Prisma, prisma, type DbClient } from "@/lib/db";
import type { WidgetItem } from "@/main/types";

// 1. Raw row type — internal only, never exported
interface WidgetRow {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
}

// 2. Input/output shapes for the interface
export interface CreateWidgetData {
  id: string;
  name: string;
}

// 3. Public interface — this is what the rest of the app depends on
export interface IWidgetRepo {
  list(userId: string): Promise<WidgetItem[]>;
  findById(userId: string, id: string): Promise<WidgetItem | null>;
  create(userId: string, data: CreateWidgetData): Promise<WidgetItem>;
  delete(userId: string, id: string): Promise<void>;
}

// 4. Implementation
class WidgetRepoImpl implements IWidgetRepo {
  constructor(private readonly db: DbClient) {}

  async list(userId: string): Promise<WidgetItem[]> {
    const rows = await this.db.$queryRaw<WidgetRow[]>(
      Prisma.sql`SELECT "id", "userId", "name", "createdAt" FROM "widgets" WHERE "userId" = ${userId} ORDER BY "createdAt" DESC`,
    );
    return rows;
  }

  async findById(userId: string, id: string): Promise<WidgetItem | null> {
    const rows = await this.db.$queryRaw<WidgetRow[]>(
      Prisma.sql`SELECT "id", "userId", "name", "createdAt" FROM "widgets" WHERE "id" = ${id} AND "userId" = ${userId} LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  async create(userId: string, data: CreateWidgetData): Promise<WidgetItem> {
    await this.db.$executeRaw(
      Prisma.sql`INSERT INTO "widgets" ("id", "userId", "name") VALUES (${data.id}, ${userId}, ${data.name})`,
    );
    return (await this.findById(userId, data.id))!;
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.db.$executeRaw(
      Prisma.sql`DELETE FROM "widgets" WHERE "id" = ${id} AND "userId" = ${userId}`,
    );
  }
}

// 5. Factory — used in tests and transactions
export function createWidgetRepo(db: DbClient): IWidgetRepo {
  return new WidgetRepoImpl(db);
}

// 6. Lazy getter — used in services
let _widgetRepo: IWidgetRepo | undefined;
export function getWidgetRepo(): IWidgetRepo {
  return (_widgetRepo ??= createWidgetRepo(prisma));
}
```

Then add to `main/repos/index.ts`:

```typescript
export { getWidgetRepo, createWidgetRepo } from "./widget.repo";
export type { IWidgetRepo, CreateWidgetData } from "./widget.repo";
```

### Existing entity — add a method

Open the existing repo file, add the method signature to the interface first, then implement it in the class.

---

## Step 3 — Write the service (API endpoint)

Services live in `main/services/`. They own HTTP concerns: parsing request input, calling repos, and shaping responses.

```typescript
// main/services/widgets.ts
import { randomUUID } from "node:crypto";
import { APIError, api, type Query } from "encore.dev/api";
import { getWidgetRepo } from "@/main/repos";
import type { WidgetItem } from "@/main/types";
import { getAuthData } from "~encore/auth";

// Request/response interfaces — local to this file, not in types/
interface ListWidgetsResponse {
  widgets: WidgetItem[];
}

interface CreateWidgetRequest {
  name: string;
}

// Validation — local helper, only if not worth extracting to utils/validation.ts
function normalizeName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw APIError.invalidArgument("name is required");
  }
  return value.trim().slice(0, 100);
}

export const listWidgets = api(
  { expose: true, auth: true, method: "GET", path: "/widgets" },
  async (): Promise<ListWidgetsResponse> => {
    const { userID } = getAuthData()!;
    return { widgets: await getWidgetRepo().list(userID) };
  },
);

export const createWidget = api(
  { expose: true, auth: true, method: "POST", path: "/widgets" },
  async (req: CreateWidgetRequest): Promise<WidgetItem> => {
    const { userID } = getAuthData()!;
    return getWidgetRepo().create(userID, {
      id: randomUUID(),
      name: normalizeName(req.name),
    });
  },
);

export const deleteWidget = api(
  { expose: true, auth: true, method: "DELETE", path: "/widgets/:id" },
  async ({ id }: { id: string }): Promise<void> => {
    const { userID } = getAuthData()!;
    const widget = await getWidgetRepo().findById(userID, id);
    if (!widget) throw APIError.notFound("widget not found");
    await getWidgetRepo().delete(userID, id);
  },
);
```

---

## Step 4 — Cross-cutting concerns

### Authentication

Every endpoint that needs authentication gets `auth: true`. Retrieve the caller's identity with:

```typescript
import { getAuthData } from "~encore/auth";
const { userID } = getAuthData()!;
```

Never trust a user-supplied ID for ownership checks. Always scope queries to `userID` from auth data.

### Pagination

Use `normalizePagination` from `utils/pagination.ts` for any list endpoint that could return many rows:

```typescript
import { normalizePagination } from "@/main/utils/pagination";

const { page, pageSize, offset } = normalizePagination(req.page, req.pageSize, {
  defaultPageSize: 20,
  maxPageSize: 100,
});
```

### Input validation

- Encore Already Provides Input validation whenever we try to create an API But sometimes it may feel limited then we can use some validation functions to make it work like below
- Simple checks (required string, ID format) — use `normalizeRequiredId` / `normalizeOptionalId` from `utils/validation.ts`.
- Repeated patterns unique to a domain (e.g. `normalizeName`, `normalizeTitle`) — define a private function at the top of the service file.
- If the same normaliser is needed in more than one service, move it to `utils/validation.ts`.

### Error handling

Throw `APIError` directly — do not catch and re-wrap unless you need to translate a low-level error:

```typescript
import { APIError } from "encore.dev/api";

throw APIError.notFound("widget not found");
throw APIError.invalidArgument("name is required");
throw APIError.permissionDenied("not your widget");
throw APIError.alreadyExists("widget already exists");
```

### Transactions

When an operation must span multiple repos atomically, pass a transaction client to the factories:

```typescript
import { prisma } from "@/lib/db";
import { createWidgetRepo, createNoteRepo } from "@/main/repos";

await prisma.$transaction(async (tx) => {
  const widgets = createWidgetRepo(tx);
  const notes = createNoteRepo(tx);
  await widgets.delete(userID, widgetId);
  await notes.softDelete(userID, noteId);
});
```

---

## Step 5 — Do you need a util?

Add to `main/utils/` only if the logic is **pure** (no DB, no Encore imports) and **reusable across more than one file**.

| It should be a util if... | Example |
|---------------------------|---------|
| Pure transformation, no side effects | `stableJson`, `arrayChunks` |
| Auth primitive shared by multiple auth flows | `signAccessToken`, `hashPassword` |
| Cross-request concern extracted from middleware | `extractIpAddress` |

If it needs the DB, it belongs in a repo method, not utils.

---

## Quick checklist

```
[ ] New domain type added to main/types/ (if cross-layer)
[ ] Repo interface updated with new method signatures
[ ] Repo implementation written using $queryRaw / $executeRaw
[ ] Lazy getter and factory exported from repos/index.ts
[ ] Service file created/updated in main/services/
[ ] Auth guard (auth: true + getAuthData()) on protected endpoints
[ ] Ownership scoped to userID from auth — never trust client-supplied IDs
[ ] Input validated and sanitised before reaching the repo
[ ] APIError thrown for user-facing error cases (not generic Error)
[ ] Pagination applied to list endpoints that could grow unbounded
```
