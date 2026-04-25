import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeRawHandler } from "./helpers";

class MockAPIError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
  static invalidArgument(message: string) {
    return new MockAPIError("invalid_argument", message);
  }
  static unauthenticated(message: string) {
    return new MockAPIError("unauthenticated", message);
  }
  static unavailable(message: string) {
    return new MockAPIError("unavailable", message);
  }
}

const safeRecordAuthEvent = vi.fn();
const hashPassword = vi.fn();
const verifyPassword = vi.fn();
const issueRefreshToken = vi.fn();
const issueAccessToken = vi.fn();

const userRepo = {
  findByUsername: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
};
const sessionRepo = {
  store: vi.fn(),
};

vi.mock("encore.dev/api", () => ({
  api: { raw: (_options: unknown, handler: unknown) => handler },
  APIError: MockAPIError,
}));
vi.mock("@/main/utils/auth/audit", () => ({ safeRecordAuthEvent }));
vi.mock("@/main/utils/auth/password", () => ({ hashPassword, verifyPassword }));
vi.mock("@/main/utils/auth/refresh", () => ({ issueRefreshToken }));
vi.mock("@/main/utils/auth/tokens", () => ({ issueAccessToken }));
vi.mock("@/main/repos", () => ({
  getUserRepo: () => userRepo,
  getSessionRepo: () => sessionRepo,
}));

const { login } = await import("@/main/services/auth/login");

describe("POST /auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new user, persists a refresh token, and sets auth cookies", async () => {
    const createdAt = new Date("2026-04-23T10:00:00.000Z");
    userRepo.findByUsername.mockResolvedValue(null);
    hashPassword.mockResolvedValue("argon2-hash");
    userRepo.create.mockResolvedValue({ id: "user-1", username: "alice_1", createdAt });
    issueAccessToken.mockReturnValue("access.jwt");
    issueRefreshToken.mockReturnValue({
      token: "refresh.jwt",
      payload: { sub: "user-1", jti: "refresh-jti", iat: 1, exp: 2, typ: "refresh" },
    });
    sessionRepo.store.mockResolvedValue(undefined);

    const result = await invokeRawHandler(login, {
      body: { username: "alice_1", password: "Password@0" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.json).toEqual({
      user: { id: "user-1", username: "alice_1", createdAt: createdAt.toISOString() },
      created: true,
    });
    expect(hashPassword).toHaveBeenCalledWith("Password@0");
    expect(sessionRepo.store).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ sub: "user-1", jti: "refresh-jti", typ: "refresh" }),
      expect.any(Object),
    );
    expect(safeRecordAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        username: "alice_1",
        eventType: "login",
        success: true,
      }),
    );
    expect(result.headers["set-cookie"]).toEqual([
      expect.stringContaining("access_token=access.jwt"),
      expect.stringContaining("refresh_token=refresh.jwt"),
    ]);
    expect(result.headers["set-cookie"]).toEqual([
      expect.stringContaining("HttpOnly"),
      expect.stringContaining("SameSite=Lax"),
    ]);
  });

  it("rejects a wrong password for an existing user", async () => {
    userRepo.findByUsername.mockResolvedValue({
      id: "user-1",
      username: "alice_1",
      passwordHash: "argon2-hash",
    });
    verifyPassword.mockResolvedValue(false);

    const result = await invokeRawHandler(login, {
      body: { username: "alice_1", password: "WrongPassword@0" },
    });

    expect(result.statusCode).toBe(401);
    expect(result.json).toEqual({
      code: "unauthenticated",
      message: "invalid username or password",
    });
    expect(issueAccessToken).not.toHaveBeenCalled();
    expect(result.headers["set-cookie"]).toBeUndefined();
    expect(safeRecordAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        username: "alice_1",
        eventType: "login",
        success: false,
      }),
    );
  });

  it("rejects invalid login payloads before touching the database", async () => {
    const result = await invokeRawHandler(login, {
      body: { username: "ab", password: "short" },
    });

    expect(result.statusCode).toBe(400);
    expect(result.json).toEqual({
      code: "invalid_argument",
      message: "username: 3-32 alphanumeric/underscore characters required",
    });
    expect(userRepo.findByUsername).not.toHaveBeenCalled();
  });
});
