# Dependency Injection

## The definition

It's just a fancy way of saying "provide dependencies to your code instead of making your code look for the dependencies".

## In our code

We employ the following pattern:

### 1. Interfaces

Every dependency has a corresponding interface. This makes the contract explicit and allows swapping implementations (e.g. in tests).

```typescript
export interface INoteRepo {
  list(userId: string, filter: ListNotesFilter): Promise<NoteItem[]>;
  findById(userId: string, id: string): Promise<NoteItem | null>;
  create(userId: string, data: CreateNoteData): Promise<NoteItem>;
  update(userId: string, id: string, data: UpdateNoteData): Promise<NoteItem>;
  softDelete(userId: string, id: string): Promise<void>;
  // (...)
}
```

### 2. Classes with constructor injection

Implementations take their own dependencies as constructor parameters. The database client (`DbClient`) is the primary injectable dependency — it is satisfied by both a real `PrismaClient` and a Prisma transaction client, which means repos compose correctly inside transactions.

```typescript
class NoteRepoImpl implements INoteRepo {
  private readonly tags: ITagRepo;

  constructor(private readonly db: DbClient) {
    // Sub-dependencies that share the same DB context are created here
    this.tags = createTagRepo(db);
  }

  async list(userId: string, filter: ListNotesFilter): Promise<NoteItem[]> {
    // uses this.db — not the global prisma singleton
  }
}
```

### 3. Factory functions

Every repo exposes a factory function. This is the canonical way to create an instance with a specific DB client — used in tests, and anywhere a specific transaction context is needed.

```typescript
export function createNoteRepo(db: DbClient): INoteRepo {
  return new NoteRepoImpl(db);
}
```

### 4. Lazy getters for the production singleton

Each repo also exposes a `getX()` function that lazily creates and caches one instance wired to the global Prisma client. The instance is created on first call, not at module load time. The exported type is the interface, never the class.

```typescript
let _noteRepo: INoteRepo | undefined;
export function getNoteRepo(): INoteRepo {
  return (_noteRepo ??= createNoteRepo(prisma));
}
```

The lazy pattern has two benefits over a plain `export const`:
- **Deferred initialisation** — the DB client is not touched until a request actually arrives.
- **Test overrideability** — in tests you can shadow the module-level variable before the first call, or use `vi.mock` to replace the export entirely, without importing the real Prisma client.

### 5. Where `getX()` is called

`getX()` functions are called **only** in:

1. **API endpoint handlers** (`main/services/**`) — the top of the request call stack.
2. **Middleware** (`main/middleware/`) — auth handler, request enrichment.
3. **Utility wrappers** that are impractical to thread as explicit parameters everywhere (e.g. `main/utils/auth/audit.ts`).

Everywhere else (business logic, sub-routines, other repos), dependencies are passed explicitly as parameters or through the constructor. Application code never calls `getNoteRepo()` — it receives an `INoteRepo` it was given.

## The `DbClient` type

```typescript
// lib/db.ts
export type DbClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
```

`$transaction` is deliberately excluded. This means both `PrismaClient` and a Prisma transaction callback argument satisfy `DbClient`, so a repo instance created inside a transaction works identically to one using the global client. When a cross-repo transaction is required, callers pass a transaction client directly to the factory functions:

```typescript
await prisma.$transaction(async (tx) => {
  const notes = createNoteRepo(tx);
  const tags  = createTagRepo(tx);
  // both repos operate on the same transaction
});
```

## Testing

Because constructors accept `DbClient` and all public methods are typed against interfaces, test code can pass either a real Prisma client (integration tests) or a mock object (unit tests) with no changes to the implementation:

```typescript
// unit test — mock the repo interface entirely
vi.mock("@/main/repos", () => ({
  getNoteRepo: () => ({ findById: vi.fn(), create: vi.fn() }),
}));

// integration test — pass a real transaction client for isolation
const repo = createNoteRepo(prisma);
```

## Links

- [The Clean Code Talks - Don't Look For Things! by Misko Hevery](https://www.youtube.com/watch?v=RlfLCWKxHJ0)
