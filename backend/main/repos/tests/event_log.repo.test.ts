import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  Prisma: { sql: vi.fn(), empty: null, join: vi.fn() },
  prisma: {},
}));

import { createEventLogRepo, getEventLogRepo } from "@/main/repos/event_log.repo";

const mockDb = {
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
} as any;

const repo = createEventLogRepo(mockDb);

const now = new Date();
const eventRow = {
  id: "e1",
  eventType: "login",
  success: 1,
  reason: null,
  ipAddress: "1.2.3.4",
  userAgent: "Mozilla",
  createdAt: now,
};

beforeEach(() => vi.clearAllMocks());

describe("EventLogRepo.record", () => {
  it("inserts an event with all fields", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    await repo.record({
      userId: "u1",
      username: "alice",
      eventType: "login",
      success: true,
      reason: undefined,
      ipAddress: "1.2.3.4",
      userAgent: "Mozilla",
    });
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });

  it("handles missing optional fields with nulls", async () => {
    mockDb.$executeRaw.mockResolvedValue(1);
    await repo.record({ eventType: "authenticate", success: false });
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });
});

describe("EventLogRepo.pruneExpired", () => {
  it("deletes events older than the retention window", async () => {
    mockDb.$executeRaw.mockResolvedValue(5);
    await repo.pruneExpired(30);
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });
});

describe("EventLogRepo.listPaginated", () => {
  it("returns events and total count", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([eventRow]) // events query
      .mockResolvedValueOnce([{ c: 1 }]); // count query

    const result = await repo.listPaginated({
      userId: "u1",
      username: "alice",
      page: 1,
      pageSize: 20,
      offset: 0,
      retentionDays: 30,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0].success).toBe(true);
    expect(result.total).toBe(1);
  });

  it("handles bigint count from database", async () => {
    mockDb.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ c: BigInt(42) }]);

    const result = await repo.listPaginated({
      userId: "u1",
      username: "alice",
      page: 1,
      pageSize: 20,
      offset: 0,
      retentionDays: 30,
    });

    expect(result.total).toBe(42);
  });

  it("returns total 0 when count row is missing", async () => {
    mockDb.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await repo.listPaginated({
      userId: "u1",
      username: "alice",
      page: 1,
      pageSize: 20,
      offset: 0,
      retentionDays: 30,
    });

    expect(result.total).toBe(0);
  });
});

describe("getEventLogRepo", () => {
  it("returns a singleton repo instance", () => {
    const r = getEventLogRepo();
    expect(r).toBeDefined();
    expect(getEventLogRepo()).toBe(r);
  });
});
