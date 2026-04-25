import { type DbClient, prisma } from "@/lib/db";
import type { SessionItem } from "@/main/types";
import type { DeviceMeta, RefreshTokenPayload } from "@/main/utils/auth/refresh";

export interface ISessionRepo {
  store(userId: string, payload: RefreshTokenPayload, device?: DeviceMeta): Promise<void>;
  rotate(
    oldJti: string,
    userId: string,
    next: RefreshTokenPayload,
    device?: DeviceMeta,
  ): Promise<boolean>;
  revoke(jti: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  revokeOthersForUser(userId: string, keepJti: string): Promise<number>;
  revokeAllExceptCurrent(
    userId: string,
  ): Promise<{ revoked: number; signedOut: boolean; currentJti: string | null }>;
  isActive(jti: string, userId: string): Promise<boolean>;
  isRevokedButActive(jti: string, userId: string): Promise<boolean>;
  listActive(userId: string): Promise<Omit<SessionItem, "current">[]>;
  findByJtiAndUser(jti: string, userId: string): Promise<{ jti: string } | null>;
  findCurrentForUser(userId: string): Promise<{ jti: string } | null>;
}

class SessionRepoImpl implements ISessionRepo {
  constructor(private readonly db: DbClient) {}

  async store(
    userId: string,
    payload: RefreshTokenPayload,
    device: DeviceMeta = {},
  ): Promise<void> {
    await this.db.refreshToken.create({
      data: {
        userId,
        jti: payload.jti,
        expiresAt: new Date(payload.exp * 1000),
        userAgent: device.userAgent ?? null,
        ipAddress: device.ipAddress ?? null,
        lastUsedAt: new Date(),
      },
    });
  }

  async rotate(
    oldJti: string,
    userId: string,
    next: RefreshTokenPayload,
    device: DeviceMeta = {},
  ): Promise<boolean> {
    // $transaction is not on DbClient — use the injected prisma singleton for this.
    // If cross-repo transaction support is needed, callers should inject a tx client.
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { jti: oldJti, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) return false;
      await tx.refreshToken.create({
        data: {
          userId,
          jti: next.jti,
          expiresAt: new Date(next.exp * 1000),
          userAgent: device.userAgent ?? null,
          ipAddress: device.ipAddress ?? null,
          lastUsedAt: new Date(),
        },
      });
      return true;
    });
  }

  async revoke(jti: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeOthersForUser(userId: string, keepJti: string): Promise<number> {
    const result = await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null, NOT: { jti: keepJti } },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeAllExceptCurrent(
    userId: string,
  ): Promise<{ revoked: number; signedOut: boolean; currentJti: string | null }> {
    const current = await this.findCurrentForUser(userId);
    if (current) {
      const revoked = await this.revokeOthersForUser(userId, current.jti);
      return { revoked, signedOut: false, currentJti: current.jti };
    }
    const result = await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count, signedOut: true, currentJti: null };
  }

  async isActive(jti: string, userId: string): Promise<boolean> {
    const token = await this.db.refreshToken.findFirst({
      where: { jti, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { jti: true },
    });
    return token !== null;
  }

  async isRevokedButActive(jti: string, userId: string): Promise<boolean> {
    const token = await this.db.refreshToken.findFirst({
      where: { jti, userId, revokedAt: { not: null }, expiresAt: { gt: new Date() } },
      select: { jti: true },
    });
    return token !== null;
  }

  async listActive(userId: string): Promise<Omit<SessionItem, "current">[]> {
    return this.db.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
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
  }

  async findByJtiAndUser(jti: string, userId: string): Promise<{ jti: string } | null> {
    return this.db.refreshToken.findFirst({
      where: { jti, userId },
      select: { jti: true },
    });
  }

  async findCurrentForUser(userId: string): Promise<{ jti: string } | null> {
    return this.db.refreshToken.findFirst({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
      select: { jti: true },
    });
  }
}

export function createSessionRepo(db: DbClient): ISessionRepo {
  return new SessionRepoImpl(db);
}

let _sessionRepo: ISessionRepo | undefined;
export function getSessionRepo(): ISessionRepo {
  return (_sessionRepo ??= createSessionRepo(prisma));
}
