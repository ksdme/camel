import { api, APIError } from "encore.dev/api";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Prisma, prisma } from "../../../lib/db";
import { safeRecordAuthEvent } from "../../services/auth/audit";
import { hashPassword, verifyPassword } from "../../services/auth/password";
import { issueRefreshToken, storeRefreshToken } from "../../services/auth/refresh";
import { issueAccessToken } from "../../services/auth/tokens";
import { applyCors } from "../../utils/cors";
import { readJsonBody, sendApiError, sendJson, setAuthCookies } from "../../utils/cookies";
import { requestMetaFromIncomingMessage } from "../../utils/request_meta";

interface PublicUser {
  id: string;
  username: string;
  createdAt: Date;
}

interface LoginResponse {
  user: PublicUser;
  created: boolean;
}

async function issueSessionTokens(
  userId: string,
  device: { userAgent?: string; ipAddress?: string },
): Promise<{ token: string; refreshToken: string }> {
  const token = issueAccessToken(userId);
  const refresh = issueRefreshToken(userId);
  await storeRefreshToken(userId, refresh.payload, device);
  return { token, refreshToken: refresh.token };
}

function isUniqueUsernameError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  const prismaErr = err as Prisma.PrismaClientKnownRequestError;

  if (prismaErr.code !== "P2002") {
    return false;
  }

  const target = prismaErr.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("username");
  }
  return typeof target === "string" && target.includes("username");
}

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

function validateLoginBody(
  body: unknown,
): { username: string; password: string } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "request body must be a JSON object" };
  }
  const { username, password } = body as Record<string, unknown>;
  if (
    typeof username !== "string" ||
    username.length < 3 ||
    username.length > 32 ||
    !USERNAME_RE.test(username)
  ) {
    return { error: "username: 3-32 alphanumeric/underscore characters required" };
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return { error: "password: must be 8-128 characters" };
  }
  return { username, password };
}

// POST /auth/login
// Combined signin + signup. Sets HttpOnly auth cookies on success.
export const login = api.raw(
  { expose: true, method: "POST", path: "/auth/login" },
  async (req: IncomingMessage, res: ServerResponse) => {
    if (applyCors(req, res)) return;

    const reqMeta = requestMetaFromIncomingMessage(req);

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendApiError(res, err as APIError);
      return;
    }

    const validated = validateLoginBody(body);
    if ("error" in validated) {
      sendJson(res, 400, { code: "invalid_argument", message: validated.error });
      return;
    }
    const { username, password } = validated;

    try {
    const existing = await prisma.user.findUnique({ where: { username } });

    if (!existing) {
      const passwordHash = await hashPassword(password);
      try {
        const user = await prisma.user.create({
          data: { username, passwordHash },
          select: { id: true, username: true, createdAt: true },
        });
        const session = await issueSessionTokens(user.id, reqMeta);
        await safeRecordAuthEvent({
          userId: user.id,
          username: user.username,
          eventType: "login",
          success: true,
          ipAddress: reqMeta.ipAddress,
          userAgent: reqMeta.userAgent,
        });
        setAuthCookies(res, session.token, session.refreshToken);
        const response: LoginResponse = { user, created: true };
        sendJson(res, 200, response);
        return;
      } catch (err) {
        if (!isUniqueUsernameError(err)) {
          throw err;
        }

        // Another concurrent request created the same username first.
        const winner = await prisma.user.findUnique({ where: { username } });
        if (!winner) {
          throw APIError.unavailable("login conflict, please retry");
        }

        const ok = await verifyPassword(winner.passwordHash, password);
        if (!ok) {
          await safeRecordAuthEvent({
            userId: winner.id,
            username,
            eventType: "login",
            success: false,
            reason: "invalid username or password",
            ipAddress: reqMeta.ipAddress,
            userAgent: reqMeta.userAgent,
          });
          throw APIError.unauthenticated("invalid username or password");
        }

        const session = await issueSessionTokens(winner.id, reqMeta);
        await safeRecordAuthEvent({
          userId: winner.id,
          username,
          eventType: "login",
          success: true,
          ipAddress: reqMeta.ipAddress,
          userAgent: reqMeta.userAgent,
        });

        setAuthCookies(res, session.token, session.refreshToken);
        const response: LoginResponse = {
          user: { id: winner.id, username: winner.username, createdAt: winner.createdAt },
          created: false,
        };
        sendJson(res, 200, response);
        return;
      }
    }

    const ok = await verifyPassword(existing.passwordHash, password);
    if (!ok) {
      await safeRecordAuthEvent({
        userId: existing.id,
        username,
        eventType: "login",
        success: false,
        reason: "invalid username or password",
        ipAddress: reqMeta.ipAddress,
        userAgent: reqMeta.userAgent,
      });
      sendJson(res, 401, { code: "unauthenticated", message: "invalid username or password" });
      return;
    }

    const session = await issueSessionTokens(existing.id, reqMeta);
    await safeRecordAuthEvent({
      userId: existing.id,
      username,
      eventType: "login",
      success: true,
      ipAddress: reqMeta.ipAddress,
      userAgent: reqMeta.userAgent,
    });

    setAuthCookies(res, session.token, session.refreshToken);
    const response: LoginResponse = {
      user: { id: existing.id, username: existing.username, createdAt: existing.createdAt },
      created: false,
    };
    sendJson(res, 200, response);
    } catch (err) {
      if (err instanceof APIError) {
        sendApiError(res, err);
      } else {
        sendJson(res, 500, { code: "internal", message: "internal server error" });
      }
    }
  },
);
