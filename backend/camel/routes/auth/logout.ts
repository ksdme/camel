import { api } from "encore.dev/api";
import type { IncomingMessage, ServerResponse } from "node:http";
import { APIError } from "encore.dev/api";
import { expireIn } from "encore.dev/storage/cache";
import { getAuthData } from "~encore/auth";
import { safeRecordAuthEvent } from "../../services/auth/audit";
import { tokenBlocklist } from "../../services/auth/cache";
import { revokeAllRefreshTokensForUser } from "../../services/auth/refresh";
import { applyCors } from "../../utils/cors";
import { clearAuthCookies, sendApiError, sendJson } from "../../utils/cookies";
import { requestMetaFromIncomingMessage } from "../../utils/request_meta";

// POST /auth/logout
// Revokes the access token jti via the cache blocklist and revokes all
// refresh tokens for the user. Clears HttpOnly auth cookies on the response.
export const logout = api.raw(
  { expose: true, auth: true, method: "POST", path: "/auth/logout" },
  async (req: IncomingMessage, res: ServerResponse) => {
    if (applyCors(req, res)) return;

    const reqMeta = requestMetaFromIncomingMessage(req);
    try {
      const { userID, jti, exp } = getAuthData()!;
      const ttlMs = Math.max(1, exp * 1000 - Date.now());
      await Promise.all([
        tokenBlocklist.set({ jti }, "1", { expiry: expireIn(ttlMs) }),
        revokeAllRefreshTokensForUser(userID),
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
      if (err instanceof APIError) {
        sendApiError(res, err);
      } else {
        sendJson(res, 500, { code: "internal", message: "internal server error" });
      }
    }
  },
);
