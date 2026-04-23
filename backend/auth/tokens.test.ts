import { describe, it, expect, vi } from "vitest";

vi.mock("encore.dev/config", () => ({
  secret: () => () => "test-jwt-signing-secret-32-chars!!",
}));

import { issueAccessToken, verifyAccessToken } from "./tokens";

describe("issueAccessToken", () => {
  it("returns a three-segment JWT string", () => {
    const token = issueAccessToken("user-1");
    expect(token.split(".")).toHaveLength(3);
  });

  it("embeds the userId as the sub claim", () => {
    const token = issueAccessToken("user-abc");
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-abc");
  });

  it("includes a jti claim (16-byte hex, 32 chars)", () => {
    const token = issueAccessToken("user-abc");
    const payload = verifyAccessToken(token);
    expect(typeof payload.jti).toBe("string");
    expect(payload.jti).toHaveLength(32);
  });

  it("produces a unique jti for each call", () => {
    const a = verifyAccessToken(issueAccessToken("user-x"));
    const b = verifyAccessToken(issueAccessToken("user-x"));
    expect(a.jti).not.toBe(b.jti);
  });
});

describe("verifyAccessToken", () => {
  it("returns the full payload for a valid token", () => {
    const token = issueAccessToken("user-xyz");
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-xyz");
    expect(typeof payload.exp).toBe("number");
    expect(typeof payload.iat).toBe("number");
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("throws when the signature is tampered", () => {
    const [h, p] = issueAccessToken("user-1").split(".");
    expect(() => verifyAccessToken(`${h}.${p}.badsignature`)).toThrow();
  });

  it("throws for an arbitrary non-JWT string", () => {
    expect(() => verifyAccessToken("not.a.jwt")).toThrow();
  });
});
