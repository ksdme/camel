import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { secret } from "encore.dev/config";

const jwtSigningSecret = secret("JWT_SIGNING_SECRET");
const ACCESS_TOKEN_TTL = "15m";

export interface AccessTokenPayload {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === "string" &&
    typeof payload.jti === "string" &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number" &&
    payload.typ !== "refresh"
  );
}

export function issueAccessToken(userId: string): string {
  return jwt.sign(
    { sub: userId, jti: randomBytes(16).toString("hex") },
    jwtSigningSecret(),
    { algorithm: "HS256", expiresIn: ACCESS_TOKEN_TTL },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, jwtSigningSecret(), {
    algorithms: ["HS256"],
  });

  if (!isAccessTokenPayload(decoded)) {
    throw new Error("invalid token payload");
  }

  return decoded;
}
