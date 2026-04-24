import { APIError, Gateway, Header } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { tokenBlocklist } from "./cache";
import { isRevokedBlocklistValue } from "./revocation";
import { verifyAccessToken } from "./tokens";

interface AuthParams {
  authorization?: Header<"Authorization">;
}

export interface AuthData {
  userID: string;
  jti: string;
  exp: number;
}

// Validates the `Authorization: Bearer <jwt>` header on every request that
// hits an endpoint with `auth: true`. Verifies the JWT signature, then
// checks the blocklist so revoked tokens (after /auth/logout) are rejected
// before their natural expiry. DB look-ups stay in endpoint handlers.
export const authenticate = authHandler<AuthParams, AuthData>(
  async ({ authorization }): Promise<AuthData> => {
    const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
    if (!match) {
      throw APIError.unauthenticated("missing or malformed Authorization header");
    }

    let payload;
    try {
      payload = verifyAccessToken(match[1]);
    } catch {
      throw APIError.unauthenticated("invalid or expired token");
    }

    if (isRevokedBlocklistValue(await tokenBlocklist.get({ jti: payload.jti }))) {
      throw APIError.unauthenticated("token revoked");
    }

    return { userID: payload.sub, jti: payload.jti, exp: payload.exp };
  },
);

export const gateway = new Gateway({ authHandler: authenticate });
