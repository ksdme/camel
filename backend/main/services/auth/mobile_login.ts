import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { APIError, api } from "encore.dev/api";
import { expireIn } from "encore.dev/storage/cache";
import { prisma } from "@/lib/db";
import type { PublicUser } from "@/main/types";
import { safeRecordAuthEvent } from "@/main/utils/auth/audit";
import { mobileLoginTokens } from "@/main/utils/auth/cache";
import { readJsonBody, sendApiError, sendJson, setAuthCookies } from "@/main/utils/cookies";
import { requestMetaFromIncomingMessage } from "@/main/utils/request_meta";
import { getAuthData } from "~encore/auth";
import { issueSessionTokens } from "./session";

const MOBILE_LOGIN_TOKEN_TTL_MS = 5 * 60 * 1000;

interface MobileLoginTokenResponse {
  token: string;
  expiresInSec: number;
}

interface MobileLoginConsumeRequest {
  token: string;
}

interface MobileLoginTokenPayload {
  userId: string;
  username: string;
}

function createOneTimeToken() {
  return randomBytes(24).toString("base64url");
}

function parseConsumeBody(body: unknown): MobileLoginConsumeRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const token = (body as Record<string, unknown>).token;
  if (typeof token !== "string" || !token.trim()) return null;
  return { token: token.trim() };
}

export const createMobileLoginToken = api(
  { expose: true, auth: true, method: "POST", path: "/auth/mobile-login-token" },
  async (): Promise<MobileLoginTokenResponse> => {
    const { userID } = getAuthData()!;
    const user = await prisma.user.findUnique({
      where: { id: userID },
      select: { id: true, username: true },
    });

    if (!user) {
      throw APIError.notFound("user not found");
    }

    const token = createOneTimeToken();
    const payload: MobileLoginTokenPayload = {
      userId: user.id,
      username: user.username,
    };

    await mobileLoginTokens.set({ token }, JSON.stringify(payload), {
      expiry: expireIn(MOBILE_LOGIN_TOKEN_TTL_MS),
    });

    return {
      token,
      expiresInSec: Math.floor(MOBILE_LOGIN_TOKEN_TTL_MS / 1000),
    };
  },
);

export const consumeMobileLoginToken = api.raw(
  { expose: true, method: "POST", path: "/auth/mobile-login/consume" },
  async (req: IncomingMessage, res: ServerResponse) => {
    const reqMeta = requestMetaFromIncomingMessage(req);

    try {
      const body = await readJsonBody(req);
      const parsed = parseConsumeBody(body);
      if (!parsed) {
        sendJson(res, 400, { code: "invalid_argument", message: "token is required" });
        return;
      }

      const cached = await mobileLoginTokens.get({ token: parsed.token });
      if (!cached) {
        sendJson(res, 401, {
          code: "unauthenticated",
          message: "mobile login token is invalid or expired",
        });
        return;
      }

      const deleted = await mobileLoginTokens.delete({ token: parsed.token });
      if (deleted === 0) {
        sendJson(res, 401, {
          code: "unauthenticated",
          message: "mobile login token has already been used",
        });
        return;
      }

      const payload = JSON.parse(cached) as Partial<MobileLoginTokenPayload>;
      if (typeof payload.userId !== "string" || typeof payload.username !== "string") {
        sendJson(res, 401, { code: "unauthenticated", message: "mobile login token is invalid" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, username: true, createdAt: true },
      });
      if (!user) {
        sendJson(res, 404, { code: "not_found", message: "user not found" });
        return;
      }

      const session = await issueSessionTokens(user.id, reqMeta);
      await safeRecordAuthEvent({
        userId: user.id,
        username: user.username,
        eventType: "login",
        success: true,
        reason: "mobile_qr",
        ipAddress: reqMeta.ipAddress,
        userAgent: reqMeta.userAgent,
      });

      setAuthCookies(res, session.token, session.refreshToken);
      sendJson(res, 200, { user, created: false } satisfies { user: PublicUser; created: boolean });
    } catch (err) {
      if (err instanceof APIError) {
        sendApiError(res, err);
      } else {
        sendJson(res, 500, { code: "internal", message: "internal server error" });
      }
    }
  },
);
