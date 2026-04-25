import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  Prisma: { sql: vi.fn(), empty: null, join: vi.fn() },
  prisma: {},
}));

import { createTagRepo, getTagRepo } from "@/main/repos/tag.repo";

const mockDb = {
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
} as any;

const repo = createTagRepo(mockDb);

const now = new Date();
const tag = {
  id: "t1",
  userId: "u1",
  name: "work",
  color: "#ff0000",
  createdAt: now,
  updatedAt: now,
};

beforeEach(() => vi.clearAllMocks());

describe("TagRepo.list", () => {
  it("returns all tags for the user", async () => {
    mockDb.$queryRaw.mockResolvedValue([tag]);
    expect(await repo.list("u1")).toEqual([tag]);
  });
});

describe("TagRepo.findById", () => {
  it("returns the tag when found", async () => {
    mockDb.$queryRaw.mockResolvedValue([tag]);
    expect(await repo.findById("u1", "t1")).toEqual(tag);
  });

  it("returns null when not found", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.findById("u1", "missing")).toBeNull();
  });
});

describe("TagRepo.isIdAvailable", () => {
  it("returns true when no tag has that id", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.isIdAvailable("new-id")).toBe(true);
  });

  it("returns false when id is taken", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: "t1" }]);
    expect(await repo.isIdAvailable("t1")).toBe(false);
  });
});

describe("TagRepo.isNameAvailable", () => {
  it("returns true when name is free", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.isNameAvailable("u1", "unique")).toBe(true);
  });

  it("returns false when name is taken", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: "t1" }]);
    expect(await repo.isNameAvailable("u1", "work")).toBe(false);
  });

  it("accepts an excludeId to skip current tag", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.isNameAvailable("u1", "work", "t1")).toBe(true);
  });
});

describe("TagRepo.validateOwnership", () => {
  it("returns true immediately for empty tagIds array", async () => {
    expect(await repo.validateOwnership("u1", [])).toBe(true);
    expect(mockDb.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns true when all tags belong to the user", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);
    expect(await repo.validateOwnership("u1", ["t1", "t2"])).toBe(true);
  });

  it("returns false when some tags are missing", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: "t1" }]);
    expect(await repo.validateOwnership("u1", ["t1", "t2"])).toBe(false);
  });
});

describe("TagRepo.loadForNotes", () => {
  it("returns an empty map immediately for empty noteIds", async () => {
    const result = await repo.loadForNotes("u1", []);
    expect(result.size).toBe(0);
    expect(mockDb.$queryRaw).not.toHaveBeenCalled();
  });

  it("groups tags by noteId", async () => {
    mockDb.$queryRaw.mockResolvedValue([
      {
        noteId: "n1",
        id: "t1",
        userId: "u1",
        name: "work",
        color: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const result = await repo.loadForNotes("u1", ["n1", "n2"]);
    expect(result.get("n1")).toHaveLength(1);
    expect(result.get("n2")).toHaveLength(0);
  });
});

describe("TagRepo.create", () => {
  it("inserts and returns the new tag", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    mockDb.$queryRaw.mockResolvedValue([tag]);
    expect(await repo.create("u1", "t1", "work", "#ff0000")).toEqual(tag);
  });
});

describe("TagRepo.update", () => {
  it("executes the update query", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    await repo.update("u1", "t1", "updated", null);
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });
});

describe("TagRepo.delete", () => {
  it("executes the delete query", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    await repo.delete("u1", "t1");
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });
});

describe("getTagRepo", () => {
  it("returns a singleton repo instance", () => {
    const r = getTagRepo();
    expect(r).toBeDefined();
    expect(getTagRepo()).toBe(r);
  });
});
