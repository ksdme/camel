import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "../../../lib/db";

const AUTH_EVENT_RETENTION_DAYS = 15;

export type AuthEventType =
  | "login"
  | "logout"
  | "refresh"
  | "authenticate"
  | "password_change"
  | "session_revoke"
  | "session_revoke_others"
  | "account_delete";

interface AuthEventInput {
  userId?: string;
  username?: string;
  eventType: AuthEventType;
  success: boolean;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function recordAuthEvent(input: AuthEventInput): Promise<void> {
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "auth_events"
      ("id", "userId", "username", "eventType", "success", "reason", "ipAddress", "userAgent", "createdAt")
      VALUES
      (${randomUUID()}, ${input.userId ?? null}, ${input.username ?? null}, ${input.eventType}, ${input.success ? 1 : 0}, ${input.reason ?? null}, ${input.ipAddress ?? null}, ${input.userAgent ?? null}, CURRENT_TIMESTAMP)
    `,
  );
}

export async function pruneExpiredAuthEvents(): Promise<void> {
  await prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM "auth_events"
      WHERE "createdAt" < DATETIME('now', ${`-${AUTH_EVENT_RETENTION_DAYS} days`})
    `,
  );
}

export async function safeRecordAuthEvent(input: AuthEventInput): Promise<void> {
  try {
    await recordAuthEvent(input);
    await pruneExpiredAuthEvents();
  } catch {
    // Audit writes are best effort and must not block auth flows.
  }
}
