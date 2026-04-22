import { api, APIError } from "encore.dev/api";
import { MinLen, MaxLen, MatchesRegexp } from "encore.dev/validate";
import { prisma } from "./db";
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
      const user = await prisma.user.create({
        data: { username, passwordHash },
        select: { id: true, username: true, createdAt: true },
      });
      return {
        token: issueAccessToken(user.id),
        user,
        created: true,
      };
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
