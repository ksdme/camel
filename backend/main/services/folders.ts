import { randomUUID } from "node:crypto";
import { APIError, api } from "encore.dev/api";
import { Prisma } from "@/lib/db";
import { getFolderRepo } from "@/main/repos";
import type { FolderItem } from "@/main/types";
import { normalizeOptionalId, normalizeRequiredId } from "@/main/utils/validation";
import { getAuthData } from "~encore/auth";

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

function normalizeFolderName(name: unknown): string {
  if (typeof name !== "string") throw APIError.invalidArgument("name is required");
  const trimmed = name.trim();
  if (!trimmed) throw APIError.invalidArgument("name is required");
  if (trimmed.length > FOLDER_NAME_MAX) {
    throw APIError.invalidArgument(`name must be ${FOLDER_NAME_MAX} characters or fewer`);
  }
  return trimmed;
}

export const listFolders = api(
  { expose: true, auth: true, method: "GET", path: "/folders" },
  async (): Promise<ListFoldersResponse> => {
    const { userID } = getAuthData()!;
    return { folders: await getFolderRepo().list(userID) };
  },
);

export const createFolder = api(
  { expose: true, auth: true, method: "POST", path: "/folders" },
  async (req: CreateFolderRequest): Promise<FolderItem> => {
    const { userID } = getAuthData()!;
    const id = req.id === undefined ? randomUUID() : normalizeRequiredId(req.id, "id");
    const name = normalizeFolderName(req.name);
    const parentId = normalizeOptionalId(req.parentId, "parentId");

    if (!(await getFolderRepo().isIdAvailable(id)))
      throw APIError.alreadyExists("folder already exists");
    if (!(await getFolderRepo().validateParent(userID, parentId)))
      throw APIError.notFound("parent folder not found");
    if (!(await getFolderRepo().isNameAvailable(userID, parentId, name))) {
      throw APIError.alreadyExists("folder name already exists in this parent");
    }

    try {
      return await getFolderRepo().create(userID, id, name, parentId);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw APIError.alreadyExists("folder already exists");
      }
      throw err;
    }
  },
);

export const updateFolder = api(
  { expose: true, auth: true, method: "PATCH", path: "/folders/:id" },
  async (req: UpdateFolderRequest & { id: string }): Promise<FolderItem> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    const current = await getFolderRepo().findById(userID, id);
    if (!current) throw APIError.notFound("folder not found");

    const name = req.name === undefined ? current.name : normalizeFolderName(req.name);
    const parentId =
      req.parentId === undefined ? current.parentId : normalizeOptionalId(req.parentId, "parentId");

    if (!(await getFolderRepo().validateParent(userID, parentId)))
      throw APIError.notFound("parent folder not found");
    await getFolderRepo().checkCycle(userID, id, parentId);
    if (!(await getFolderRepo().isNameAvailable(userID, parentId, name, id))) {
      throw APIError.alreadyExists("folder name already exists in this parent");
    }

    await getFolderRepo().update(userID, id, name, parentId);
    return (await getFolderRepo().findById(userID, id))!;
  },
);

export const deleteFolder = api(
  { expose: true, auth: true, method: "DELETE", path: "/folders/:id" },
  async (req: { id: string }): Promise<{ ok: boolean }> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    if (!(await getFolderRepo().findById(userID, id))) throw APIError.notFound("folder not found");
    await getFolderRepo().delete(userID, id);
    return { ok: true };
  },
);
