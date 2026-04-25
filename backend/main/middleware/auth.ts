import { APIError, Gateway, type Header } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import log from "encore.dev/log";
import { safeRecordAuthEvent } from "@/main/utils/auth/audit";
import { tokenBlocklist } from "@/main/utils/auth/cache";
import { isRevokedBlocklistValue } from "@/main/utils/auth/revocation";
import { type AccessTokenPayload, verifyAccessToken } from "@/main/utils/auth/tokens";
import { parseCookies } from "@/main/utils/cookies";
import { requestMetaFromHeaders } from "@/main/utils/request_meta";

interface AuthParams {
  authorization?: Header<"Authorization">;
  cookie?: Header<"Cookie">;
  userAgent?: Header<"User-Agent">;
  xForwardedFor?: Header<"X-Forwarded-For">;
  xRealIp?: Header<"X-Real-IP">;
}

export interface AuthData {
  userID: string;
  jti: string;
  exp: number;
}

// Validates auth on every request with `auth: true`.
// Token resolution order: Authorization: Bearer header → access_token cookie.
// Verifies the JWT signature, then checks the blocklist so revoked tokens
// (after /auth/logout) are rejected before their natural expiry.
export const authenticate = authHandler<AuthParams, AuthData>(
  async ({ authorization, cookie, userAgent, xForwardedFor, xRealIp }): Promise<AuthData> => {
    const reqMeta = requestMetaFromHeaders({
      "user-agent": userAgent,
      "x-forwarded-for": xForwardedFor,
      "x-real-ip": xRealIp,
    });

    // Prefer explicit Authorization header; fall back to HttpOnly cookie.
    let token: string | undefined;
    const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
    if (bearerMatch) {
      token = bearerMatch[1];
    } else if (cookie) {
      token = parseCookies(cookie).access_token;
    }

    if (!token) {
      log.info("auth failed: no token provided");
      await safeRecordAuthEvent({
        eventType: "authenticate",
        success: false,
        reason: "no token provided",
        ipAddress: reqMeta.ipAddress,
        userAgent: reqMeta.userAgent,
      });
      throw APIError.unauthenticated("no token provided");
    }

    let payload: AccessTokenPayload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      log.info("auth failed: invalid or expired token");
      await safeRecordAuthEvent({
        eventType: "authenticate",
        success: false,
        reason: "invalid or expired token",
        ipAddress: reqMeta.ipAddress,
        userAgent: reqMeta.userAgent,
      });
      throw APIError.unauthenticated("invalid or expired token");
    }

    if (isRevokedBlocklistValue(await tokenBlocklist.get({ jti: payload.jti }))) {
      log.info("auth failed: token revoked");
      await safeRecordAuthEvent({
        userId: payload.sub,
        eventType: "authenticate",
        success: false,
        reason: "token revoked",
        ipAddress: reqMeta.ipAddress,
        userAgent: reqMeta.userAgent,
      });
      throw APIError.unauthenticated("token revoked");
    }

    log.debug("auth passed", { userID: payload.sub });
    await safeRecordAuthEvent({
      userId: payload.sub,
      eventType: "authenticate",
      success: true,
      ipAddress: reqMeta.ipAddress,
      userAgent: reqMeta.userAgent,
    });

    return { userID: payload.sub, jti: payload.jti, exp: payload.exp };
  },
);

export const gateway = new Gateway({ authHandler: authenticate });
