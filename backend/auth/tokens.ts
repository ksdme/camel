import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { secret } from "encore.dev/config";

const jwtSigningSecret = secret("JWT_SIGNING_SECRET");

const ACCESS_TOKEN_TTL = "7d";

export interface AccessTokenPayload {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
}

export function issueAccessToken(userId: string): string {
  return jwt.sign(
    { sub: userId, jti: randomBytes(16).toString("hex") },
    jwtSigningSecret(),
    { algorithm: "HS256", expiresIn: ACCESS_TOKEN_TTL },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, jwtSigningSecret(), {
    algorithms: ["HS256"],
  }) as AccessTokenPayload;
}
