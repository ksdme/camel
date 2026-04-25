import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  Prisma: { sql: vi.fn(), empty: null, join: vi.fn() },
  prisma: {},
}));

vi.mock("encore.dev/api", () => ({
  APIError: {
    notFound: (msg: string) => new Error(msg),
  },
}));

import { createShareRepo, getShareRepo } from "@/main/repos/share.repo";

const mockDb = {
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
} as any;

const repo = createShareRepo(mockDb);

const now = new Date();
const shareRow = {
  id: "s1",
  ownerId: "u1",
  kind: "note",
  targetId: "n1",
  recipientEmail: "bob@example.com",
  accessLevel: "view",
  token: "tok-abc",
  revokedAt: null,
  createdAt: now,
  updatedAt: now,
};
beforeEach(() => vi.clearAllMocks());

describe("ShareRepo.listByOwner", () => {
  it("returns shares with hydrated titles", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([shareRow]) // list shares
      .mockResolvedValueOnce([{ id: "n1", title: "My Note" }]); // hydrate note title
    const result = await repo.listByOwner("u1");
    expect(result[0]).toMatchObject({ id: "s1", targetTitle: "My Note" });
  });

  it("returns empty list when no shares", async () => {
    mockDb.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.listByOwner("u1")).toEqual([]);
  });
});

describe("ShareRepo.listForRecipient", () => {
  it("returns shares for a recipient email with folder hydration", async () => {
    const folderShareRow = { ...shareRow, id: "s2", kind: "folder", targetId: "f1" };
    mockDb.$queryRaw
      .mockResolvedValueOnce([folderShareRow])
      .mockResolvedValueOnce([{ id: "f1", name: "Work Folder" }]);
    const result = await repo.listForRecipient("bob@example.com");
    expect(result[0]).toMatchObject({ id: "s2", targetTitle: "Work Folder" });
  });
});

describe("ShareRepo.findByOwner", () => {
  it("returns the share when found", async () => {
    mockDb.$queryRaw.mockResolvedValue([shareRow]);
    expect(await repo.findByOwner("u1", "s1")).toEqual(shareRow);
  });

  it("returns null when not found", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.findByOwner("u1", "missing")).toBeNull();
  });
});

describe("ShareRepo.findByToken", () => {
  it("returns the share for a valid token", async () => {
    mockDb.$queryRaw.mockResolvedValue([shareRow]);
    expect(await repo.findByToken("tok-abc")).toEqual(shareRow);
  });

  it("returns null for unknown token", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.findByToken("bad-tok")).toBeNull();
  });
});

describe("ShareRepo.findEditableByToken", () => {
  it("returns the share for an editable token", async () => {
    mockDb.$queryRaw.mockResolvedValue([shareRow]);
    expect(await repo.findEditableByToken("tok-abc")).toEqual(shareRow);
  });

  it("returns null when share is not editable", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.findEditableByToken("view-tok")).toBeNull();
  });
});

describe("ShareRepo.getPublicShare", () => {
  it("returns a share with note content included", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([shareRow]) // findByToken
      .mockResolvedValueOnce([{ id: "n1", title: "My Note" }]) // hydrateRows
      .mockResolvedValueOnce([{ content: "{}", plainText: "text" }]); // note content
    const result = await repo.getPublicShare("tok-abc");
    expect(result).toMatchObject({ id: "s1", targetContent: "{}", targetPlainText: "text" });
  });

  it("throws notFound when token does not exist", async () => {
    mockDb.$queryRaw.mockResolvedValueOnce([]);
    await expect(repo.getPublicShare("bad-tok")).rejects.toThrow("share not found");
  });
});

describe("ShareRepo.validateTarget", () => {
  it("returns true when note target exists and belongs to owner", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: "n1" }]);
    expect(await repo.validateTarget("u1", "note", "n1")).toBe(true);
  });

  it("returns false when note target does not exist", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.validateTarget("u1", "note", "missing")).toBe(false);
  });

  it("returns true when folder target exists", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: "f1" }]);
    expect(await repo.validateTarget("u1", "folder", "f1")).toBe(true);
  });

  it("returns false when folder target does not exist", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    expect(await repo.validateTarget("u1", "folder", "missing")).toBe(false);
  });
});

describe("ShareRepo.create", () => {
  it("inserts and returns the new share", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    mockDb.$queryRaw
      .mockResolvedValueOnce([shareRow]) // findByOwner
      .mockResolvedValueOnce([{ id: "n1", title: "My Note" }]); // hydrateRows in toShareItem
    const data = {
      id: "s1",
      ownerId: "u1",
      kind: "note" as const,
      targetId: "n1",
      recipientEmail: "bob@example.com",
      accessLevel: "view" as const,
      token: "tok-abc",
    };
    const result = await repo.create(data);
    expect(result).toMatchObject({ id: "s1" });
  });
});

describe("ShareRepo.updateAccessLevel", () => {
  it("updates access level and returns the share", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    mockDb.$queryRaw
      .mockResolvedValueOnce([shareRow])
      .mockResolvedValueOnce([{ id: "n1", title: "My Note" }]);
    const result = await repo.updateAccessLevel("u1", "s1", "edit");
    expect(result).toMatchObject({ id: "s1" });
  });
});

describe("ShareRepo.delete", () => {
  it("executes the delete query", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    await repo.delete("u1", "s1");
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });
});

describe("ShareRepo.updateNoteContent", () => {
  it("updates note content and plainText", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    await repo.updateNoteContent("n1", "{}", "text");
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });
});

describe("getShareRepo", () => {
  it("returns a singleton repo instance", () => {
    const r = getShareRepo();
    expect(r).toBeDefined();
    expect(getShareRepo()).toBe(r);
  });
});
