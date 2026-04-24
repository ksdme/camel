import { api, APIError } from "encore.dev/api";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getAuthData } from "~encore/auth";
import { prisma } from "../../../lib/db";
import { safeRecordAuthEvent } from "../../services/auth/audit";
import {
  revokeOtherRefreshTokensForUser,
  revokeRefreshToken,
  verifyRefreshToken,
} from "../../services/auth/refresh";
import { applyCors } from "../../utils/cors";
import { getCookieValue, readJsonBody, sendApiError, sendJson } from "../../utils/cookies";
import { requestMetaFromIncomingMessage } from "../../utils/request_meta";

interface SessionItem {
  jti: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
}

interface SessionsResponse {
  sessions: SessionItem[];
}

function currentJtiFromCookie(req: IncomingMessage): string | null {
  const token = getCookieValue(req, "refresh_token");
  if (!token) return null;
  try {
    const payload = verifyRefreshToken(token);
    return payload.jti;
  } catch {
    return null;
  }
}

// GET /settings/sessions
// Lists the caller's active refresh tokens. The session matching the caller's
// refresh cookie is flagged `current: true`.
export const listSessions = api.raw(
  { expose: true, auth: true, method: "GET", path: "/settings/sessions" },
  async (req: IncomingMessage, res: ServerResponse) => {
    if (applyCors(req, res)) return;
    try {
      const { userID } = getAuthData()!;
      const currentJti = currentJtiFromCookie(req);

      const rows = await prisma.refreshToken.findMany({
        where: {
          userId: userID,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
        select: {
          jti: true,
          userAgent: true,
          ipAddress: true,
          lastUsedAt: true,
          createdAt: true,
          expiresAt: true,
        },
      });

      const sessions: SessionItem[] = rows.map((row) => ({
        jti: row.jti,
        userAgent: row.userAgent,
        ipAddress: row.ipAddress,
        lastUsedAt: row.lastUsedAt,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        current: currentJti !== null && row.jti === currentJti,
      }));

      sendJson(res, 200, { sessions } satisfies SessionsResponse);
    } catch (err) {
      if (err instanceof APIError) sendApiError(res, err);
      else sendJson(res, 500, { code: "internal", message: "internal server error" });
    }
  },
);

// POST /settings/sessions/revoke
// Body: { jti }. Revokes the matching session. The caller cannot revoke their
// own current session via this endpoint — they should sign out instead.
export const revokeSession = api.raw(
  { expose: true, auth: true, method: "POST", path: "/settings/sessions/revoke" },
  async (req: IncomingMessage, res: ServerResponse) => {
    if (applyCors(req, res)) return;

    const reqMeta = requestMetaFromIncomingMessage(req);
    try {
      const { userID } = getAuthData()!;
      const body = (await readJsonBody(req)) as { jti?: unknown } | null;
      const jti = body && typeof body.jti === "string" ? body.jti : null;
      if (!jti) {
        sendJson(res, 400, { code: "invalid_argument", message: "jti is required" });
        return;
      }

      const currentJti = currentJtiFromCookie(req);
      if (currentJti && currentJti === jti) {
        sendJson(res, 400, {
          code: "invalid_argument",
          message: "cannot revoke current session — sign out instead",
        });
        return;
      }

      const target = await prisma.refreshToken.findFirst({
        where: { jti, userId: userID },
        select: { jti: true },
      });
      if (!target) {
        sendJson(res, 404, { code: "not_found", message: "session not found" });
        return;
      }

      await revokeRefreshToken(jti);
      await safeRecordAuthEvent({
        userId: userID,
        eventType: "session_revoke",
        success: true,
        ipAddress: reqMeta.ipAddress,
        userAgent: reqMeta.userAgent,
      });

      sendJson(res, 200, { ok: true });
    } catch (err) {
      if (err instanceof APIError) sendApiError(res, err);
      else sendJson(res, 500, { code: "internal", message: "internal server error" });
    }
  },
);

// POST /settings/sessions/revoke-others
// Revokes every active refresh token except the caller's current one.
export const revokeOtherSessions = api.raw(
  { expose: true, auth: true, method: "POST", path: "/settings/sessions/revoke-others" },
  async (req: IncomingMessage, res: ServerResponse) => {
    if (applyCors(req, res)) return;

    const reqMeta = requestMetaFromIncomingMessage(req);
    try {
      const { userID } = getAuthData()!;
      const currentJti = currentJtiFromCookie(req);

      let count = 0;
      if (currentJti) {
        count = await revokeOtherRefreshTokensForUser(userID, currentJti);
      } else {
        // No valid refresh cookie — revoke all active tokens.
        const result = await prisma.refreshToken.updateMany({
          where: { userId: userID, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        count = result.count;
      }

      await safeRecordAuthEvent({
        userId: userID,
        eventType: "session_revoke_others",
        success: true,
        ipAddress: reqMeta.ipAddress,
        userAgent: reqMeta.userAgent,
      });

      sendJson(res, 200, { ok: true, revoked: count });
    } catch (err) {
      if (err instanceof APIError) sendApiError(res, err);
      else sendJson(res, 500, { code: "internal", message: "internal server error" });
    }
  },
);
