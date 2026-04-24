import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { prisma } from "../../../lib/db";
import { safeRecordAuthEvent } from "../../services/auth/audit";
import { hashPassword, verifyPassword } from "../../services/auth/password";
import { revokeOtherRefreshTokensForUser } from "../../services/auth/refresh";

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

    if (
      typeof req.currentPassword !== "string" ||
      typeof req.newPassword !== "string"
    ) {
      throw APIError.invalidArgument("currentPassword and newPassword are required");
    }
    if (req.newPassword.length < MIN_LEN || req.newPassword.length > MAX_LEN) {
      throw APIError.invalidArgument(
        `newPassword must be ${MIN_LEN}-${MAX_LEN} characters`,
      );
    }
    if (req.newPassword === req.currentPassword) {
      throw APIError.invalidArgument("new password must differ from current password");
    }

    const user = await prisma.user.findUnique({
      where: { id: userID },
      select: { id: true, username: true, passwordHash: true },
    });
    if (!user) {
      throw APIError.notFound("user not found");
    }

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

    const newHash = await hashPassword(req.newPassword);
    await prisma.user.update({
      where: { id: userID },
      data: { passwordHash: newHash },
    });

    const currentSession = await prisma.refreshToken.findFirst({
      where: { userId: userID, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
      select: { jti: true },
    });

    let revoked = 0;
    if (currentSession) {
      revoked = await revokeOtherRefreshTokensForUser(userID, currentSession.jti);
    } else {
      const result = await prisma.refreshToken.updateMany({
        where: { userId: userID, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      revoked = result.count;
    }

    await safeRecordAuthEvent({
      userId: user.id,
      username: user.username,
      eventType: "password_change",
      success: true,
    });

    return { ok: true, otherSessionsRevoked: revoked };
  },
);
