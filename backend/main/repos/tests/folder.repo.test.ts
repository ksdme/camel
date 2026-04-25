import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  Prisma: { sql: vi.fn(), empty: null, join: vi.fn() },
  prisma: {},
}));

vi.mock("encore.dev/api", () => ({
  APIError: {
    invalidArgument: (msg: string) => new Error(msg),
    notFound: (msg: string) => new Error(msg),
  },
}));

import { createFolderRepo, getFolderRepo } from "@/main/repos/folder.repo";

const mockDb = {
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
} as any;

const repo = createFolderRepo(mockDb);

const now = new Date();
const folder = {
  id: "f1",
  userId: "u1",
  name: "Notes",
  parentId: null,
  createdAt: now,
  updatedAt: now,
};

beforeEach(() => vi.clearAllMocks());

describe("FolderRepo.list", () => {
  it("returns all folders for the user", async () => {
    mockDb.$queryRaw.mockResolvedValue([folder]);
    expect(await repo.list("u1")).toEqual([folder]);
  });
});

describe("FolderRepo.findById", () => {
  it("returns the folder when found", async () => {
    mockDb.$queryRaw.mockResolvedValue([folder]);
    expect(await repo.findById("u1", "f1")).toEqual(folder);
  });

  it("returns null when not found", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.findById("u1", "missing")).toBeNull();
  });
});

describe("FolderRepo.isIdAvailable", () => {
  it("returns true when id is free", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.isIdAvailable("new-id")).toBe(true);
  });

  it("returns false when id exists", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: "f1" }]);
    expect(await repo.isIdAvailable("f1")).toBe(false);
  });
});

describe("FolderRepo.isNameAvailable", () => {
  it("returns true when name is free in that parent", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.isNameAvailable("u1", null, "New Folder")).toBe(true);
  });

  it("returns false when name is taken", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: "f1" }]);
    expect(await repo.isNameAvailable("u1", null, "Notes")).toBe(false);
  });

  it("accepts excludeId for rename checks", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.isNameAvailable("u1", null, "Notes", "f1")).toBe(true);
  });
});

describe("FolderRepo.validateParent", () => {
  it("returns true immediately for null parentId (root)", async () => {
    expect(await repo.validateParent("u1", null)).toBe(true);
    expect(mockDb.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns true when the parent folder exists", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: "parent" }]);
    expect(await repo.validateParent("u1", "parent")).toBe(true);
  });

  it("returns false when the parent folder does not exist", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.validateParent("u1", "missing")).toBe(false);
  });
});

describe("FolderRepo.validateOwnership", () => {
  it("returns true when user owns the folder", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: "f1" }]);
    expect(await repo.validateOwnership("u1", "f1")).toBe(true);
  });

  it("returns false when user does not own the folder", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.validateOwnership("u1", "f-other")).toBe(false);
  });
});

describe("FolderRepo.checkCycle", () => {
  it("returns without error when nextParentId is null", async () => {
    await expect(repo.checkCycle("u1", "f1", null)).resolves.toBeUndefined();
    expect(mockDb.$queryRaw).not.toHaveBeenCalled();
  });

  it("throws when folder tries to be its own parent", async () => {
    await expect(repo.checkCycle("u1", "f1", "f1")).rejects.toThrow(
      "folder cannot be its own parent",
    );
  });

  it("resolves when parent chain terminates at root without cycle", async () => {
    // f1 → parent → null (root)
    mockDb.$queryRaw.mockResolvedValueOnce([{ parentId: null }]); // parent has no grandparent
    await expect(repo.checkCycle("u1", "f1", "parent")).resolves.toBeUndefined();
  });

  it("throws when cycle is detected (descendant is ancestor)", async () => {
    // nextParentId = "child", which has parentId = "f1" (creating a cycle)
    mockDb.$queryRaw.mockResolvedValueOnce([{ parentId: "f1" }]);
    await expect(repo.checkCycle("u1", "f1", "child")).rejects.toThrow();
  });

  it("throws when a parent in the chain is not found", async () => {
    mockDb.$queryRaw.mockResolvedValueOnce([]); // parent not found
    await expect(repo.checkCycle("u1", "f1", "missing-parent")).rejects.toThrow(
      "parent folder not found",
    );
  });
});

describe("FolderRepo.create", () => {
  it("inserts and returns the new folder", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    mockDb.$queryRaw.mockResolvedValue([folder]);
    expect(await repo.create("u1", "f1", "Notes", null)).toEqual(folder);
  });
});

describe("FolderRepo.update", () => {
  it("executes the update query", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    await repo.update("u1", "f1", "Renamed", null);
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });
});

describe("FolderRepo.delete", () => {
  it("executes the delete query", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    await repo.delete("u1", "f1");
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });
});

describe("getFolderRepo", () => {
  it("returns a singleton repo instance", () => {
    const r = getFolderRepo();
    expect(r).toBeDefined();
    expect(getFolderRepo()).toBe(r);
  });
});
