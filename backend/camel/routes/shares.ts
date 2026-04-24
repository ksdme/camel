import { randomBytes, randomUUID } from "node:crypto";
import { api, APIError, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { Prisma, prisma } from "../../lib/db";

type ShareKind = "note" | "folder";
type AccessLevel = "view" | "edit";

interface ShareRow {
  id: string;
  ownerId: string;
  kind: string;
  targetId: string;
  recipientEmail: string;
  accessLevel: string;
  token: string;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShareItem {
  id: string;
  ownerId: string;
  kind: ShareKind;
  targetId: string;
  targetTitle: string;
  recipientEmail: string;
  targetContent?: string;
  targetPlainText?: string;
  accessLevel: AccessLevel;
  token: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ListSharesRequest {
  filter?: Query<string>;
}

interface ListSharesResponse {
  shares: ShareItem[];
}

interface CreateShareRequest {
  kind: string;
  targetId: string;
  recipientEmail?: string;
  accessLevel?: string;
}

interface UpdateShareRequest {
  accessLevel?: string;
}

const EMAIL_MAX = 320;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRequiredId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw APIError.invalidArgument(`${fieldName} is required`);
  }
  return value.trim();
}

function normalizeKind(value: unknown): ShareKind {
  if (value !== "note" && value !== "folder") {
    throw APIError.invalidArgument('kind must be "note" or "folder"');
  }
  return value;
}

function normalizeAccessLevel(value: unknown, fallback: AccessLevel = "view"): AccessLevel {
  if (value === undefined || value === null) return fallback;
  if (value !== "view" && value !== "edit") {
    throw APIError.invalidArgument('accessLevel must be "view" or "edit"');
  }
  return value;
}

function normalizeEmail(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw APIError.invalidArgument("recipientEmail must be a string");
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length > EMAIL_MAX || !EMAIL_RE.test(trimmed)) {
    throw APIError.invalidArgument("recipientEmail must be a valid address");
  }
  return trimmed;
}

function generateToken(): string {
  return randomBytes(12).toString("base64url");
}

async function ensureTargetBelongsToOwner(
  ownerId: string,
  kind: ShareKind,
  targetId: string,
): Promise<void> {
  if (kind === "note") {
    const rows = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "notes" WHERE "id" = ${targetId} AND "userId" = ${ownerId} AND "deletedAt" IS NULL LIMIT 1`,
    );
    if (rows.length === 0) throw APIError.notFound("note not found");
    return;
  }
  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM "folders" WHERE "id" = ${targetId} AND "userId" = ${ownerId} LIMIT 1`,
  );
  if (rows.length === 0) throw APIError.notFound("folder not found");
}

async function hydrateTargetTitles(rows: ShareRow[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const noteIds = Array.from(new Set(rows.filter((r) => r.kind === "note").map((r) => r.targetId)));
  const folderIds = Array.from(new Set(rows.filter((r) => r.kind === "folder").map((r) => r.targetId)));

  if (noteIds.length > 0) {
    const r = await prisma.$queryRaw<{ id: string; title: string }[]>(
      Prisma.sql`SELECT "id", "title" FROM "notes" WHERE "id" IN (${Prisma.join(noteIds)})`,
    );
    for (const { id, title } of r) titles.set(`note:${id}`, title);
  }
  if (folderIds.length > 0) {
    const r = await prisma.$queryRaw<{ id: string; name: string }[]>(
      Prisma.sql`SELECT "id", "name" FROM "folders" WHERE "id" IN (${Prisma.join(folderIds)})`,
    );
    for (const { id, name } of r) titles.set(`folder:${id}`, name);
  }
  return titles;
}

function toShareItem(
  row: ShareRow,
  titles: Map<string, string>,
  noteData?: { content: string; plainText: string },
): ShareItem {
  return {
    id: row.id,
    ownerId: row.ownerId,
    kind: row.kind as ShareKind,
    targetId: row.targetId,
    targetTitle: titles.get(`${row.kind}:${row.targetId}`) ?? "(deleted)",
    recipientEmail: row.recipientEmail,
    targetContent: noteData?.content,
    targetPlainText: noteData?.plainText,
    accessLevel: row.accessLevel as AccessLevel,
    token: row.token,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getShareForOwner(ownerId: string, id: string): Promise<ShareRow> {
  const rows = await prisma.$queryRaw<ShareRow[]>(
    Prisma.sql`
      SELECT "id", "ownerId", "kind", "targetId", "recipientEmail", "accessLevel", "token", "revokedAt", "createdAt", "updatedAt"
      FROM "shares"
      WHERE "id" = ${id} AND "ownerId" = ${ownerId} AND "revokedAt" IS NULL
      LIMIT 1
    `,
  );
  if (rows.length === 0) throw APIError.notFound("share not found");
  return rows[0];
}

export const listShares = api(
  { expose: true, auth: true, method: "GET", path: "/shares" },
  async (req: ListSharesRequest): Promise<ListSharesResponse> => {
    const { userID } = getAuthData()!;
    const filter = req.filter ?? "by-me";
    if (filter !== "by-me" && filter !== "with-me") {
      throw APIError.invalidArgument('filter must be "by-me" or "with-me"');
    }

    let rows: ShareRow[];
    if (filter === "by-me") {
      rows = await prisma.$queryRaw<ShareRow[]>(
        Prisma.sql`
          SELECT "id", "ownerId", "kind", "targetId", "recipientEmail", "accessLevel", "token", "revokedAt", "createdAt", "updatedAt"
          FROM "shares"
          WHERE "ownerId" = ${userID} AND "revokedAt" IS NULL
          ORDER BY "createdAt" DESC
        `,
      );
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userID },
        select: { email: true },
      });
      if (!user?.email) {
        return { shares: [] };
      }
      rows = await prisma.$queryRaw<ShareRow[]>(
        Prisma.sql`
          SELECT "id", "ownerId", "kind", "targetId", "recipientEmail", "accessLevel", "token", "revokedAt", "createdAt", "updatedAt"
          FROM "shares"
          WHERE "recipientEmail" = ${user.email} AND "revokedAt" IS NULL
          ORDER BY "createdAt" DESC
        `,
      );
    }

    const titles = await hydrateTargetTitles(rows);
    return { shares: rows.map((row) => toShareItem(row, titles)) };
  },
);

