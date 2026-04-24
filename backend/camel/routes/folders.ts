import { randomUUID } from "node:crypto";
import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { Prisma, prisma } from "../../lib/db";

interface FolderItem {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ListFoldersResponse {
  folders: FolderItem[];
}

interface CreateFolderRequest {
  id?: string;
  name: string;
  parentId?: string | null;
}

interface UpdateFolderRequest {
  name?: string;
  parentId?: string | null;
}

const FOLDER_NAME_MAX = 120;
const FOLDER_TREE_MAX_DEPTH = 64;

function normalizeFolderName(name: unknown): string {
  if (typeof name !== "string") {
    throw APIError.invalidArgument("name is required");
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw APIError.invalidArgument("name is required");
  }
  if (trimmed.length > FOLDER_NAME_MAX) {
    throw APIError.invalidArgument(`name must be ${FOLDER_NAME_MAX} characters or fewer`);
  }
  return trimmed;
}

function normalizeOptionalId(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw APIError.invalidArgument(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function normalizeRequiredId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw APIError.invalidArgument(`${fieldName} is required`);
  }
  return value.trim();
}

async function ensureParentBelongsToUser(userId: string, parentId: string | null): Promise<void> {
  if (parentId === null) return;

  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM "folders" WHERE "id" = ${parentId} AND "userId" = ${userId} LIMIT 1`,
  );
  if (rows.length === 0) {
    throw APIError.notFound("parent folder not found");
  }
}

async function ensureNameAvailable(
  userId: string,
  parentId: string | null,
  name: string,
  excludeId?: string,
): Promise<void> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(
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
  if (rows.length > 0) {
    throw APIError.alreadyExists("folder name already exists in this parent");
  }
}

async function ensureFolderIdAvailable(id: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM "folders" WHERE "id" = ${id} LIMIT 1`,
  );
  if (rows.length > 0) {
    throw APIError.alreadyExists("folder already exists");
  }
}

async function getFolderForUser(userId: string, id: string): Promise<FolderItem> {
  const rows = await prisma.$queryRaw<FolderItem[]>(
    Prisma.sql`
      SELECT "id", "userId", "name", "parentId", "createdAt", "updatedAt"
      FROM "folders"
      WHERE "id" = ${id} AND "userId" = ${userId}
      LIMIT 1
    `,
  );
  const folder = rows[0];
  if (!folder) {
    throw APIError.notFound("folder not found");
  }
  return folder;
}

async function ensureMoveDoesNotCreateCycle(
  userId: string,
  folderId: string,
  nextParentId: string | null,
): Promise<void> {
  if (nextParentId === null) return;
  if (nextParentId === folderId) {
    throw APIError.invalidArgument("folder cannot be its own parent");
  }

  let cursor: string | null = nextParentId;
  for (let depth = 0; cursor !== null && depth < FOLDER_TREE_MAX_DEPTH; depth += 1) {
    if (cursor === folderId) {
      throw APIError.invalidArgument("folder cannot be moved under its descendant");
    }

    const rows: { parentId: string | null }[] = await prisma.$queryRaw(
      Prisma.sql`
        SELECT "parentId"
        FROM "folders"
        WHERE "id" = ${cursor} AND "userId" = ${userId}
        LIMIT 1
      `,
    );
    if (rows.length === 0) {
      throw APIError.notFound("parent folder not found");
    }
    cursor = rows[0].parentId;
  }

  if (cursor !== null) {
    throw APIError.invalidArgument("folder tree is too deep");
  }
}

export const listFolders = api(
  { expose: true, auth: true, method: "GET", path: "/folders" },
  async (): Promise<ListFoldersResponse> => {
    const { userID } = getAuthData()!;
    const folders = await prisma.$queryRaw<FolderItem[]>(
      Prisma.sql`
        SELECT "id", "userId", "name", "parentId", "createdAt", "updatedAt"
        FROM "folders"
        WHERE "userId" = ${userID}
        ORDER BY "parentId" ASC, LOWER("name") ASC, "createdAt" ASC
      `,
    );

    return { folders };
  },
);

export const createFolder = api(
  { expose: true, auth: true, method: "POST", path: "/folders" },
  async (req: CreateFolderRequest): Promise<FolderItem> => {
    const { userID } = getAuthData()!;
    const id = req.id === undefined ? randomUUID() : normalizeRequiredId(req.id, "id");
    const name = normalizeFolderName(req.name);
    const parentId = normalizeOptionalId(req.parentId, "parentId");

    await ensureFolderIdAvailable(id);
    await ensureParentBelongsToUser(userID, parentId);
    await ensureNameAvailable(userID, parentId, name);

    try {
      await prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO "folders" ("id", "userId", "name", "parentId", "updatedAt")
          VALUES (${id}, ${userID}, ${name}, ${parentId}, CURRENT_TIMESTAMP)
        `,
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw APIError.alreadyExists("folder already exists");
      }
      throw err;
    }

    return getFolderForUser(userID, id);
  },
);

export const updateFolder = api(
  { expose: true, auth: true, method: "PATCH", path: "/folders/:id" },
  async (req: UpdateFolderRequest & { id: string }): Promise<FolderItem> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    const current = await getFolderForUser(userID, id);
    const name = req.name === undefined ? current.name : normalizeFolderName(req.name);
    const parentId = req.parentId === undefined ? current.parentId : normalizeOptionalId(req.parentId, "parentId");

    await ensureParentBelongsToUser(userID, parentId);
    await ensureMoveDoesNotCreateCycle(userID, id, parentId);
    await ensureNameAvailable(userID, parentId, name, id);

    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "folders"
        SET "name" = ${name}, "parentId" = ${parentId}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "userId" = ${userID}
      `,
    );

    return getFolderForUser(userID, id);
  },
);

export const deleteFolder = api(
  { expose: true, auth: true, method: "DELETE", path: "/folders/:id" },
  async (req: { id: string }): Promise<{ ok: boolean }> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    await getFolderForUser(userID, id);

    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM "folders" WHERE "id" = ${id} AND "userId" = ${userID}`,
    );

    return { ok: true };
  },
);
