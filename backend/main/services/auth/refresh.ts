import type { IncomingMessage, ServerResponse } from "node:http";
import { APIError, api } from "encore.dev/api";
import { getSessionRepo } from "@/main/repos";
import { safeRecordAuthEvent } from "@/main/utils/auth/audit";
import {
  issueRefreshToken,
  type RefreshTokenPayload,
  verifyRefreshToken,
} from "@/main/utils/auth/refresh";
import { issueAccessToken } from "@/main/utils/auth/tokens";
import { getCookieValue, sendApiError, sendJson, setAuthCookies } from "@/main/utils/cookies";
import { requestMetaFromIncomingMessage } from "@/main/utils/request_meta";

// POST /auth/refresh
// Rotates refresh token and issues a fresh access token.
export const refresh = api.raw(
  { expose: true, method: "POST", path: "/auth/refresh" },
  async (req: IncomingMessage, res: ServerResponse) => {
    const reqMeta = requestMetaFromIncomingMessage(req);
    const refreshToken: string | undefined = getCookieValue(req, "refresh_token");

    if (!refreshToken) {
      sendJson(res, 401, { code: "unauthenticated", message: "missing refresh token" });
      return;
    }

    try {
      let payload: RefreshTokenPayload;
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

      const active = await getSessionRepo().isActive(payload.jti, payload.sub);
      if (!active) {
        const isReuse = await getSessionRepo().isRevokedButActive(payload.jti, payload.sub);
        if (isReuse) {
          await getSessionRepo().revokeAllForUser(payload.sub);
          await safeRecordAuthEvent({
            userId: payload.sub,
            eventType: "refresh",
            success: false,
            reason: "refresh token reuse detected - all sessions revoked",
            ipAddress: reqMeta.ipAddress,
            userAgent: reqMeta.userAgent,
          });
          sendJson(res, 401, { code: "unauthenticated", message: "suspicious activity detected" });
        } else {
          await safeRecordAuthEvent({
            userId: payload.sub,
            eventType: "refresh",
            success: false,
            reason: "refresh token revoked or expired",
            ipAddress: reqMeta.ipAddress,
            userAgent: reqMeta.userAgent,
          });
          sendJson(res, 401, {
            code: "unauthenticated",
            message: "refresh token revoked or expired",
          });
        }
        return;
      }

      const nextRefresh = issueRefreshToken(payload.sub);
      const rotated = await getSessionRepo().rotate(
        payload.jti,
        payload.sub,
        nextRefresh.payload,
        reqMeta,
      );
      if (!rotated) {
        await safeRecordAuthEvent({
          userId: payload.sub,
          eventType: "refresh",
          success: false,
          reason: "refresh token already rotated by concurrent request",
          ipAddress: reqMeta.ipAddress,
          userAgent: reqMeta.userAgent,
        });
        sendJson(res, 401, { code: "unauthenticated", message: "refresh token already used" });
        return;
      }

      await safeRecordAuthEvent({
        userId: payload.sub,
        eventType: "refresh",
        success: true,
        ipAddress: reqMeta.ipAddress,
        userAgent: reqMeta.userAgent,
      });

      const newAccessToken = issueAccessToken(payload.sub);
      setAuthCookies(res, newAccessToken, nextRefresh.token);
      sendJson(res, 200, { ok: true });
    } catch (err) {
      if (err instanceof APIError) sendApiError(res, err);
      else sendJson(res, 500, { code: "internal", message: "internal server error" });
    }
  },
);
