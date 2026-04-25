import { APIError, api } from "encore.dev/api";
import { getSessionRepo, getUserRepo } from "@/main/repos";
import { safeRecordAuthEvent } from "@/main/utils/auth/audit";
import { hashPassword, verifyPassword } from "@/main/utils/auth/password";
import { getAuthData } from "~encore/auth";

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

interface ChangePasswordResponse {
  ok: boolean;
  otherSessionsRevoked: number;
}

const MIN_LEN = 8;
const MAX_LEN = 128;

export const changePassword = api(
  { expose: true, auth: true, method: "POST", path: "/settings/password" },
  async (req: ChangePasswordRequest): Promise<ChangePasswordResponse> => {
    const { userID } = getAuthData()!;

    if (typeof req.currentPassword !== "string" || typeof req.newPassword !== "string") {
      throw APIError.invalidArgument("currentPassword and newPassword are required");
    }
    if (req.newPassword.length < MIN_LEN || req.newPassword.length > MAX_LEN) {
      throw APIError.invalidArgument(`newPassword must be ${MIN_LEN}-${MAX_LEN} characters`);
    }
    if (req.newPassword === req.currentPassword) {
      throw APIError.invalidArgument("new password must differ from current password");
    }

    const user = await getUserRepo().findCredentialsById(userID);
    if (!user) throw APIError.notFound("user not found");

    const ok = await verifyPassword(user.passwordHash, req.currentPassword);
    if (!ok) {
      await safeRecordAuthEvent({
        userId: user.id,
        username: user.username,
        eventType: "password_change",
        success: false,
        reason: "invalid current password",
      });
      throw APIError.unauthenticated("current password is incorrect");
    }

    await getUserRepo().updatePasswordHash(userID, await hashPassword(req.newPassword));

    const current = await getSessionRepo().findCurrentForUser(userID);
    const revoked = current
      ? await getSessionRepo().revokeOthersForUser(userID, current.jti)
      : await (async () => {
          await getSessionRepo().revokeAllForUser(userID);
          return 0;
        })();

    await safeRecordAuthEvent({
      userId: user.id,
      username: user.username,
      eventType: "password_change",
      success: true,
    });

    return { ok: true, otherSessionsRevoked: revoked };
  },
);