function normalizeToken(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw APIError.invalidArgument("token is required");
  }
  return value.trim();
}

export const createShare = api(
  { expose: true, auth: true, method: "POST", path: "/shares" },
  async (req: CreateShareRequest): Promise<ShareItem> => {
    const { userID } = getAuthData()!;
    const kind = normalizeKind(req.kind);
    const targetId = normalizeRequiredId(req.targetId, "targetId");
    const recipientEmail = normalizeEmail(req.recipientEmail);
    const accessLevel = normalizeAccessLevel(req.accessLevel);

    await ensureTargetBelongsToOwner(userID, kind, targetId);

    const id = randomUUID();
    const token = generateToken();

    try {
      await prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO "shares" ("id", "ownerId", "kind", "targetId", "recipientEmail", "accessLevel", "token", "updatedAt")
          VALUES (${id}, ${userID}, ${kind}, ${targetId}, ${recipientEmail}, ${accessLevel}, ${token}, CURRENT_TIMESTAMP)
        `,
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw APIError.alreadyExists("already shared with this recipient");
      }
      throw err;
    }

    const created = await getShareForOwner(userID, id);
    const titles = await hydrateTargetTitles([created]);
    return toShareItem(created, titles);
  },
);

export const getShareByToken = api(
  { expose: true, auth: false, method: "GET", path: "/s/:token" },
  async (req: { token: string }): Promise<ShareItem> => {
    const token = normalizeToken(req.token);

    const rows = await prisma.$queryRaw<ShareRow[]>(
      Prisma.sql`
        SELECT "id", "ownerId", "kind", "targetId", "recipientEmail", "accessLevel", "token", "revokedAt", "createdAt", "updatedAt"
        FROM "shares"
        WHERE "token" = ${token} AND "revokedAt" IS NULL
        LIMIT 1
      `,
    );

    if (rows.length === 0) {
      throw APIError.notFound("share not found");
    }

    const [row] = rows;
    const titles = await hydrateTargetTitles([row]);

    let noteData: { content: string; plainText: string } | undefined;
    if (row.kind === "note") {
      const noteRows = await prisma.$queryRaw<{ content: string; plainText: string }[]>(
        Prisma.sql`
          SELECT "content", "plainText"
          FROM "notes"
          WHERE "id" = ${row.targetId}
          LIMIT 1
        `,
      );
      if (noteRows.length > 0) {
        noteData = noteRows[0];
      }
    }

    return toShareItem(row, titles, noteData);
  },
);

export const updateShare = api(
  { expose: true, auth: true, method: "PATCH", path: "/shares/:id" },
  async (req: UpdateShareRequest & { id: string }): Promise<ShareItem> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    const current = await getShareForOwner(userID, id);
    const accessLevel =
      req.accessLevel === undefined
        ? (current.accessLevel as AccessLevel)
        : normalizeAccessLevel(req.accessLevel);

    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "shares"
        SET "accessLevel" = ${accessLevel}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "ownerId" = ${userID}
      `,
    );

    const updated = await getShareForOwner(userID, id);
    const titles = await hydrateTargetTitles([updated]);
    return toShareItem(updated, titles);
  },
);

export const deleteShare = api(
  { expose: true, auth: true, method: "DELETE", path: "/shares/:id" },
  async (req: { id: string }): Promise<{ ok: boolean }> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    await getShareForOwner(userID, id);

    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM "shares" WHERE "id" = ${id} AND "ownerId" = ${userID}`,
    );

    return { ok: true };
  },
);

interface UpdateSharedNoteRequest {
  content: string;
  plainText: string;
}

export const updateSharedNote = api(
  { expose: true, auth: false, method: "PATCH", path: "/s/:token/note" },
  async (req: UpdateSharedNoteRequest & { token: string }): Promise<{ ok: boolean }> => {
    const token = normalizeToken(req.token);

    const rows = await prisma.$queryRaw<ShareRow[]>(
      Prisma.sql`
        SELECT "id", "ownerId", "kind", "targetId", "recipientEmail", "accessLevel", "token", "revokedAt", "createdAt", "updatedAt"
        FROM "shares"
        WHERE "token" = ${token} AND "revokedAt" IS NULL AND "kind" = 'note' AND "accessLevel" = 'edit'
        LIMIT 1
      `,
    );

    if (rows.length === 0) {
      throw APIError.notFound("share not found or does not allow editing");
    }

    const [row] = rows;

    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "notes"
        SET "content" = ${req.content}, "plainText" = ${req.plainText}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${row.targetId}
      `,
    );

    return { ok: true };
  },
);
