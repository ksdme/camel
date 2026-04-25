import { type DbClient, Prisma, prisma } from "@/lib/db";
import type { TagItem } from "@/main/types";

export interface ITagRepo {
  list(userId: string): Promise<TagItem[]>;
  findById(userId: string, id: string): Promise<TagItem | null>;
  isIdAvailable(id: string): Promise<boolean>;
  isNameAvailable(userId: string, name: string, excludeId?: string): Promise<boolean>;
  validateOwnership(userId: string, tagIds: string[]): Promise<boolean>;
  loadForNotes(userId: string, noteIds: string[]): Promise<Map<string, TagItem[]>>;
  create(userId: string, id: string, name: string, color: string | null): Promise<TagItem>;
  update(userId: string, id: string, name: string, color: string | null): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
}

class TagRepoImpl implements ITagRepo {
  constructor(private readonly db: DbClient) {}

  async list(userId: string): Promise<TagItem[]> {
    return this.db.$queryRaw<TagItem[]>(
      Prisma.sql`
        SELECT "id", "userId", "name", "color", "createdAt", "updatedAt"
        FROM "tags"
        WHERE "userId" = ${userId}
        ORDER BY LOWER("name") ASC, "createdAt" ASC
      `,
    );
  }

  async findById(userId: string, id: string): Promise<TagItem | null> {
    const rows = await this.db.$queryRaw<TagItem[]>(
      Prisma.sql`
        SELECT "id", "userId", "name", "color", "createdAt", "updatedAt"
        FROM "tags"
        WHERE "id" = ${id} AND "userId" = ${userId}
        LIMIT 1
      `,
    );
    return rows[0] ?? null;
  }

  async isIdAvailable(id: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "tags" WHERE "id" = ${id} LIMIT 1`,
    );
    return rows.length === 0;
  }

  async isNameAvailable(userId: string, name: string, excludeId?: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT "id"
        FROM "tags"
        WHERE "userId" = ${userId}
          AND "name" = ${name}
          ${excludeId ? Prisma.sql`AND "id" <> ${excludeId}` : Prisma.empty}
        LIMIT 1
      `,
    );
    return rows.length === 0;
  }

  async validateOwnership(userId: string, tagIds: string[]): Promise<boolean> {
    if (tagIds.length === 0) return true;
    const rows = await this.db.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT "id" FROM "tags"
        WHERE "userId" = ${userId} AND "id" IN (${Prisma.join(tagIds)})
      `,
    );
    return rows.length === tagIds.length;
  }

  async loadForNotes(userId: string, noteIds: string[]): Promise<Map<string, TagItem[]>> {
    const result = new Map<string, TagItem[]>();
    for (const noteId of noteIds) result.set(noteId, []);
    if (noteIds.length === 0) return result;

    const rows = await this.db.$queryRaw<(TagItem & { noteId: string })[]>(
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

  async create(userId: string, id: string, name: string, color: string | null): Promise<TagItem> {
    await this.db.$executeRaw(
      Prisma.sql`
        INSERT INTO "tags" ("id", "userId", "name", "color", "updatedAt")
        VALUES (${id}, ${userId}, ${name}, ${color}, CURRENT_TIMESTAMP)
      `,
    );
    return (await this.findById(userId, id))!;
  }

  async update(userId: string, id: string, name: string, color: string | null): Promise<void> {
    await this.db.$executeRaw(
      Prisma.sql`
        UPDATE "tags"
        SET "name" = ${name}, "color" = ${color}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "userId" = ${userId}
      `,
    );
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.db.$executeRaw(
      Prisma.sql`DELETE FROM "tags" WHERE "id" = ${id} AND "userId" = ${userId}`,
    );
  }
}

export function createTagRepo(db: DbClient): ITagRepo {
  return new TagRepoImpl(db);
}

let _tagRepo: ITagRepo | undefined;
export function getTagRepo(): ITagRepo {
  return (_tagRepo ??= createTagRepo(prisma));
}
