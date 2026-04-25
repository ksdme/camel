import { getEventLogRepo } from "@/main/repos";

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

export async function safeRecordAuthEvent(input: AuthEventInput): Promise<void> {
  try {
    await getEventLogRepo().record(input);
    await getEventLogRepo().pruneExpired(AUTH_EVENT_RETENTION_DAYS);
  } catch {
    // Audit writes are best effort and must not block auth flows.
  }
}
