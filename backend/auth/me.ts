import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { prisma } from "./db";

interface MeResponse {
  id: string;
  username: string;
  createdAt: Date;
}

// GET /auth/me
// Protected test endpoint. Requires `Authorization: Bearer <jwt>` where the
// JWT came from POST /auth/login. Returns the current user's public profile.
export const me = api(
  { expose: true, auth: true, method: "GET", path: "/auth/me" },
  async (): Promise<MeResponse> => {
    const { userID } = getAuthData()!;
    const user = await prisma.user.findUnique({
      where: { id: userID },
      select: { id: true, username: true, createdAt: true },
    });
    if (!user) {
      throw APIError.notFound("user not found");
    }
    return user;
  },
);
