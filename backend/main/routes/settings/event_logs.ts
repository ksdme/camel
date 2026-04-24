import { api, APIError, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { Prisma, prisma } from "../../../lib/db";
import { normalizePagination } from "../../utils/pagination";

import type { AuthEventItem } from "../../types";

interface AuthEventRow {
  id: string;
  eventType: string;
  success: boolean | number;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

interface EventLogsRequest {
  page?: Query<number>;
  pageSize?: Query<number>;
}

interface EventLogsResponse {
  events: AuthEventItem[];
  retentionDays: number;
  page: number;
  pageSize: number;
  total: number;
}

const AUTH_EVENT_RETENTION_DAYS = 15;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export const eventLogs = api(
  { expose: true, auth: true, method: "GET", path: "/settings/event_logs" },
  async (req: EventLogsRequest): Promise<EventLogsResponse> => {
    const { userID } = getAuthData()!;
    const user = await prisma.user.findUnique({
      where: { id: userID },
      select: { username: true },
    });
    if (!user) {
      throw APIError.notFound("user not found");
    }

    const { page, pageSize, offset } = normalizePagination(req.page, req.pageSize, {
      defaultPageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
    });

    const cutoff = new Date(Date.now() - AUTH_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const whereSql = Prisma.sql`
      "createdAt" >= ${cutoff}
      AND (
        "userId" = ${userID}
        OR ("userId" IS NULL AND "username" = ${user.username})
      )
    `;

    const [rawEvents, totalRows] = await Promise.all([
      prisma.$queryRaw<AuthEventRow[]>(
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
          WHERE ${whereSql}
          ORDER BY "createdAt" DESC
          LIMIT ${pageSize}
          OFFSET ${offset}
        `,
      ),
      prisma.$queryRaw<{ c: number | bigint }[]>(
        Prisma.sql`SELECT COUNT(*) AS c FROM "auth_events" WHERE ${whereSql}`,
      ),
    ]);

    const events: AuthEventItem[] = rawEvents.map((row) => ({
      ...row,
      success: Boolean(row.success),
    }));

    const total = Number(totalRows[0]?.c ?? 0);

    return {
      events,
      retentionDays: AUTH_EVENT_RETENTION_DAYS,
      page,
      pageSize,
      total,
    };
  },
);
