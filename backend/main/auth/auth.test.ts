import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AccessTokenPayload } from "./tokens";

// ---------------------------------------------------------------------------
// Hoisted mock handles (must be created before vi.mock factories run)
// ---------------------------------------------------------------------------
const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks (hoisted to the top of the file by vitest)
// ---------------------------------------------------------------------------
vi.mock("../lib/db", () => ({
  prisma: { user: { findUnique: db.findUnique, create: db.create } },
}));

vi.mock("./password", () => ({
  hashPassword: vi.fn().mockResolvedValue("$argon2id$v=19$test-hash"),
  verifyPassword: vi.fn(),
}));

vi.mock("./tokens", () => ({
  issueAccessToken: vi.fn().mockReturnValue("mock.jwt.token"),
}));

// encore.dev/api: make api() return the raw handler so we can invoke it directly.
vi.mock("encore.dev/api", () => {
  class APIError extends Error {
    static unauthenticated(msg: string) {
      return new APIError(`unauthenticated: ${msg}`);
    }
    static unavailable(msg: string) {
      return new APIError(`unavailable: ${msg}`);
    }
    static notFound(msg: string) {
      return new APIError(`not_found: ${msg}`);
    }
  }
  return {
    api: (_opts: unknown, handler: unknown) => handler,
    APIError,
  };
});

vi.mock("encore.dev/validate", () => ({}));

// Provide a real-enough PrismaClientKnownRequestError for instanceof checks.
vi.mock("@prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    meta?: Record<string, unknown>;
    constructor(
      message: string,
      opts: { code: string; meta?: Record<string, unknown> },
    ) {
      super(message);
      this.code = opts.code;
      this.meta = opts.meta;
    }
  }
  return { Prisma: { PrismaClientKnownRequestError } };
});

// ---------------------------------------------------------------------------
// Imports (resolved after mocks are applied)
// ---------------------------------------------------------------------------
import { login } from "./auth";
import { verifyPassword } from "./password";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
const existingUser = {
  id: "user-001",
  username: "alice",
  passwordHash: "$argon2id$v=19$test-hash",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
};

interface LoginRequest {
  username: string;
  password: string;
}
interface LoginResponse {
  token: string;
  user: { id: string; username: string; createdAt: Date };
  created: boolean;
}
// When encore.dev/api is mocked, `api()` returns the raw handler directly.
type LoginHandler = (req: LoginRequest) => Promise<LoginResponse>;
const callLogin = login as unknown as LoginHandler;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("new user (signup path)", () => {
    it("creates a user and returns a JWT with created=true", async () => {
      db.findUnique.mockResolvedValue(null);
      db.create.mockResolvedValue({
        id: existingUser.id,
        username: existingUser.username,
        createdAt: existingUser.createdAt,
      });

      const result = await callLogin({ username: "alice", password: "Password@1" });

      expect(result.created).toBe(true);
      expect(result.token).toBe("mock.jwt.token");
      expect(result.user.username).toBe("alice");
      expect(db.create).toHaveBeenCalledOnce();
    });
  });

  describe("existing user (signin path)", () => {
    it("returns a JWT with created=false when the password is correct", async () => {
      db.findUnique.mockResolvedValue(existingUser);
      vi.mocked(verifyPassword).mockResolvedValue(true);

      const result = await callLogin({ username: "alice", password: "Password@1" });

      expect(result.created).toBe(false);
      expect(result.token).toBe("mock.jwt.token");
      expect(result.user.id).toBe(existingUser.id);
      expect(db.create).not.toHaveBeenCalled();
    });

    it("throws unauthenticated when the password is wrong", async () => {
      db.findUnique.mockResolvedValue(existingUser);
      vi.mocked(verifyPassword).mockResolvedValue(false);

      await expect(
        callLogin({ username: "alice", password: "wrong-pass" }),
      ).rejects.toThrow(/unauthenticated/i);
    });
  });
});
