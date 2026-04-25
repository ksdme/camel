import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadForNotes = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));
const mockPrismaTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  Prisma: { sql: vi.fn(), empty: null, join: vi.fn() },
  prisma: { $transaction: mockPrismaTransaction },
}));

vi.mock("@/main/repos/tag.repo", () => ({
  createTagRepo: vi.fn().mockReturnValue({ loadForNotes: mockLoadForNotes }),
}));

import { createNoteRepo, getNoteRepo } from "@/main/repos/note.repo";

const mockDb = {
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
} as any;

const repo = createNoteRepo(mockDb);

const now = new Date();
const noteRow = {
  id: "n1",
  userId: "u1",
  folderId: null,
  title: "My Note",
  content: "{}",
  plainText: "text",
  isArchived: 0,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
};
const noteItem = { ...noteRow, isArchived: false, tags: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadForNotes.mockResolvedValue(new Map([["n1", []]]));
});

describe("NoteRepo.list", () => {
  it("returns notes for the user", async () => {
    mockDb.$queryRaw.mockResolvedValue([noteRow]);
    const result = await repo.list("u1", {});
    expect(result).toEqual([noteItem]);
  });

  it("handles empty result", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    mockLoadForNotes.mockResolvedValue(new Map());
    expect(await repo.list("u1", {})).toEqual([]);
  });
});

describe("NoteRepo.listRecent", () => {
  it("returns recent non-archived notes", async () => {
    mockDb.$queryRaw.mockResolvedValue([noteRow]);
    const result = await repo.listRecent("u1", 10);
    expect(result).toEqual([noteItem]);
  });
});

describe("NoteRepo.findRowById", () => {
  it("returns the raw row when found", async () => {
    mockDb.$queryRaw.mockResolvedValue([noteRow]);
    expect(await repo.findRowById("u1", "n1")).toEqual(noteRow);
  });

  it("returns null when not found", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.findRowById("u1", "missing")).toBeNull();
  });
});

describe("NoteRepo.findById", () => {
  it("returns the note item when found", async () => {
    mockDb.$queryRaw.mockResolvedValue([noteRow]);
    expect(await repo.findById("u1", "n1")).toEqual(noteItem);
  });

  it("returns null when not found", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.findById("u1", "missing")).toBeNull();
  });
});

describe("NoteRepo.isIdAvailable", () => {
  it("returns true when id is free", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.isIdAvailable("new-id")).toBe(true);
  });

  it("returns false when id exists", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: "n1" }]);
    expect(await repo.isIdAvailable("n1")).toBe(false);
  });
});

describe("NoteRepo.create", () => {
  it("inserts and returns the new note", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    mockDb.$queryRaw.mockResolvedValue([noteRow]);
    const data = {
      id: "n1",
      folderId: null,
      title: "My Note",
      content: "{}",
      plainText: "text",
      isArchived: false,
    };
    expect(await repo.create("u1", data)).toEqual(noteItem);
  });
});

describe("NoteRepo.update", () => {
  it("updates and returns the note", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    mockDb.$queryRaw.mockResolvedValue([noteRow]);
    const data = {
      folderId: null,
      title: "Updated",
      content: "{}",
      plainText: "text",
      isArchived: false,
    };
    expect(await repo.update("u1", "n1", data)).toEqual(noteItem);
  });
});

describe("NoteRepo.softDelete", () => {
  it("sets deletedAt on the note", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    await repo.softDelete("u1", "n1");
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });
});

describe("NoteRepo.replaceTags", () => {
  it("replaces note tags in a transaction and returns updated note", async () => {
    const mockTx = { $executeRaw: vi.fn().mockResolvedValue(1) };
    mockPrismaTransaction.mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
    mockDb.$queryRaw.mockResolvedValue([noteRow]);

    const result = await repo.replaceTags("u1", "n1", ["t1", "t2"]);
    expect(result).toEqual(noteItem);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(3); // 1 delete + 2 inserts
  });

  it("handles empty tagIds (only delete, no inserts)", async () => {
    const mockTx = { $executeRaw: vi.fn().mockResolvedValue(1) };
    mockPrismaTransaction.mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
    mockDb.$queryRaw.mockResolvedValue([noteRow]);

    await repo.replaceTags("u1", "n1", []);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1); // only delete
  });
});

describe("NoteRepo.updateContent", () => {
  it("executes the content update query", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    await repo.updateContent("n1", "{new}", "new text");
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });
});

describe("getNoteRepo", () => {
  it("returns a singleton repo instance", () => {
    const r = getNoteRepo();
    expect(r).toBeDefined();
    expect(getNoteRepo()).toBe(r);
  });
});
