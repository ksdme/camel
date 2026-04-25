import { APIError, api } from "encore.dev/api";
import { getUserRepo } from "@/main/repos";
import type { UserProfile } from "@/main/types";
import { getAuthData } from "~encore/auth";

// GET /auth/me
export const me = api(
  { expose: true, auth: true, method: "GET", path: "/auth/me" },
  async (): Promise<UserProfile> => {
    const { userID } = getAuthData()!;
    const user = await getUserRepo().findById(userID);
    if (!user) throw APIError.notFound("user not found");
    return user;
  },
);
