import { randomUUID } from "node:crypto";
import { api, APIError, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { Prisma, prisma } from "../../lib/db";
import { normalizeRequiredId, normalizeOptionalId } from "../utils/validation";
import type { NoteItem, TagItem } from "../types";

interface NoteRow {
  id: string;
  userId: string;
  folderId: string | null;
  title: string;
  content: string;
  plainText: string;
  isArchived: boolean | number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ListNotesRequest {
  folderId?: Query<string>;
  tagId?: Query<string>;
  archived?: Query<string>;
}

interface ListRecentNotesRequest {
  limit?: Query<number>;
}

interface ListNotesResponse {
  notes: NoteItem[];
}

interface CreateNoteRequest {
  id?: string;
  folderId?: string | null;
  title: string;
  content: string;
  plainText?: string;
  isArchived?: boolean;
}

interface UpdateNoteRequest {
  folderId?: string | null;
  title?: string;
  content?: string;
  plainText?: string;
  isArchived?: boolean;
}

const NOTE_TITLE_MAX = 200;
const NOTE_TEXT_MAX = 1_000_000;

function normalizeTitle(title: unknown): string {
  if (typeof title !== "string") {
    throw APIError.invalidArgument("title is required");
  }
  const trimmed = title.trim() || "Untitled";
  if (trimmed.length > NOTE_TITLE_MAX) {
    throw APIError.invalidArgument(`title must be ${NOTE_TITLE_MAX} characters or fewer`);
  }
  return trimmed;
}

function normalizeText(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw APIError.invalidArgument(`${fieldName} must be a string`);
  }
  if (value.length > NOTE_TEXT_MAX) {
    throw APIError.invalidArgument(`${fieldName} is too large`);
  }
  return value;
}

function normalizeContent(content: unknown): string {
  const text = normalizeText(content, "content");
  try {
    JSON.parse(text);
  } catch {
    throw APIError.invalidArgument("content must be valid JSON");
  }
  return text;
}

function normalizeBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw APIError.invalidArgument(`${fieldName} must be a boolean`);
  }
  return value;
}

function parseArchived(value: string | undefined): boolean | null {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  if (value === "all") return null;
  throw APIError.invalidArgument("archived must be true, false, or all");
}

function toNoteItem(row: NoteRow, tags: TagItem[]): NoteItem {
  return {
    ...row,
    isArchived: Boolean(row.isArchived),
    tags,
  };
}

async function ensureFolderBelongsToUser(userId: string, folderId: string | null): Promise<void> {
  if (folderId === null) return;

  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM "folders" WHERE "id" = ${folderId} AND "userId" = ${userId} LIMIT 1`,
  );
  if (rows.length === 0) {
    throw APIError.notFound("folder not found");
  }
}

async function ensureNoteIdAvailable(id: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM "notes" WHERE "id" = ${id} LIMIT 1`,
  );
  if (rows.length > 0) {
    throw APIError.alreadyExists("note already exists");
  }
}

async function getNoteRowForUser(userId: string, id: string): Promise<NoteRow> {
  const rows = await prisma.$queryRaw<NoteRow[]>(
    Prisma.sql`
      SELECT "id", "userId", "folderId", "title", "content", "plainText", "isArchived", "deletedAt", "createdAt", "updatedAt"
      FROM "notes"
      WHERE "id" = ${id} AND "userId" = ${userId}
      LIMIT 1
    `,
  );
  const note = rows[0];
  if (!note) {
    throw APIError.notFound("note not found");
  }
  return note;
}

