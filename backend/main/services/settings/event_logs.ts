import { APIError, api, type Query } from "encore.dev/api";
import { getEventLogRepo, getUserRepo } from "@/main/repos";
import type { AuthEventItem } from "@/main/types";
import { normalizePagination } from "@/main/utils/pagination";
import { getAuthData } from "~encore/auth";

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

    const username = await getUserRepo().findUsernameById(userID);
    if (!username) throw APIError.notFound("user not found");

    const { page, pageSize, offset } = normalizePagination(req.page, req.pageSize, {
      defaultPageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
    });

    const { events, total } = await getEventLogRepo().listPaginated({
      userId: userID,
      username,
      page,
      pageSize,
      offset,
      retentionDays: AUTH_EVENT_RETENTION_DAYS,
    });

    return { events, retentionDays: AUTH_EVENT_RETENTION_DAYS, page, pageSize, total };
  },
);
