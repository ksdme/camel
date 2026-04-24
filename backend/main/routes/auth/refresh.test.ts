import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeRawHandler } from "./test-helpers";

class MockAPIError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }

  static invalidArgument(message: string) {
    return new MockAPIError("invalid_argument", message);
  }

  static unauthenticated(message: string) {
    return new MockAPIError("unauthenticated", message);
  }
}

const safeRecordAuthEvent = vi.fn();
const isActiveRefreshToken = vi.fn();
const issueRefreshToken = vi.fn();
const rotateRefreshToken = vi.fn();
const verifyRefreshToken = vi.fn();
const issueAccessToken = vi.fn();

vi.mock("encore.dev/api", () => ({
  api: { raw: (_options: unknown, handler: unknown) => handler },
  APIError: MockAPIError,
}));
vi.mock("../../services/auth/audit", () => ({ safeRecordAuthEvent }));
vi.mock("../../services/auth/refresh", () => ({
  isActiveRefreshToken,
  issueRefreshToken,
  rotateRefreshToken,
  verifyRefreshToken,
}));
vi.mock("../../services/auth/tokens", () => ({ issueAccessToken }));

const { refresh } = await import("./refresh");

describe("POST /auth/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests with no refresh token", async () => {
    const result = await invokeRawHandler(refresh);

    expect(result.statusCode).toBe(401);
    expect(result.json).toEqual({
      code: "unauthenticated",
      message: "missing refresh token",
    });
    expect(verifyRefreshToken).not.toHaveBeenCalled();
  });

  it("rejects invalid refresh tokens and records an audit failure", async () => {
    verifyRefreshToken.mockImplementation(() => {
      throw new Error("bad token");
    });

    const result = await invokeRawHandler(refresh, {
      headers: { cookie: "refresh_token=bad.jwt" },
    });

    expect(result.statusCode).toBe(401);
    expect(result.json).toEqual({
      code: "unauthenticated",
      message: "invalid refresh token",
    });
    expect(safeRecordAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "refresh", success: false, reason: "invalid refresh token" }),
    );
  });

  it("rotates an active refresh token and sets new auth cookies", async () => {
    verifyRefreshToken.mockReturnValue({ sub: "user-1", jti: "old-jti", iat: 1, exp: 2, typ: "refresh" });
    isActiveRefreshToken.mockResolvedValue(true);
    issueRefreshToken.mockReturnValue({
      token: "refresh.next.jwt",
      payload: { sub: "user-1", jti: "new-jti", iat: 3, exp: 4, typ: "refresh" },
    });
    rotateRefreshToken.mockResolvedValue(undefined);
    issueAccessToken.mockReturnValue("access.next.jwt");

    const result = await invokeRawHandler(refresh, {
      headers: { cookie: "refresh_token=refresh.current.jwt" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.json).toEqual({
      ok: true,
    });
    expect(isActiveRefreshToken).toHaveBeenCalledWith("old-jti", "user-1");
    expect(rotateRefreshToken).toHaveBeenCalledWith(
      "old-jti",
      "user-1",
      expect.objectContaining({ jti: "new-jti", sub: "user-1", typ: "refresh" }),
    );
    expect(result.headers["set-cookie"]).toEqual([
      expect.stringContaining("access_token=access.next.jwt"),
      expect.stringContaining("refresh_token=refresh.next.jwt"),
    ]);
  });
});