async function loadTagsForNotes(userId: string, noteIds: string[]): Promise<Map<string, TagItem[]>> {
  const result = new Map<string, TagItem[]>();
  for (const noteId of noteIds) {
    result.set(noteId, []);
  }
  if (noteIds.length === 0) {
    return result;
  }

  const rows = await prisma.$queryRaw<(TagItem & { noteId: string })[]>(
    Prisma.sql`
      SELECT nt."noteId", t."id", t."userId", t."name", t."color", t."createdAt", t."updatedAt"
      FROM "note_tags" nt
      INNER JOIN "tags" t ON t."id" = nt."tagId"
      WHERE t."userId" = ${userId} AND nt."noteId" IN (${Prisma.join(noteIds)})
      ORDER BY LOWER(t."name") ASC, t."createdAt" ASC
    `,
  );

  for (const row of rows) {
    const tags = result.get(row.noteId);
    if (!tags) continue;
    tags.push({
      id: row.id,
      userId: row.userId,
      name: row.name,
      color: row.color,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  return result;
}

async function getNoteForUser(userId: string, id: string): Promise<NoteItem> {
  const row = await getNoteRowForUser(userId, id);
  const tagsByNote = await loadTagsForNotes(userId, [id]);
  return toNoteItem(row, tagsByNote.get(id) ?? []);
}

async function ensureTagsBelongToUser(userId: string, tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) return;

  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`
      SELECT "id"
      FROM "tags"
      WHERE "userId" = ${userId} AND "id" IN (${Prisma.join(tagIds)})
    `,
  );
  if (rows.length !== tagIds.length) {
    throw APIError.invalidArgument("one or more tags were not found");
  }
}

export const listNotes = api(
  { expose: true, auth: true, method: "GET", path: "/notes" },
  async (req: ListNotesRequest): Promise<ListNotesResponse> => {
    const { userID } = getAuthData()!;
    const folderId = req.folderId === undefined ? undefined : normalizeOptionalId(req.folderId, "folderId");
    const tagId = req.tagId === undefined ? undefined : normalizeRequiredId(req.tagId, "tagId");
    const archived = parseArchived(req.archived);

    if (folderId !== undefined) {
      await ensureFolderBelongsToUser(userID, folderId);
    }
    if (tagId !== undefined) {
      await ensureTagsBelongToUser(userID, [tagId]);
    }

    const rows = await prisma.$queryRaw<NoteRow[]>(
      Prisma.sql`
        SELECT n."id", n."userId", n."folderId", n."title", n."content", n."plainText", n."isArchived", n."deletedAt", n."createdAt", n."updatedAt"
        FROM "notes" n
        ${tagId !== undefined ? Prisma.sql`INNER JOIN "note_tags" nt ON nt."noteId" = n."id"` : Prisma.empty}
        WHERE n."userId" = ${userID}
          AND n."deletedAt" IS NULL
          ${folderId !== undefined ? (folderId === null ? Prisma.sql`AND n."folderId" IS NULL` : Prisma.sql`AND n."folderId" = ${folderId}`) : Prisma.empty}
          ${archived === null ? Prisma.empty : Prisma.sql`AND n."isArchived" = ${archived ? 1 : 0}`}
          ${tagId !== undefined ? Prisma.sql`AND nt."tagId" = ${tagId}` : Prisma.empty}
        ORDER BY n."updatedAt" DESC, n."createdAt" DESC
      `,
    );

    const tagsByNote = await loadTagsForNotes(userID, rows.map((row) => row.id));
    return {
      notes: rows.map((row) => toNoteItem(row, tagsByNote.get(row.id) ?? [])),
    };
  },
);

export const listRecentNotes = api(
  { expose: true, auth: true, method: "GET", path: "/notes/recent" },
  async (req: ListRecentNotesRequest): Promise<ListNotesResponse> => {
    const { userID } = getAuthData()!;
    const rawLimit = req.limit === undefined ? 50 : Math.floor(Number(req.limit));
    if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
      throw APIError.invalidArgument("limit must be a positive integer");
    }
    const limit = Math.min(rawLimit, 200);

    const rows = await prisma.$queryRaw<NoteRow[]>(
      Prisma.sql`
        SELECT "id", "userId", "folderId", "title", "content", "plainText", "isArchived", "deletedAt", "createdAt", "updatedAt"
        FROM "notes"
        WHERE "userId" = ${userID}
          AND "deletedAt" IS NULL
          AND "isArchived" = 0
        ORDER BY "updatedAt" DESC, "createdAt" DESC
        LIMIT ${limit}
      `,
    );

    const tagsByNote = await loadTagsForNotes(userID, rows.map((row) => row.id));
    return {
      notes: rows.map((row) => toNoteItem(row, tagsByNote.get(row.id) ?? [])),
    };
  },
);

