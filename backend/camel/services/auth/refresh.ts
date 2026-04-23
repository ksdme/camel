import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { secret } from "encore.dev/config";
import { prisma } from "../../../lib/db";

const jwtSigningSecret = secret("JWT_SIGNING_SECRET");
const REFRESH_TOKEN_TTL = "30d";

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  typ: "refresh";
}

function isRefreshTokenPayload(value: unknown): value is RefreshTokenPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === "string" &&
    typeof payload.jti === "string" &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number" &&
    payload.typ === "refresh"
  );
}

export function issueRefreshToken(userId: string): {
  token: string;
  payload: RefreshTokenPayload;
} {
  const jti = randomBytes(16).toString("hex");
  const token = jwt.sign(
    { sub: userId, jti, typ: "refresh" },
    jwtSigningSecret(),
    { algorithm: "HS256", expiresIn: REFRESH_TOKEN_TTL },
  );

  const decoded = jwt.decode(token);
  if (!isRefreshTokenPayload(decoded)) {
    throw new Error("failed to issue refresh token");
  }

  return { token, payload: decoded };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, jwtSigningSecret(), {
    algorithms: ["HS256"],
  });

  if (!isRefreshTokenPayload(decoded)) {
    throw new Error("invalid refresh token payload");
  }

  return decoded;
}

export async function storeRefreshToken(
  userId: string,
  payload: RefreshTokenPayload,
): Promise<void> {
  await prisma.refreshToken.create({
    data: {
      userId,
      jti: payload.jti,
      expiresAt: new Date(payload.exp * 1000),
    },
  });
}

export async function revokeRefreshToken(jti: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function isActiveRefreshToken(jti: string, userId: string): Promise<boolean> {
  const token = await prisma.refreshToken.findFirst({
    where: {
      jti,
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { jti: true },
  });

  return token !== null;
}

export async function rotateRefreshToken(
  oldJti: string,
  userId: string,
  nextPayload: RefreshTokenPayload,
): Promise<void> {
  await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: { jti: oldJti, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId,
        jti: nextPayload.jti,
        expiresAt: new Date(nextPayload.exp * 1000),
      },
    }),
  ]);
}