import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/db";

interface AuthEventItem {
  id: string;
  eventType: string;
  success: boolean;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

interface EventLogsResponse {
  events: AuthEventItem[];
  retentionDays: number;
}

const AUTH_EVENT_RETENTION_DAYS = 15;
const MAX_EVENTS = 100;

// GET /settings/event_logs
// Returns the caller's auth events from the last 15 days, newest first.
export const eventLogs = api(
  { expose: true, auth: true, method: "GET", path: "/settings/event_logs" },
  async (): Promise<EventLogsResponse> => {
    const { userID } = getAuthData()!;
    const user = await prisma.user.findUnique({
      where: { id: userID },
      select: { username: true },
    });
    if (!user) {
      throw APIError.notFound("user not found");
    }

    const cutoff = new Date(Date.now() - AUTH_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const events = await prisma.$queryRaw<AuthEventItem[]>(
      Prisma.sql`
        SELECT
          "id",
          "eventType",
          "success",
          "reason",
          "ipAddress",
          "userAgent",
          "createdAt"
        FROM "auth_events"
        WHERE "createdAt" >= ${cutoff}
          AND (
            "userId" = ${userID}
            OR ("userId" IS NULL AND "username" = ${user.username})
          )
        ORDER BY "createdAt" DESC
        LIMIT ${MAX_EVENTS}
      `,
    );

    return { events, retentionDays: AUTH_EVENT_RETENTION_DAYS };
  },
);