export const createNote = api(
  { expose: true, auth: true, method: "POST", path: "/notes" },
  async (req: CreateNoteRequest): Promise<NoteItem> => {
    const { userID } = getAuthData()!;
    const id = req.id === undefined ? randomUUID() : normalizeRequiredId(req.id, "id");
    const folderId = normalizeOptionalId(req.folderId, "folderId");
    const title = normalizeTitle(req.title);
    const content = normalizeContent(req.content);
    const plainText = req.plainText === undefined ? "" : normalizeText(req.plainText, "plainText");
    const isArchived = req.isArchived === undefined ? false : normalizeBoolean(req.isArchived, "isArchived");

    await ensureNoteIdAvailable(id);
    await ensureFolderBelongsToUser(userID, folderId);

    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "notes" ("id", "userId", "folderId", "title", "content", "plainText", "isArchived", "updatedAt")
        VALUES (${id}, ${userID}, ${folderId}, ${title}, ${content}, ${plainText}, ${isArchived ? 1 : 0}, CURRENT_TIMESTAMP)
      `,
    );

    return getNoteForUser(userID, id);
  },
);

export const updateNote = api(
  { expose: true, auth: true, method: "PATCH", path: "/notes/:id" },
  async (req: UpdateNoteRequest & { id: string }): Promise<NoteItem> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    const current = await getNoteRowForUser(userID, id);
    const folderId = req.folderId === undefined ? current.folderId : normalizeOptionalId(req.folderId, "folderId");
    const title = req.title === undefined ? current.title : normalizeTitle(req.title);
    const content = req.content === undefined ? current.content : normalizeContent(req.content);
    const plainText = req.plainText === undefined ? current.plainText : normalizeText(req.plainText, "plainText");
    const isArchived = req.isArchived === undefined ? Boolean(current.isArchived) : normalizeBoolean(req.isArchived, "isArchived");

    await ensureFolderBelongsToUser(userID, folderId);

    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "notes"
        SET
          "folderId" = ${folderId},
          "title" = ${title},
          "content" = ${content},
          "plainText" = ${plainText},
          "isArchived" = ${isArchived ? 1 : 0},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "userId" = ${userID}
      `,
    );

    return getNoteForUser(userID, id);
  },
);

export const deleteNote = api(
  { expose: true, auth: true, method: "DELETE", path: "/notes/:id" },
  async (req: { id: string }): Promise<{ ok: boolean }> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    await getNoteRowForUser(userID, id);

    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "notes"
        SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "userId" = ${userID}
      `,
    );

    return { ok: true };
  },
);

export const replaceNoteTags = api(
  { expose: true, auth: true, method: "PUT", path: "/notes/:id/tags" },
  async (req: { id: string; tagIds: string[] }): Promise<NoteItem> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    await getNoteRowForUser(userID, id);

    if (!Array.isArray(req.tagIds)) {
      throw APIError.invalidArgument("tagIds must be an array");
    }

    const tagIds = [...new Set(req.tagIds.map((tagId) => normalizeRequiredId(tagId, "tagId")))];
    await ensureTagsBelongToUser(userID, tagIds);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`DELETE FROM "note_tags" WHERE "noteId" = ${id}`);
      for (const tagId of tagIds) {
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO "note_tags" ("noteId", "tagId") VALUES (${id}, ${tagId})`,
        );
      }
    });

    return getNoteForUser(userID, id);
  },
);
