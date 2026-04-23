import { api } from "encore.dev/api";
import { expireIn } from "encore.dev/storage/cache";
import { getAuthData } from "~encore/auth";
import { tokenBlocklist } from "./cache";

interface LogoutResponse {
  ok: boolean;
}

// POST /auth/logout
// Adds the caller's JWT `jti` to the blocklist with a TTL equal to the
// token's remaining lifetime. Subsequent requests with the same token are
// rejected by the authHandler.
export const logout = api(
  { expose: true, auth: true, method: "POST", path: "/auth/logout" },
  async (): Promise<LogoutResponse> => {
    const { jti, exp } = getAuthData()!;
    const ttlMs = Math.max(1, exp * 1000 - Date.now());
    await tokenBlocklist.set({ jti }, "1", { expiry: expireIn(ttlMs) });
    return { ok: true };
  },
);
