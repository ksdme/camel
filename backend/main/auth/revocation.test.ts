import { describe, expect, it } from "vitest";
import { isRevokedBlocklistValue } from "./revocation";

describe("isRevokedBlocklistValue", () => {
  it("returns false for a cache miss", () => {
    expect(isRevokedBlocklistValue(undefined)).toBe(false);
  });

  it("returns true when a blocklist entry exists", () => {
    expect(isRevokedBlocklistValue("1")).toBe(true);
  });
});