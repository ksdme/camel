import { APIError } from "encore.dev/api";
import { type DbClient, Prisma, prisma } from "@/lib/db";
import type { AccessLevel, ShareItem, ShareKind } from "@/main/types";

export interface ShareRow {
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

export interface CreateShareData {
  id: string;
  ownerId: string;
  kind: ShareKind;
  targetId: string;
  recipientEmail: string;
  accessLevel: AccessLevel;
  token: string;
}

const SHARE_COLS = Prisma.sql`"id", "ownerId", "kind", "targetId", "recipientEmail", "accessLevel", "token", "revokedAt", "createdAt", "updatedAt"`;

export interface IShareRepo {
  listByOwner(ownerId: string): Promise<ShareItem[]>;
  listForRecipient(email: string): Promise<ShareItem[]>;
  findByOwner(ownerId: string, id: string): Promise<ShareRow | null>;
  findByToken(token: string): Promise<ShareRow | null>;
  findEditableByToken(token: string): Promise<ShareRow | null>;
  getPublicShare(token: string): Promise<ShareItem>;
  validateTarget(ownerId: string, kind: ShareKind, targetId: string): Promise<boolean>;
  create(data: CreateShareData): Promise<ShareItem>;
  updateAccessLevel(ownerId: string, id: string, accessLevel: AccessLevel): Promise<ShareItem>;
  delete(ownerId: string, id: string): Promise<void>;
  updateNoteContent(noteId: string, content: string, plainText: string): Promise<void>;
}

class ShareRepoImpl implements IShareRepo {
  constructor(private readonly db: DbClient) {}

  private async hydrateRows(rows: ShareRow[]): Promise<Map<string, string>> {
    const titles = new Map<string, string>();
    const noteIds = [...new Set(rows.filter((r) => r.kind === "note").map((r) => r.targetId))];
    const folderIds = [...new Set(rows.filter((r) => r.kind === "folder").map((r) => r.targetId))];

    if (noteIds.length > 0) {
      const r = await this.db.$queryRaw<{ id: string; title: string }[]>(
        Prisma.sql`SELECT "id", "title" FROM "notes" WHERE "id" IN (${Prisma.join(noteIds)})`,
      );
      for (const { id, title } of r) titles.set(`note:${id}`, title);
    }
    if (folderIds.length > 0) {
      const r = await this.db.$queryRaw<{ id: string; name: string }[]>(
        Prisma.sql`SELECT "id", "name" FROM "folders" WHERE "id" IN (${Prisma.join(folderIds)})`,
      );
      for (const { id, name } of r) titles.set(`folder:${id}`, name);
    }
    return titles;
  }

