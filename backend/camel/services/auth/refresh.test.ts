import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/config", () => ({
  secret: () => () => "test-signing-secret",
}));
vi.mock("../../../lib/db", () => ({
  prisma: {},
}));

const { issueRefreshToken, verifyRefreshToken } = await import("./refresh");
const { issueAccessToken } = await import("./tokens");

describe("refresh token validation", () => {
  it("round-trips a freshly issued refresh token", () => {
    const issued = issueRefreshToken("user-123");

    expect(verifyRefreshToken(issued.token)).toEqual(
      expect.objectContaining({
        sub: "user-123",
        jti: issued.payload.jti,
        typ: "refresh",
      }),
    );
  });

  it("rejects an access token when a refresh token is required", () => {
    const accessToken = issueAccessToken("user-123");

    expect(() => verifyRefreshToken(accessToken)).toThrowError(/invalid refresh token payload/i);
  });
});