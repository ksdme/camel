import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { Prisma, prisma } from "../../../lib/db";
import type { UserProfile } from "../../types";

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

export const updateProfile = api(
  { expose: true, auth: true, method: "PATCH", path: "/settings/profile" },
  async (req: UpdateProfileRequest): Promise<UserProfile> => {
    const { userID } = getAuthData()!;

    const data: Prisma.UserUpdateInput = {};

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
      const user = await prisma.user.update({
        where: { id: userID },
        data,
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          createdAt: true,
        },
      });
      return user;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw APIError.alreadyExists("email already in use");
      }
      throw err;
    }
  },
);
