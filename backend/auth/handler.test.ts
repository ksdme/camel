import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock handles
// ---------------------------------------------------------------------------
const cache = vi.hoisted(() => ({
  blocklistGet: vi.fn(),
}));

const tokensMock = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// encore.dev/auth: authHandler() returns the raw handler for direct invocation.
vi.mock("encore.dev/auth", () => ({
  authHandler: (_handler: unknown) => _handler,
}));

vi.mock("encore.dev/api", () => {
  class APIError extends Error {
    static unauthenticated(msg: string) {
      return new APIError(`unauthenticated: ${msg}`);
    }
  }
  return { APIError, Gateway: class {} };
});

vi.mock("./cache", () => ({
  tokenBlocklist: { get: cache.blocklistGet },
}));

vi.mock("./tokens", () => ({
  verifyAccessToken: tokensMock.verifyAccessToken,
}));

// ---------------------------------------------------------------------------
// Import (resolved after mocks)
// ---------------------------------------------------------------------------
import { authenticate } from "./handler";

// Narrow to a plain async function for test invocations.
const callAuthenticate = authenticate as unknown as (params: {
  authorization?: string;
}) => Promise<{ userID: string; jti: string; exp: number }>;

const fakePayload = {
  sub: "user-123",
  jti: "deadbeefdeadbeef",
  iat: Math.floor(Date.now() / 1000) - 60,
  exp: Math.floor(Date.now() / 1000) + 3600,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("authenticate (auth handler)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws unauthenticated when Authorization header is absent", async () => {
    await expect(callAuthenticate({})).rejects.toThrow(/unauthenticated/i);
  });

  it("throws unauthenticated when Authorization header is malformed (no Bearer)", async () => {
    await expect(
      callAuthenticate({ authorization: "Basic dXNlcjpwYXNz" }),
    ).rejects.toThrow(/unauthenticated/i);
  });

  it("throws unauthenticated when token signature is invalid", async () => {
    tokensMock.verifyAccessToken.mockImplementation(() => {
      throw new Error("jwt malformed");
    });
    cache.blocklistGet.mockResolvedValue(undefined);

    await expect(
      callAuthenticate({ authorization: "Bearer bad.token.here" }),
    ).rejects.toThrow(/unauthenticated/i);
  });

  it("returns AuthData for a valid, non-revoked token", async () => {
    tokensMock.verifyAccessToken.mockReturnValue(fakePayload);
    cache.blocklistGet.mockResolvedValue(undefined);

    const result = await callAuthenticate({
      authorization: "Bearer valid.token.here",
    });

    expect(result.userID).toBe("user-123");
    expect(result.jti).toBe("deadbeefdeadbeef");
    expect(result.exp).toBe(fakePayload.exp);
  });

  it("throws unauthenticated when the token is revoked (blocklist hit)", async () => {
    tokensMock.verifyAccessToken.mockReturnValue(fakePayload);
    cache.blocklistGet.mockResolvedValue("1"); // presence = revoked

    await expect(
      callAuthenticate({ authorization: "Bearer valid.token.here" }),
    ).rejects.toThrow(/revoked/i);
  });
});
