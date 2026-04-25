import { randomUUID } from "node:crypto";
import { APIError, api } from "encore.dev/api";
import { Prisma } from "@/lib/db";
import { getTagRepo } from "@/main/repos";
import type { TagItem } from "@/main/types";
import { normalizeRequiredId } from "@/main/utils/validation";
import { getAuthData } from "~encore/auth";

export type { TagItem };

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

function normalizeTagName(name: unknown): string {
  if (typeof name !== "string") throw APIError.invalidArgument("name is required");
  const trimmed = name.trim();
  if (!trimmed) throw APIError.invalidArgument("name is required");
  if (trimmed.length > TAG_NAME_MAX) {
    throw APIError.invalidArgument(`name must be ${TAG_NAME_MAX} characters or fewer`);
  }
  return trimmed;
}

function normalizeColor(color: unknown): string | null {
  if (color === undefined || color === null || color === "") return null;
  if (typeof color !== "string") throw APIError.invalidArgument("color must be a hex string");
  const trimmed = color.trim();
  if (!HEX_COLOR_RE.test(trimmed))
    throw APIError.invalidArgument("color must be a 6-digit hex value");
  return trimmed.toLowerCase();
}

export const listTags = api(
  { expose: true, auth: true, method: "GET", path: "/tags" },
  async (): Promise<ListTagsResponse> => {
    const { userID } = getAuthData()!;
    return { tags: await getTagRepo().list(userID) };
  },
);

export const createTag = api(
  { expose: true, auth: true, method: "POST", path: "/tags" },
  async (req: CreateTagRequest): Promise<TagItem> => {
    const { userID } = getAuthData()!;
    const id = req.id === undefined ? randomUUID() : normalizeRequiredId(req.id, "id");
    const name = normalizeTagName(req.name);
    const color = normalizeColor(req.color);

    if (!(await getTagRepo().isIdAvailable(id))) throw APIError.alreadyExists("tag already exists");
    if (!(await getTagRepo().isNameAvailable(userID, name)))
      throw APIError.alreadyExists("tag name already exists");

    try {
      return await getTagRepo().create(userID, id, name, color);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw APIError.alreadyExists("tag already exists");
      }
      throw err;
    }
  },
);

export const updateTag = api(
  { expose: true, auth: true, method: "PATCH", path: "/tags/:id" },
  async (req: UpdateTagRequest & { id: string }): Promise<TagItem> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    const current = await getTagRepo().findById(userID, id);
    if (!current) throw APIError.notFound("tag not found");

    const name = req.name === undefined ? current.name : normalizeTagName(req.name);
    const color = req.color === undefined ? current.color : normalizeColor(req.color);

    if (!(await getTagRepo().isNameAvailable(userID, name, id))) {
      throw APIError.alreadyExists("tag name already exists");
    }

    await getTagRepo().update(userID, id, name, color);
    return (await getTagRepo().findById(userID, id))!;
  },
);

export const deleteTag = api(
  { expose: true, auth: true, method: "DELETE", path: "/tags/:id" },
  async (req: { id: string }): Promise<{ ok: boolean }> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    if (!(await getTagRepo().findById(userID, id))) throw APIError.notFound("tag not found");
    await getTagRepo().delete(userID, id);
    return { ok: true };
  },
);