  private async toShareItem(row: ShareRow, includeContent = false): Promise<ShareItem> {
    const titles = await this.hydrateRows([row]);
    let noteData: { content: string; plainText: string } | undefined;
    if (includeContent && row.kind === "note") {
      const noteRows = await this.db.$queryRaw<{ content: string; plainText: string }[]>(
        Prisma.sql`SELECT "content", "plainText" FROM "notes" WHERE "id" = ${row.targetId} LIMIT 1`,
      );
      if (noteRows.length > 0) noteData = noteRows[0];
    }
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

  private async toShareItems(rows: ShareRow[]): Promise<ShareItem[]> {
    const titles = await this.hydrateRows(rows);
    return rows.map((row) => ({
      id: row.id,
      ownerId: row.ownerId,
      kind: row.kind as ShareKind,
      targetId: row.targetId,
      targetTitle: titles.get(`${row.kind}:${row.targetId}`) ?? "(deleted)",
      recipientEmail: row.recipientEmail,
      accessLevel: row.accessLevel as AccessLevel,
      token: row.token,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async listByOwner(ownerId: string): Promise<ShareItem[]> {
    const rows = await this.db.$queryRaw<ShareRow[]>(
      Prisma.sql`
        SELECT ${SHARE_COLS} FROM "shares"
        WHERE "ownerId" = ${ownerId} AND "revokedAt" IS NULL
        ORDER BY "createdAt" DESC
      `,
    );
    return this.toShareItems(rows);
  }

  async listForRecipient(email: string): Promise<ShareItem[]> {
    const rows = await this.db.$queryRaw<ShareRow[]>(
      Prisma.sql`
        SELECT ${SHARE_COLS} FROM "shares"
        WHERE "recipientEmail" = ${email} AND "revokedAt" IS NULL
        ORDER BY "createdAt" DESC
      `,
    );
    return this.toShareItems(rows);
  }

  async findByOwner(ownerId: string, id: string): Promise<ShareRow | null> {
    const rows = await this.db.$queryRaw<ShareRow[]>(
      Prisma.sql`
        SELECT ${SHARE_COLS} FROM "shares"
        WHERE "id" = ${id} AND "ownerId" = ${ownerId} AND "revokedAt" IS NULL
        LIMIT 1
      `,
    );
    return rows[0] ?? null;
  }

  async findByToken(token: string): Promise<ShareRow | null> {
    const rows = await this.db.$queryRaw<ShareRow[]>(
      Prisma.sql`
        SELECT ${SHARE_COLS} FROM "shares"
        WHERE "token" = ${token} AND "revokedAt" IS NULL
        LIMIT 1
      `,
    );
    return rows[0] ?? null;
  }

  async findEditableByToken(token: string): Promise<ShareRow | null> {
    const rows = await this.db.$queryRaw<ShareRow[]>(
      Prisma.sql`
        SELECT ${SHARE_COLS} FROM "shares"
        WHERE "token" = ${token} AND "revokedAt" IS NULL AND "kind" = 'note' AND "accessLevel" = 'edit'
        LIMIT 1
      `,
    );
    return rows[0] ?? null;
  }

  async validateTarget(ownerId: string, kind: ShareKind, targetId: string): Promise<boolean> {
    if (kind === "note") {
      const rows = await this.db.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT "id" FROM "notes" WHERE "id" = ${targetId} AND "userId" = ${ownerId} AND "deletedAt" IS NULL LIMIT 1`,
      );
      return rows.length > 0;
    }
    const rows = await this.db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "folders" WHERE "id" = ${targetId} AND "userId" = ${ownerId} LIMIT 1`,
    );
    return rows.length > 0;
  }

  async create(data: CreateShareData): Promise<ShareItem> {
    await this.db.$executeRaw(
      Prisma.sql`
        INSERT INTO "shares" ("id", "ownerId", "kind", "targetId", "recipientEmail", "accessLevel", "token", "updatedAt")
        VALUES (${data.id}, ${data.ownerId}, ${data.kind}, ${data.targetId}, ${data.recipientEmail}, ${data.accessLevel}, ${data.token}, CURRENT_TIMESTAMP)
      `,
    );
    const row = (await this.findByOwner(data.ownerId, data.id))!;
    return this.toShareItem(row);
  }

  async updateAccessLevel(
    ownerId: string,
    id: string,
    accessLevel: AccessLevel,
  ): Promise<ShareItem> {
    await this.db.$executeRaw(
      Prisma.sql`
        UPDATE "shares"
        SET "accessLevel" = ${accessLevel}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "ownerId" = ${ownerId}
      `,
    );
    const row = (await this.findByOwner(ownerId, id))!;
    return this.toShareItem(row);
  }

  async getPublicShare(token: string): Promise<ShareItem> {
    const row = await this.findByToken(token);
    if (!row) throw APIError.notFound("share not found");
    return this.toShareItem(row, /* includeContent */ true);
  }

  async delete(ownerId: string, id: string): Promise<void> {
    await this.db.$executeRaw(
      Prisma.sql`DELETE FROM "shares" WHERE "id" = ${id} AND "ownerId" = ${ownerId}`,
    );
  }

  async updateNoteContent(noteId: string, content: string, plainText: string): Promise<void> {
    await this.db.$executeRaw(
      Prisma.sql`
        UPDATE "notes"
        SET "content" = ${content}, "plainText" = ${plainText}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${noteId}
      `,
    );
  }
}

export function createShareRepo(db: DbClient): IShareRepo {
  return new ShareRepoImpl(db);
}

let _shareRepo: IShareRepo | undefined;
export function getShareRepo(): IShareRepo {
  return (_shareRepo ??= createShareRepo(prisma));
}
