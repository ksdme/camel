import { APIError } from "encore.dev/api";
import { type DbClient, Prisma, prisma } from "@/lib/db";
import type { FolderItem } from "@/main/types";

const FOLDER_TREE_MAX_DEPTH = 64;

export interface IFolderRepo {
  list(userId: string): Promise<FolderItem[]>;
  findById(userId: string, id: string): Promise<FolderItem | null>;
  isIdAvailable(id: string): Promise<boolean>;
  isNameAvailable(
    userId: string,
    parentId: string | null,
    name: string,
    excludeId?: string,
  ): Promise<boolean>;
  validateParent(userId: string, parentId: string | null): Promise<boolean>;
  validateOwnership(userId: string, folderId: string): Promise<boolean>;
  checkCycle(userId: string, folderId: string, nextParentId: string | null): Promise<void>;
  create(userId: string, id: string, name: string, parentId: string | null): Promise<FolderItem>;
  update(userId: string, id: string, name: string, parentId: string | null): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
}

class FolderRepoImpl implements IFolderRepo {
  constructor(private readonly db: DbClient) {}

  async list(userId: string): Promise<FolderItem[]> {
    return this.db.$queryRaw<FolderItem[]>(
      Prisma.sql`
        SELECT "id", "userId", "name", "parentId", "createdAt", "updatedAt"
        FROM "folders"
        WHERE "userId" = ${userId}
        ORDER BY "parentId" ASC, LOWER("name") ASC, "createdAt" ASC
      `,
    );
  }

  async findById(userId: string, id: string): Promise<FolderItem | null> {
    const rows = await this.db.$queryRaw<FolderItem[]>(
      Prisma.sql`
        SELECT "id", "userId", "name", "parentId", "createdAt", "updatedAt"
        FROM "folders"
        WHERE "id" = ${id} AND "userId" = ${userId}
        LIMIT 1
      `,
    );
    return rows[0] ?? null;
  }

  async isIdAvailable(id: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "folders" WHERE "id" = ${id} LIMIT 1`,
    );
    return rows.length === 0;
  }

  async isNameAvailable(
    userId: string,
    parentId: string | null,
    name: string,
    excludeId?: string,
  ): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT "id"
        FROM "folders"
        WHERE "userId" = ${userId}
          AND "name" = ${name}
          AND (
            (${parentId} IS NULL AND "parentId" IS NULL)
            OR "parentId" = ${parentId}
          )
          ${excludeId ? Prisma.sql`AND "id" <> ${excludeId}` : Prisma.empty}
        LIMIT 1
      `,
    );
    return rows.length === 0;
  }

  async validateParent(userId: string, parentId: string | null): Promise<boolean> {
    if (parentId === null) return true;
    const rows = await this.db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "folders" WHERE "id" = ${parentId} AND "userId" = ${userId} LIMIT 1`,
    );
    return rows.length > 0;
  }

  async validateOwnership(userId: string, folderId: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "folders" WHERE "id" = ${folderId} AND "userId" = ${userId} LIMIT 1`,
    );
    return rows.length > 0;
  }

  async checkCycle(userId: string, folderId: string, nextParentId: string | null): Promise<void> {
    if (nextParentId === null) return;
    if (nextParentId === folderId) {
      throw APIError.invalidArgument("folder cannot be its own parent");
    }

    let cursor: string | null = nextParentId;
    for (let depth = 0; cursor !== null && depth < FOLDER_TREE_MAX_DEPTH; depth += 1) {
      if (cursor === folderId) {
        throw APIError.invalidArgument("folder cannot be moved under its descendant");
      }
      const rows: { parentId: string | null }[] = await this.db.$queryRaw(
        Prisma.sql`
          SELECT "parentId" FROM "folders"
          WHERE "id" = ${cursor} AND "userId" = ${userId}
          LIMIT 1
        `,
      );
      if (rows.length === 0) throw APIError.notFound("parent folder not found");
      cursor = rows[0].parentId;
    }

    if (cursor !== null) throw APIError.invalidArgument("folder tree is too deep");
  }

  async create(
    userId: string,
    id: string,
    name: string,
    parentId: string | null,
  ): Promise<FolderItem> {
    await this.db.$executeRaw(
      Prisma.sql`
        INSERT INTO "folders" ("id", "userId", "name", "parentId", "updatedAt")
        VALUES (${id}, ${userId}, ${name}, ${parentId}, CURRENT_TIMESTAMP)
      `,
    );
    return (await this.findById(userId, id))!;
  }

  async update(userId: string, id: string, name: string, parentId: string | null): Promise<void> {
    await this.db.$executeRaw(
      Prisma.sql`
        UPDATE "folders"
        SET "name" = ${name}, "parentId" = ${parentId}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "userId" = ${userId}
      `,
    );
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.db.$executeRaw(
      Prisma.sql`DELETE FROM "folders" WHERE "id" = ${id} AND "userId" = ${userId}`,
    );
  }
}

export function createFolderRepo(db: DbClient): IFolderRepo {
  return new FolderRepoImpl(db);
}

let _folderRepo: IFolderRepo | undefined;
export function getFolderRepo(): IFolderRepo {
  return (_folderRepo ??= createFolderRepo(prisma));
}
