import { APIError, api } from "encore.dev/api";
import { Prisma } from "@/lib/db";
import { getUserRepo } from "@/main/repos";
import type { UserProfile } from "@/main/types";
import { getAuthData } from "~encore/auth";

interface UpdateProfileRequest {
  email?: string | null;
  displayName?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_MAX = 64;
const EMAIL_MAX = 254;

export const getProfile = api(
  { expose: true, auth: true, method: "GET", path: "/settings/profile" },
  async (): Promise<UserProfile> => {
    const { userID } = getAuthData()!;
    const user = await getUserRepo().findById(userID);
    if (!user) throw APIError.notFound("user not found");
    return user;
  },
);

export const updateProfile = api(
  { expose: true, auth: true, method: "PATCH", path: "/settings/profile" },
  async (req: UpdateProfileRequest): Promise<UserProfile> => {
    const { userID } = getAuthData()!;

    const data: { email?: string | null; displayName?: string | null } = {};

    if (req.email !== undefined) {
      if (req.email === null || req.email === "") {
        data.email = null;
      } else {
        const trimmed = req.email.trim().toLowerCase();
        if (trimmed.length > EMAIL_MAX || !EMAIL_RE.test(trimmed)) {
          throw APIError.invalidArgument("email must be a valid address");
        }
        data.email = trimmed;
      }
    }

    if (req.displayName !== undefined) {
      if (req.displayName === null || req.displayName === "") {
        data.displayName = null;
      } else {
        const trimmed = req.displayName.trim();
        if (trimmed.length > DISPLAY_NAME_MAX) {
          throw APIError.invalidArgument(
            `displayName must be ${DISPLAY_NAME_MAX} characters or fewer`,
          );
        }
        data.displayName = trimmed;
      }
    }

    try {
      return await getUserRepo().updateProfile(userID, data);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw APIError.alreadyExists("email already in use");
      }
      throw err;
    }
  },
);
