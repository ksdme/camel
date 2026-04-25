import { randomBytes } from "node:crypto";
import { secret } from "encore.dev/config";
import jwt from "jsonwebtoken";

const jwtSigningSecret = secret("JWT_SIGNING_SECRET");
const REFRESH_TOKEN_TTL = "30d";

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  typ: "refresh";
}

export interface DeviceMeta {
  userAgent?: string;
  ipAddress?: string;
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
  const token = jwt.sign({ sub: userId, jti, typ: "refresh" }, jwtSigningSecret(), {
    algorithm: "HS256",
    expiresIn: REFRESH_TOKEN_TTL,
  });
  const decoded = jwt.decode(token);
  if (!isRefreshTokenPayload(decoded)) {
    throw new Error("failed to issue refresh token");
  }
  return { token, payload: decoded };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, jwtSigningSecret(), { algorithms: ["HS256"] });
  if (!isRefreshTokenPayload(decoded)) {
    throw new Error("invalid refresh token payload");
  }
  return decoded;
}
