import { api, APIError } from "encore.dev/api";
import type { IncomingMessage, ServerResponse } from "node:http";
import { safeRecordAuthEvent } from "../../services/auth/audit";
import {
  isActiveRefreshToken,
  issueRefreshToken,
  rotateRefreshToken,
  verifyRefreshToken,
} from "../../services/auth/refresh";
import { issueAccessToken } from "../../services/auth/tokens";
import { getCookieValue, sendApiError, sendJson, setAuthCookies } from "../../utils/cookies";
import { requestMetaFromIncomingMessage } from "../../utils/request_meta";

interface RefreshResponse {
  ok: boolean;
}

// POST /auth/refresh
// Rotates refresh token and issues a fresh access token.
// The refresh token is read from the HttpOnly refresh_token cookie.
export const refresh = api.raw(
  { expose: true, method: "POST", path: "/auth/refresh" },
  async (req: IncomingMessage, res: ServerResponse) => {
    const reqMeta = requestMetaFromIncomingMessage(req);
    let refreshToken: string | undefined = getCookieValue(req, "refresh_token");

    if (!refreshToken) {
      sendJson(res, 401, { code: "unauthenticated", message: "missing refresh token" });
      return;
    }

    try {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      await safeRecordAuthEvent({
        eventType: "refresh",
        success: false,
        reason: "invalid refresh token",
        ipAddress: reqMeta.ipAddress,
        userAgent: reqMeta.userAgent,
      });
      sendJson(res, 401, { code: "unauthenticated", message: "invalid refresh token" });
      return;
    }

    const active = await isActiveRefreshToken(payload.jti, payload.sub);
    if (!active) {
      await safeRecordAuthEvent({
        userId: payload.sub,
        eventType: "refresh",
        success: false,
        reason: "refresh token revoked or expired",
        ipAddress: reqMeta.ipAddress,
        userAgent: reqMeta.userAgent,
      });
      sendJson(res, 401, { code: "unauthenticated", message: "refresh token revoked or expired" });
      return;
    }

    const nextRefresh = issueRefreshToken(payload.sub);
    await rotateRefreshToken(payload.jti, payload.sub, nextRefresh.payload);
    await safeRecordAuthEvent({
      userId: payload.sub,
      eventType: "refresh",
      success: true,
      ipAddress: reqMeta.ipAddress,
      userAgent: reqMeta.userAgent,
    });

    const newAccessToken = issueAccessToken(payload.sub);
    setAuthCookies(res, newAccessToken, nextRefresh.token);
    const response: RefreshResponse = { ok: true };
    sendJson(res, 200, response);
    } catch (err) {
      if (err instanceof APIError) {
        sendApiError(res, err);
      } else {
        sendJson(res, 500, { code: "internal", message: "internal server error" });
      }
    }
  },
);