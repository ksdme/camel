import type { IncomingMessage, ServerResponse } from "node:http";
import { APIError, api } from "encore.dev/api";
import { expireIn } from "encore.dev/storage/cache";
import { getSessionRepo, getUserRepo } from "@/main/repos";
import { safeRecordAuthEvent } from "@/main/utils/auth/audit";
import { tokenBlocklist } from "@/main/utils/auth/cache";
import { verifyPassword } from "@/main/utils/auth/password";
import { clearAuthCookies, readJsonBody, sendApiError, sendJson } from "@/main/utils/cookies";
import { requestMetaFromIncomingMessage } from "@/main/utils/request_meta";
import { getAuthData } from "~encore/auth";

type DeleteScope = "profile" | "all";

interface DeleteAccountRequest {
  password: string;
  scope: DeleteScope;
}

function isDeleteScope(value: unknown): value is DeleteScope {
  return value === "profile" || value === "all";
}

export const deleteAccount = api.raw(
  { expose: true, auth: true, method: "DELETE", path: "/settings/account" },
  async (req: IncomingMessage, res: ServerResponse) => {
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

      const user = await getUserRepo().findCredentialsById(userID);
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
        await getUserRepo().softDeleteProfile(userID);
        await getSessionRepo().revokeAllForUser(userID);
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
        await safeRecordAuthEvent({
          username: user.username,
          eventType: "account_delete",
          success: true,
          reason: "all",
          ipAddress: reqMeta.ipAddress,
          userAgent: reqMeta.userAgent,
        });
        await getUserRepo().hardDelete(userID);
      }

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
