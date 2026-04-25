import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/main/utils/auth/password";

describe("password", () => {
  it("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(hash, "correct-horse-battery-staple")).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cret-value");
    await expect(verifyPassword(hash, "not-the-password")).resolves.toBe(false);
  });

  it("produces a different hash each call (unique salt)", async () => {
    const a = await hashPassword("same-input");
    const b = await hashPassword("same-input");
    expect(a).not.toBe(b);
    await expect(verifyPassword(a, "same-input")).resolves.toBe(true);
    await expect(verifyPassword(b, "same-input")).resolves.toBe(true);
  });
});
