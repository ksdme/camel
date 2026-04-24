import { api, APIError } from "encore.dev/api";
import { Prisma } from "@prisma/client";
import { MinLen, MaxLen, MatchesRegexp } from "encore.dev/validate";
import { prisma } from "../lib/db";
import { hashPassword, verifyPassword } from "./password";
import { issueAccessToken } from "./tokens";

interface LoginRequest {
  username: string &
    (MinLen<3> & MaxLen<32> & MatchesRegexp<"^[a-zA-Z0-9_]+$">);
  password: string & (MinLen<8> & MaxLen<128>);
}

interface PublicUser {
  id: string;
  username: string;
  createdAt: Date;
}

interface LoginResponse {
  token: string;
  user: PublicUser;
  created: boolean;
}

function isUniqueUsernameError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (err.code !== "P2002") {
    return false;
  }

  const target = err.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("username");
  }
  return typeof target === "string" && target.includes("username");
}

// POST /auth/login
// Combined signin + signup. If the username doesn't exist, a new user is
// created with the supplied password; otherwise the password is verified
// against the stored Argon2id hash. Either path returns a signed JWT.
export const login = api(
  { expose: true, method: "POST", path: "/auth/login" },
  async ({ username, password }: LoginRequest): Promise<LoginResponse> => {
    const existing = await prisma.user.findUnique({ where: { username } });

    if (!existing) {
      const passwordHash = await hashPassword(password);
      try {
        const user = await prisma.user.create({
          data: { username, passwordHash },
          select: { id: true, username: true, createdAt: true },
        });
        return {
          token: issueAccessToken(user.id),
          user,
          created: true,
        };
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
          throw APIError.unauthenticated("invalid username or password");
        }

        return {
          token: issueAccessToken(winner.id),
          user: {
            id: winner.id,
            username: winner.username,
            createdAt: winner.createdAt,
          },
          created: false,
        };
      }

    }

    const ok = await verifyPassword(existing.passwordHash, password);
    if (!ok) {
      throw APIError.unauthenticated("invalid username or password");
    }

    return {
      token: issueAccessToken(existing.id),
      user: {
        id: existing.id,
        username: existing.username,
        createdAt: existing.createdAt,
      },
      created: false,
    };
  },
);
