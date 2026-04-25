import { type DbClient, Prisma, prisma } from "@/lib/db";
import type { NoteItem, TagItem } from "@/main/types";
import type { ITagRepo } from "./tag.repo";
import { createTagRepo } from "./tag.repo";

export interface NoteRow {
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

export interface ListNotesFilter {
  folderId?: string | null;
  tagId?: string;
  archived?: boolean | null;
}

export interface CreateNoteData {
  id: string;
  folderId: string | null;
  title: string;
  content: string;
  plainText: string;
  isArchived: boolean;
}

export interface UpdateNoteData {
  folderId: string | null;
  title: string;
  content: string;
  plainText: string;
  isArchived: boolean;
}

export interface INoteRepo {
  list(userId: string, filter: ListNotesFilter): Promise<NoteItem[]>;
  listRecent(userId: string, limit: number): Promise<NoteItem[]>;
  findRowById(userId: string, id: string): Promise<NoteRow | null>;
  findById(userId: string, id: string): Promise<NoteItem | null>;
  isIdAvailable(id: string): Promise<boolean>;
  create(userId: string, data: CreateNoteData): Promise<NoteItem>;
  update(userId: string, id: string, data: UpdateNoteData): Promise<NoteItem>;
  softDelete(userId: string, id: string): Promise<void>;
  replaceTags(userId: string, noteId: string, tagIds: string[]): Promise<NoteItem>;
  updateContent(noteId: string, content: string, plainText: string): Promise<void>;
}

function toNoteItem(row: NoteRow, tags: TagItem[]): NoteItem {
  return { ...row, isArchived: Boolean(row.isArchived), tags };
}

class NoteRepoImpl implements INoteRepo {
  private readonly tags: ITagRepo;

  constructor(private readonly db: DbClient) {
    this.tags = createTagRepo(db);
  }

  async list(userId: string, filter: ListNotesFilter): Promise<NoteItem[]> {
    const { folderId, tagId, archived } = filter;
    const rows = await this.db.$queryRaw<NoteRow[]>(
      Prisma.sql`
        SELECT n."id", n."userId", n."folderId", n."title", n."content", n."plainText", n."isArchived", n."deletedAt", n."createdAt", n."updatedAt"
        FROM "notes" n
        ${tagId !== undefined ? Prisma.sql`INNER JOIN "note_tags" nt ON nt."noteId" = n."id"` : Prisma.empty}
        WHERE n."userId" = ${userId}
          AND n."deletedAt" IS NULL
          ${folderId !== undefined ? (folderId === null ? Prisma.sql`AND n."folderId" IS NULL` : Prisma.sql`AND n."folderId" = ${folderId}`) : Prisma.empty}
          ${archived === null || archived === undefined ? Prisma.empty : Prisma.sql`AND n."isArchived" = ${archived ? 1 : 0}`}
          ${tagId !== undefined ? Prisma.sql`AND nt."tagId" = ${tagId}` : Prisma.empty}
        ORDER BY n."updatedAt" DESC, n."createdAt" DESC
      `,
    );
    const tagsByNote = await this.tags.loadForNotes(
      userId,
      rows.map((r) => r.id),
    );
    return rows.map((row) => toNoteItem(row, tagsByNote.get(row.id) ?? []));
  }

  async listRecent(userId: string, limit: number): Promise<NoteItem[]> {
    const rows = await this.db.$queryRaw<NoteRow[]>(
      Prisma.sql`
        SELECT "id", "userId", "folderId", "title", "content", "plainText", "isArchived", "deletedAt", "createdAt", "updatedAt"
        FROM "notes"
        WHERE "userId" = ${userId}
          AND "deletedAt" IS NULL
          AND "isArchived" = 0
        ORDER BY "updatedAt" DESC, "createdAt" DESC
        LIMIT ${limit}
      `,
    );
    const tagsByNote = await this.tags.loadForNotes(
      userId,
      rows.map((r) => r.id),
    );
    return rows.map((row) => toNoteItem(row, tagsByNote.get(row.id) ?? []));
  }

  async findRowById(userId: string, id: string): Promise<NoteRow | null> {
    const rows = await this.db.$queryRaw<NoteRow[]>(
      Prisma.sql`
        SELECT "id", "userId", "folderId", "title", "content", "plainText", "isArchived", "deletedAt", "createdAt", "updatedAt"
        FROM "notes"
        WHERE "id" = ${id} AND "userId" = ${userId}
        LIMIT 1
      `,
    );
    return rows[0] ?? null;
  }

  async findById(userId: string, id: string): Promise<NoteItem | null> {
    const row = await this.findRowById(userId, id);
    if (!row) return null;
    const tagsByNote = await this.tags.loadForNotes(userId, [id]);
    return toNoteItem(row, tagsByNote.get(id) ?? []);
  }

  async isIdAvailable(id: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "notes" WHERE "id" = ${id} LIMIT 1`,
    );
    return rows.length === 0;
  }

  async create(userId: string, data: CreateNoteData): Promise<NoteItem> {
    await this.db.$executeRaw(
      Prisma.sql`
        INSERT INTO "notes" ("id", "userId", "folderId", "title", "content", "plainText", "isArchived", "updatedAt")
        VALUES (${data.id}, ${userId}, ${data.folderId}, ${data.title}, ${data.content}, ${data.plainText}, ${data.isArchived ? 1 : 0}, CURRENT_TIMESTAMP)
      `,
    );
    return (await this.findById(userId, data.id))!;
  }

  async update(userId: string, id: string, data: UpdateNoteData): Promise<NoteItem> {
    await this.db.$executeRaw(
      Prisma.sql`
        UPDATE "notes"
        SET
          "folderId" = ${data.folderId},
          "title" = ${data.title},
          "content" = ${data.content},
          "plainText" = ${data.plainText},
          "isArchived" = ${data.isArchived ? 1 : 0},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "userId" = ${userId}
      `,
    );
    return (await this.findById(userId, id))!;
  }

  async softDelete(userId: string, id: string): Promise<void> {
    await this.db.$executeRaw(
      Prisma.sql`
        UPDATE "notes"
        SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "userId" = ${userId}
      `,
    );
  }

  async replaceTags(userId: string, noteId: string, tagIds: string[]): Promise<NoteItem> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`DELETE FROM "note_tags" WHERE "noteId" = ${noteId}`);
      for (const tagId of tagIds) {
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO "note_tags" ("noteId", "tagId") VALUES (${noteId}, ${tagId})`,
        );
      }
    });
    return (await this.findById(userId, noteId))!;
  }

  async updateContent(noteId: string, content: string, plainText: string): Promise<void> {
    await this.db.$executeRaw(
      Prisma.sql`
        UPDATE "notes"
        SET "content" = ${content}, "plainText" = ${plainText}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${noteId}
      `,
    );
  }
}

export function createNoteRepo(db: DbClient): INoteRepo {
  return new NoteRepoImpl(db);
}

let _noteRepo: INoteRepo | undefined;
export function getNoteRepo(): INoteRepo {
  return (_noteRepo ??= createNoteRepo(prisma));
}
