import type { IncomingMessage, ServerResponse } from "node:http";
import { APIError, api } from "encore.dev/api";
import { expireIn } from "encore.dev/storage/cache";
import { getSessionRepo } from "@/main/repos";
import { safeRecordAuthEvent } from "@/main/utils/auth/audit";
import { tokenBlocklist } from "@/main/utils/auth/cache";
import { clearAuthCookies, sendApiError, sendJson } from "@/main/utils/cookies";
import { requestMetaFromIncomingMessage } from "@/main/utils/request_meta";
import { getAuthData } from "~encore/auth";

// POST /auth/logout
// Revokes the access token jti via the cache blocklist and revokes all
// refresh tokens for the user. Clears HttpOnly auth cookies on the response.
export const logout = api.raw(
  { expose: true, auth: true, method: "POST", path: "/auth/logout" },
  async (req: IncomingMessage, res: ServerResponse) => {
    const reqMeta = requestMetaFromIncomingMessage(req);
    try {
      const { userID, jti, exp } = getAuthData()!;
      const ttlMs = Math.max(1, exp * 1000 - Date.now());
      await Promise.all([
        tokenBlocklist.set({ jti }, "1", { expiry: expireIn(ttlMs) }),
        getSessionRepo().revokeAllForUser(userID),
        safeRecordAuthEvent({
          userId: userID,
          eventType: "logout",
          success: true,
          ipAddress: reqMeta.ipAddress,
          userAgent: reqMeta.userAgent,
        }),
      ]);
      clearAuthCookies(res);
      sendJson(res, 200, { ok: true });
    } catch (err) {
      if (err instanceof APIError) sendApiError(res, err);
      else sendJson(res, 500, { code: "internal", message: "internal server error" });
    }
  },
);
