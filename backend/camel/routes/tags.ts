import { randomUUID } from "node:crypto";
import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { Prisma, prisma } from "../../lib/db";

export interface TagItem {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ListTagsResponse {
  tags: TagItem[];
}

interface CreateTagRequest {
  id?: string;
  name: string;
  color?: string | null;
}

interface UpdateTagRequest {
  name?: string;
  color?: string | null;
}

const TAG_NAME_MAX = 48;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function normalizeRequiredId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw APIError.invalidArgument(`${fieldName} is required`);
  }
  return value.trim();
}

function normalizeTagName(name: unknown): string {
  if (typeof name !== "string") {
    throw APIError.invalidArgument("name is required");
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw APIError.invalidArgument("name is required");
  }
  if (trimmed.length > TAG_NAME_MAX) {
    throw APIError.invalidArgument(`name must be ${TAG_NAME_MAX} characters or fewer`);
  }
  return trimmed;
}

function normalizeColor(color: unknown): string | null {
  if (color === undefined || color === null || color === "") {
    return null;
  }
  if (typeof color !== "string") {
    throw APIError.invalidArgument("color must be a hex string");
  }
  const trimmed = color.trim();
  if (!HEX_COLOR_RE.test(trimmed)) {
    throw APIError.invalidArgument("color must be a 6-digit hex value");
  }
  return trimmed.toLowerCase();
}

async function ensureTagIdAvailable(id: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM "tags" WHERE "id" = ${id} LIMIT 1`,
  );
  if (rows.length > 0) {
    throw APIError.alreadyExists("tag already exists");
  }
}

async function ensureTagNameAvailable(userId: string, name: string, excludeId?: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`
      SELECT "id"
      FROM "tags"
      WHERE "userId" = ${userId}
        AND "name" = ${name}
        ${excludeId ? Prisma.sql`AND "id" <> ${excludeId}` : Prisma.empty}
      LIMIT 1
    `,
  );
  if (rows.length > 0) {
    throw APIError.alreadyExists("tag name already exists");
  }
}

async function getTagForUser(userId: string, id: string): Promise<TagItem> {
  const rows = await prisma.$queryRaw<TagItem[]>(
    Prisma.sql`
      SELECT "id", "userId", "name", "color", "createdAt", "updatedAt"
      FROM "tags"
      WHERE "id" = ${id} AND "userId" = ${userId}
      LIMIT 1
    `,
  );
  const tag = rows[0];
  if (!tag) {
    throw APIError.notFound("tag not found");
  }
  return tag;
}

export const listTags = api(
  { expose: true, auth: true, method: "GET", path: "/tags" },
  async (): Promise<ListTagsResponse> => {
    const { userID } = getAuthData()!;
    const tags = await prisma.$queryRaw<TagItem[]>(
      Prisma.sql`
        SELECT "id", "userId", "name", "color", "createdAt", "updatedAt"
        FROM "tags"
        WHERE "userId" = ${userID}
        ORDER BY LOWER("name") ASC, "createdAt" ASC
      `,
    );
    return { tags };
  },
);

export const createTag = api(
  { expose: true, auth: true, method: "POST", path: "/tags" },
  async (req: CreateTagRequest): Promise<TagItem> => {
    const { userID } = getAuthData()!;
    const id = req.id === undefined ? randomUUID() : normalizeRequiredId(req.id, "id");
    const name = normalizeTagName(req.name);
    const color = normalizeColor(req.color);

    await ensureTagIdAvailable(id);
    await ensureTagNameAvailable(userID, name);

    try {
      await prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO "tags" ("id", "userId", "name", "color", "updatedAt")
          VALUES (${id}, ${userID}, ${name}, ${color}, CURRENT_TIMESTAMP)
        `,
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw APIError.alreadyExists("tag already exists");
      }
      throw err;
    }

    return getTagForUser(userID, id);
  },
);

export const updateTag = api(
  { expose: true, auth: true, method: "PATCH", path: "/tags/:id" },
  async (req: UpdateTagRequest & { id: string }): Promise<TagItem> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    const current = await getTagForUser(userID, id);
    const name = req.name === undefined ? current.name : normalizeTagName(req.name);
    const color = req.color === undefined ? current.color : normalizeColor(req.color);

    await ensureTagNameAvailable(userID, name, id);

    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "tags"
        SET "name" = ${name}, "color" = ${color}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "userId" = ${userID}
      `,
    );

    return getTagForUser(userID, id);
  },
);

export const deleteTag = api(
  { expose: true, auth: true, method: "DELETE", path: "/tags/:id" },
  async (req: { id: string }): Promise<{ ok: boolean }> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    await getTagForUser(userID, id);

    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM "tags" WHERE "id" = ${id} AND "userId" = ${userID}`,
    );

    return { ok: true };
  },
);
