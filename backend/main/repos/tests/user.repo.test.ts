import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {},
}));

import { createUserRepo, getUserRepo } from "@/main/repos/user.repo";

const mockUser = {
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const mockDb = { user: mockUser } as any;
const repo = createUserRepo(mockDb);

beforeEach(() => vi.clearAllMocks());

describe("UserRepo.findById", () => {
  it("returns the user profile when found", async () => {
    const profile = {
      id: "u1",
      username: "alice",
      email: null,
      displayName: null,
      createdAt: new Date(),
    };
    mockUser.findUnique.mockResolvedValue(profile);
    expect(await repo.findById("u1")).toEqual(profile);
  });

  it("returns null when not found", async () => {
    mockUser.findUnique.mockResolvedValue(null);
    expect(await repo.findById("missing")).toBeNull();
  });
});

describe("UserRepo.findByUsername", () => {
  it("returns auth row when username matches", async () => {
    const row = { id: "u1", username: "alice", passwordHash: "hash" };
    mockUser.findUnique.mockResolvedValue(row);
    expect(await repo.findByUsername("alice")).toEqual(row);
  });

  it("returns null for unknown username", async () => {
    mockUser.findUnique.mockResolvedValue(null);
    expect(await repo.findByUsername("ghost")).toBeNull();
  });
});

describe("UserRepo.findCredentialsById", () => {
  it("returns credentials row", async () => {
    mockUser.findUnique.mockResolvedValue({ id: "u1", username: "alice", passwordHash: "h" });
    expect(await repo.findCredentialsById("u1")).not.toBeNull();
  });
});

describe("UserRepo.findEmailById", () => {
  it("returns the email when present", async () => {
    mockUser.findUnique.mockResolvedValue({ email: "alice@example.com" });
    expect(await repo.findEmailById("u1")).toBe("alice@example.com");
  });

  it("returns null when user has no email", async () => {
    mockUser.findUnique.mockResolvedValue({ email: null });
    expect(await repo.findEmailById("u1")).toBeNull();
  });

  it("returns null when user is not found", async () => {
    mockUser.findUnique.mockResolvedValue(null);
    expect(await repo.findEmailById("missing")).toBeNull();
  });
});

describe("UserRepo.findUsernameById", () => {
  it("returns username when found", async () => {
    mockUser.findUnique.mockResolvedValue({ username: "alice" });
    expect(await repo.findUsernameById("u1")).toBe("alice");
  });

  it("returns null when not found", async () => {
    mockUser.findUnique.mockResolvedValue(null);
    expect(await repo.findUsernameById("missing")).toBeNull();
  });
});

describe("UserRepo.create", () => {
  it("creates and returns the public user", async () => {
    const user = { id: "u1", username: "bob", createdAt: new Date() };
    mockUser.create.mockResolvedValue(user);
    expect(await repo.create("bob", "hash")).toEqual(user);
  });
});

describe("UserRepo.updateProfile", () => {
  it("returns updated profile", async () => {
    const profile = {
      id: "u1",
      username: "alice",
      email: "a@b.com",
      displayName: "Alice",
      createdAt: new Date(),
    };
    mockUser.update.mockResolvedValue(profile);
    expect(await repo.updateProfile("u1", { email: "a@b.com" })).toEqual(profile);
  });
});

describe("UserRepo.updatePasswordHash", () => {
  it("calls update with new hash", async () => {
    mockUser.update.mockResolvedValue({});
    await repo.updatePasswordHash("u1", "newhash");
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "newhash" },
    });
  });
});

describe("UserRepo.softDeleteProfile", () => {
  it("nulls email and displayName and sets deletedAt", async () => {
    mockUser.update.mockResolvedValue({});
    await repo.softDeleteProfile("u1");
    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ email: null, displayName: null }),
      }),
    );
  });
});

describe("UserRepo.hardDelete", () => {
  it("deletes the user record", async () => {
    mockUser.delete.mockResolvedValue({});
    await repo.hardDelete("u1");
    expect(mockUser.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });
});

describe("getUserRepo", () => {
  it("returns a singleton repo instance", () => {
    const r = getUserRepo();
    expect(r).toBeDefined();
    expect(getUserRepo()).toBe(r);
  });
});
