import type { IncomingMessage, ServerResponse } from "node:http";
import { APIError, api } from "encore.dev/api";
import { expireIn } from "encore.dev/storage/cache";
import { getSessionRepo } from "@/main/repos";
import type { SessionItem } from "@/main/types";
import { safeRecordAuthEvent } from "@/main/utils/auth/audit";
import { tokenBlocklist } from "@/main/utils/auth/cache";
import { verifyRefreshToken } from "@/main/utils/auth/refresh";
import {
  clearAuthCookies,
  getCookieValue,
  readJsonBody,
  sendApiError,
  sendJson,
} from "@/main/utils/cookies";
import { requestMetaFromIncomingMessage } from "@/main/utils/request_meta";
import { getAuthData } from "~encore/auth";

interface SessionsResponse {
  sessions: SessionItem[];
}

interface RevokeSessionResponse {
  ok: boolean;
  signedOut: boolean;
}

interface RevokeOtherSessionsResponse {
  ok: boolean;
  revoked: number;
  signedOut: boolean;
}

function currentJtiFromCookie(req: IncomingMessage): string | null {
  const token = getCookieValue(req, "refresh_token");
  if (!token) return null;
  try {
    return verifyRefreshToken(token).jti;
  } catch {
    return null;
  }
}

async function revokeCurrentAccessToken(accessJti: string, exp: number): Promise<void> {
  const ttlMs = Math.max(1, exp * 1000 - Date.now());
  await tokenBlocklist.set({ jti: accessJti }, "1", { expiry: expireIn(ttlMs) });
}

export const listSessions = api.raw(
  { expose: true, auth: true, method: "GET", path: "/settings/sessions" },
  async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const { userID } = getAuthData()!;
      const currentJti = currentJtiFromCookie(req);
      const rows = await getSessionRepo().listActive(userID);
      const sessions: SessionItem[] = rows.map((row) => ({
        ...row,
        current: currentJti !== null && row.jti === currentJti,
      }));
      sendJson(res, 200, { sessions } satisfies SessionsResponse);
    } catch (err) {
      if (err instanceof APIError) sendApiError(res, err);
      else sendJson(res, 500, { code: "internal", message: "internal server error" });
    }
  },
);

export const revokeSession = api.raw(
  { expose: true, auth: true, method: "POST", path: "/settings/sessions/revoke" },
  async (req: IncomingMessage, res: ServerResponse) => {
    const reqMeta = requestMetaFromIncomingMessage(req);
    try {
      const { userID, jti: accessJti, exp } = getAuthData()!;
      const body = (await readJsonBody(req)) as { jti?: unknown } | null;
      const jti = body && typeof body.jti === "string" ? body.jti : null;
      if (!jti) {
        sendJson(res, 400, { code: "invalid_argument", message: "jti is required" });
        return;
      }

      const currentJti = currentJtiFromCookie(req);
      const isCurrentSession = currentJti !== null && currentJti === jti;

      if (!(await getSessionRepo().findByJtiAndUser(jti, userID))) {
        sendJson(res, 404, { code: "not_found", message: "session not found" });
        return;
      }

      const writes: Promise<unknown>[] = [
        getSessionRepo().revoke(jti),
        safeRecordAuthEvent({
          userId: userID,
          eventType: "session_revoke",
          success: true,
          ipAddress: reqMeta.ipAddress,
          userAgent: reqMeta.userAgent,
        }),
      ];
      if (isCurrentSession) writes.push(revokeCurrentAccessToken(accessJti, exp));
      await Promise.all(writes);

      if (isCurrentSession) clearAuthCookies(res);
      sendJson(res, 200, { ok: true, signedOut: isCurrentSession } satisfies RevokeSessionResponse);
    } catch (err) {
      if (err instanceof APIError) sendApiError(res, err);
      else sendJson(res, 500, { code: "internal", message: "internal server error" });
    }
  },
);

export const revokeCurrentSession = api.raw(
  { expose: true, auth: true, method: "POST", path: "/settings/sessions/revoke-current" },
  async (req: IncomingMessage, res: ServerResponse) => {
    const reqMeta = requestMetaFromIncomingMessage(req);
    try {
      const { userID, jti: accessJti, exp } = getAuthData()!;
      const currentJti = currentJtiFromCookie(req);

      const writes: Promise<unknown>[] = [
        revokeCurrentAccessToken(accessJti, exp),
        safeRecordAuthEvent({
          userId: userID,
          eventType: "session_revoke",
          success: true,
          ipAddress: reqMeta.ipAddress,
          userAgent: reqMeta.userAgent,
        }),
      ];
      if (currentJti) writes.push(getSessionRepo().revoke(currentJti));
      await Promise.all(writes);

      clearAuthCookies(res);
      sendJson(res, 200, { ok: true, signedOut: true } satisfies RevokeSessionResponse);
    } catch (err) {
      if (err instanceof APIError) sendApiError(res, err);
      else sendJson(res, 500, { code: "internal", message: "internal server error" });
    }
  },
);

export const revokeOtherSessions = api.raw(
  { expose: true, auth: true, method: "POST", path: "/settings/sessions/revoke-others" },
  async (req: IncomingMessage, res: ServerResponse) => {
    const reqMeta = requestMetaFromIncomingMessage(req);
    try {
      const { userID, jti: accessJti, exp } = getAuthData()!;
      const currentJti = currentJtiFromCookie(req);
      const signedOut = currentJti === null;

      let count: number;
      if (currentJti) {
        count = await getSessionRepo().revokeOthersForUser(userID, currentJti);
      } else {
        await Promise.all([
          getSessionRepo().revokeAllForUser(userID),
          revokeCurrentAccessToken(accessJti, exp),
        ]);
        clearAuthCookies(res);
        count = 0;
      }

      await safeRecordAuthEvent({
        userId: userID,
        eventType: "session_revoke_others",
        success: true,
        ipAddress: reqMeta.ipAddress,
        userAgent: reqMeta.userAgent,
      });

      sendJson(res, 200, {
        ok: true,
        revoked: count,
        signedOut,
      } satisfies RevokeOtherSessionsResponse);
    } catch (err) {
      if (err instanceof APIError) sendApiError(res, err);
      else sendJson(res, 500, { code: "internal", message: "internal server error" });
    }
  },
);
