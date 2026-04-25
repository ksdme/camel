import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: mockTransaction },
}));

import { createSessionRepo, getSessionRepo } from "@/main/repos/session.repo";

const mockRefreshToken = {
  create: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
};

const mockDb = { refreshToken: mockRefreshToken } as any;
const repo = createSessionRepo(mockDb);

const payload = { sub: "u1", jti: "jti-1", iat: 1000, exp: 2000, typ: "refresh" as const };
const device = { userAgent: "Mozilla", ipAddress: "1.2.3.4" };

beforeEach(() => vi.clearAllMocks());

describe("SessionRepo.store", () => {
  it("creates a refresh token record", async () => {
    mockRefreshToken.create.mockResolvedValue({});
    await repo.store("u1", payload, device);
    expect(mockRefreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", jti: "jti-1" }) }),
    );
  });

  it("uses empty device defaults when omitted", async () => {
    mockRefreshToken.create.mockResolvedValue({});
    await repo.store("u1", payload);
    expect(mockRefreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userAgent: null, ipAddress: null }),
      }),
    );
  });
});

describe("SessionRepo.rotate", () => {
  it("returns true and creates new token when rotation succeeds", async () => {
    const mockTx = {
      refreshToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    mockTransaction.mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx));

    const next = { ...payload, jti: "jti-2" };
    const result = await repo.rotate("jti-1", "u1", next, device);

    expect(result).toBe(true);
    expect(mockTx.refreshToken.updateMany).toHaveBeenCalled();
    expect(mockTx.refreshToken.create).toHaveBeenCalled();
  });

  it("returns false when old token not found (concurrent rotation)", async () => {
    const mockTx = {
      refreshToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(),
      },
    };
    mockTransaction.mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx));

    const result = await repo.rotate("jti-old", "u1", payload);
    expect(result).toBe(false);
    expect(mockTx.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe("SessionRepo.revoke", () => {
  it("marks the token as revoked", async () => {
    mockRefreshToken.updateMany.mockResolvedValue({ count: 1 });
    await repo.revoke("jti-1");
    expect(mockRefreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ jti: "jti-1" }) }),
    );
  });
});

describe("SessionRepo.revokeAllForUser", () => {
  it("revokes every active token for the user", async () => {
    mockRefreshToken.updateMany.mockResolvedValue({ count: 3 });
    await repo.revokeAllForUser("u1");
    expect(mockRefreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u1", revokedAt: null }),
      }),
    );
  });
});

describe("SessionRepo.revokeOthersForUser", () => {
  it("returns the count of revoked sessions", async () => {
    mockRefreshToken.updateMany.mockResolvedValue({ count: 2 });
    const count = await repo.revokeOthersForUser("u1", "keep-jti");
    expect(count).toBe(2);
  });
});

describe("SessionRepo.revokeAllExceptCurrent", () => {
  it("revokes others when a current session exists", async () => {
    mockRefreshToken.findFirst.mockResolvedValueOnce({ jti: "current-jti" });
    mockRefreshToken.updateMany.mockResolvedValueOnce({ count: 2 });

    const result = await repo.revokeAllExceptCurrent("u1");
    expect(result).toEqual({ revoked: 2, signedOut: false, currentJti: "current-jti" });
  });

  it("revokes all and signals signed-out when no current session", async () => {
    mockRefreshToken.findFirst.mockResolvedValueOnce(null);
    mockRefreshToken.updateMany.mockResolvedValueOnce({ count: 3 });

    const result = await repo.revokeAllExceptCurrent("u1");
    expect(result).toEqual({ revoked: 3, signedOut: true, currentJti: null });
  });
});

describe("SessionRepo.isActive", () => {
  it("returns true when an active token exists", async () => {
    mockRefreshToken.findFirst.mockResolvedValue({ jti: "jti-1" });
    expect(await repo.isActive("jti-1", "u1")).toBe(true);
  });

  it("returns false when no active token found", async () => {
    mockRefreshToken.findFirst.mockResolvedValue(null);
    expect(await repo.isActive("jti-x", "u1")).toBe(false);
  });
});

describe("SessionRepo.isRevokedButActive", () => {
  it("returns true for a revoked-but-unexpired token", async () => {
    mockRefreshToken.findFirst.mockResolvedValue({ jti: "jti-1" });
    expect(await repo.isRevokedButActive("jti-1", "u1")).toBe(true);
  });

  it("returns false when no such token found", async () => {
    mockRefreshToken.findFirst.mockResolvedValue(null);
    expect(await repo.isRevokedButActive("jti-x", "u1")).toBe(false);
  });
});

describe("SessionRepo.listActive", () => {
  it("returns active sessions ordered by lastUsedAt", async () => {
    const sessions = [
      {
        jti: "j1",
        userAgent: null,
        ipAddress: null,
        lastUsedAt: new Date(),
        createdAt: new Date(),
        expiresAt: new Date(),
      },
    ];
    mockRefreshToken.findMany.mockResolvedValue(sessions);
    const result = await repo.listActive("u1");
    expect(result).toEqual(sessions);
  });
});

describe("SessionRepo.findByJtiAndUser", () => {
  it("returns the token record when found", async () => {
    mockRefreshToken.findFirst.mockResolvedValue({ jti: "jti-1" });
    expect(await repo.findByJtiAndUser("jti-1", "u1")).toEqual({ jti: "jti-1" });
  });

  it("returns null when not found", async () => {
    mockRefreshToken.findFirst.mockResolvedValue(null);
    expect(await repo.findByJtiAndUser("missing", "u1")).toBeNull();
  });
});

describe("SessionRepo.findCurrentForUser", () => {
  it("returns the most-recent active token", async () => {
    mockRefreshToken.findFirst.mockResolvedValue({ jti: "latest" });
    expect(await repo.findCurrentForUser("u1")).toEqual({ jti: "latest" });
  });

  it("returns null when no active sessions", async () => {
    mockRefreshToken.findFirst.mockResolvedValue(null);
    expect(await repo.findCurrentForUser("u1")).toBeNull();
  });
});

describe("getSessionRepo", () => {
  it("returns a singleton repo instance", () => {
    const r = getSessionRepo();
    expect(r).toBeDefined();
    expect(getSessionRepo()).toBe(r);
  });
});
