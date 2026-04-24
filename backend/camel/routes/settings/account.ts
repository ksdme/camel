import { api, APIError } from "encore.dev/api";
import type { IncomingMessage, ServerResponse } from "node:http";
import { expireIn } from "encore.dev/storage/cache";
import { getAuthData } from "~encore/auth";
import { prisma } from "../../../lib/db";
import { safeRecordAuthEvent } from "../../services/auth/audit";
import { tokenBlocklist } from "../../services/auth/cache";
import { verifyPassword } from "../../services/auth/password";
import { revokeAllRefreshTokensForUser } from "../../services/auth/refresh";
import { applyCors } from "../../utils/cors";
import { clearAuthCookies, readJsonBody, sendApiError, sendJson } from "../../utils/cookies";
import { requestMetaFromIncomingMessage } from "../../utils/request_meta";

type DeleteScope = "profile" | "all";

interface DeleteAccountRequest {
  password: string;
  scope: DeleteScope;
}

function isDeleteScope(value: unknown): value is DeleteScope {
  return value === "profile" || value === "all";
}

// DELETE /settings/account
// Requires the user's current password. Two scopes:
//   - "profile": soft delete. Clears email/displayName, revokes all sessions,
//                and stamps deletedAt. Username remains reserved and the auth
//                audit trail is preserved.
//   - "all":    hard delete. Removes the user row; refresh_tokens and
//                auth_events cascade away. Username is released.
// In both cases the access token is blocklisted and cookies are cleared.
export const deleteAccount = api.raw(
  { expose: true, auth: true, method: "DELETE", path: "/settings/account" },
  async (req: IncomingMessage, res: ServerResponse) => {
    if (applyCors(req, res)) return;

    const reqMeta = requestMetaFromIncomingMessage(req);
    try {
      const { userID, jti, exp } = getAuthData()!;

      const body = (await readJsonBody(req)) as Partial<DeleteAccountRequest> | null;
      const password = body && typeof body.password === "string" ? body.password : "";
      const scope = body && isDeleteScope(body.scope) ? body.scope : null;

      if (!password) {
        sendJson(res, 400, { code: "invalid_argument", message: "password is required" });
        return;
      }
      if (!scope) {
        sendJson(res, 400, {
          code: "invalid_argument",
          message: "scope must be 'profile' or 'all'",
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userID },
        select: { id: true, username: true, passwordHash: true },
      });
      if (!user) {
        sendJson(res, 404, { code: "not_found", message: "user not found" });
        return;
      }

      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) {
        await safeRecordAuthEvent({
          userId: user.id,
          username: user.username,
          eventType: "account_delete",
          success: false,
          reason: "invalid password",
          ipAddress: reqMeta.ipAddress,
          userAgent: reqMeta.userAgent,
        });
        sendJson(res, 401, { code: "unauthenticated", message: "incorrect password" });
        return;
      }

      if (scope === "profile") {
        await prisma.user.update({
          where: { id: userID },
          data: {
            email: null,
            displayName: null,
            deletedAt: new Date(),
          },
        });
        await revokeAllRefreshTokensForUser(userID);
        await safeRecordAuthEvent({
          userId: user.id,
          username: user.username,
          eventType: "account_delete",
          success: true,
          reason: "profile",
          ipAddress: reqMeta.ipAddress,
          userAgent: reqMeta.userAgent,
        });
      } else {
        // Record the audit event first so the username survives the cascade.
        await safeRecordAuthEvent({
          username: user.username,
          eventType: "account_delete",
          success: true,
          reason: "all",
          ipAddress: reqMeta.ipAddress,
          userAgent: reqMeta.userAgent,
        });
        await prisma.user.delete({ where: { id: userID } });
      }

      // Blocklist the current access token for its remaining lifetime so it
      // can't be reused between now and the client receiving the response.
      const ttlMs = Math.max(1, exp * 1000 - Date.now());
      await tokenBlocklist.set({ jti }, "1", { expiry: expireIn(ttlMs) });

      clearAuthCookies(res);
      sendJson(res, 200, { ok: true, scope });
    } catch (err) {
      if (err instanceof APIError) sendApiError(res, err);
      else sendJson(res, 500, { code: "internal", message: "internal server error" });
    }
  },
);
