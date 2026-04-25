import { randomUUID } from "node:crypto";
import { type DbClient, Prisma, prisma } from "@/lib/db";
import type { AuthEventItem } from "@/main/types";

export interface ListEventLogsOptions {
  userId: string;
  username: string;
  page: number;
  pageSize: number;
  offset: number;
  retentionDays: number;
}

export interface EventLogsPage {
  events: AuthEventItem[];
  total: number;
}

export interface RecordEventInput {
  userId?: string;
  username?: string;
  eventType: string;
  success: boolean;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface AuthEventRow {
  id: string;
  eventType: string;
  success: boolean | number;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface IEventLogRepo {
  listPaginated(opts: ListEventLogsOptions): Promise<EventLogsPage>;
  record(input: RecordEventInput): Promise<void>;
  pruneExpired(retentionDays: number): Promise<void>;
}

class EventLogRepoImpl implements IEventLogRepo {
  constructor(private readonly db: DbClient) {}

  async record(input: RecordEventInput): Promise<void> {
    await this.db.$executeRaw(
      Prisma.sql`
        INSERT INTO "auth_events"
        ("id", "userId", "username", "eventType", "success", "reason", "ipAddress", "userAgent", "createdAt")
        VALUES
        (${randomUUID()}, ${input.userId ?? null}, ${input.username ?? null}, ${input.eventType}, ${input.success ? 1 : 0}, ${input.reason ?? null}, ${input.ipAddress ?? null}, ${input.userAgent ?? null}, CURRENT_TIMESTAMP)
      `,
    );
  }

  async pruneExpired(retentionDays: number): Promise<void> {
    await this.db.$executeRaw(
      Prisma.sql`
        DELETE FROM "auth_events"
        WHERE "createdAt" < DATETIME('now', ${`-${retentionDays} days`})
      `,
    );
  }

  async listPaginated(opts: ListEventLogsOptions): Promise<EventLogsPage> {
    const cutoff = new Date(Date.now() - opts.retentionDays * 24 * 60 * 60 * 1000);

    const whereSql = Prisma.sql`
      "createdAt" >= ${cutoff}
      AND (
        "userId" = ${opts.userId}
        OR ("userId" IS NULL AND "username" = ${opts.username})
      )
    `;

    const [rawEvents, totalRows] = await Promise.all([
      this.db.$queryRaw<AuthEventRow[]>(
        Prisma.sql`
          SELECT "id", "eventType", "success", "reason", "ipAddress", "userAgent", "createdAt"
          FROM "auth_events"
          WHERE ${whereSql}
          ORDER BY "createdAt" DESC
          LIMIT ${opts.pageSize}
          OFFSET ${opts.offset}
        `,
      ),
      this.db.$queryRaw<{ c: number | bigint }[]>(
        Prisma.sql`SELECT COUNT(*) AS c FROM "auth_events" WHERE ${whereSql}`,
      ),
    ]);

    return {
      events: rawEvents.map((row) => ({ ...row, success: Boolean(row.success) })),
      total: Number(totalRows[0]?.c ?? 0),
    };
  }
}

export function createEventLogRepo(db: DbClient): IEventLogRepo {
  return new EventLogRepoImpl(db);
}

let _eventLogRepo: IEventLogRepo | undefined;
export function getEventLogRepo(): IEventLogRepo {
  return (_eventLogRepo ??= createEventLogRepo(prisma));
}
