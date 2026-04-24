import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { prisma } from "../../../lib/db";

interface MeResponse {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  createdAt: Date;
}

// GET /auth/me
// Returns the current user's public profile. Uses the access_token cookie
// (or Authorization header) resolved by the auth middleware.
export const me = api(
  { expose: true, auth: true, method: "GET", path: "/auth/me" },
  async (): Promise<MeResponse> => {
    const { userID } = getAuthData()!;
    const user = await prisma.user.findUnique({
      where: { id: userID },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw APIError.notFound("user not found");
    }
    return user;
  },
);
