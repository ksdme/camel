import { randomUUID } from "node:crypto";
import { APIError, api, type Query } from "encore.dev/api";
import { getFolderRepo, getNoteRepo, getTagRepo } from "@/main/repos";
import type { NoteItem } from "@/main/types";
import { normalizeOptionalId, normalizeRequiredId } from "@/main/utils/validation";
import { getAuthData } from "~encore/auth";

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
  if (typeof title !== "string") throw APIError.invalidArgument("title is required");
  const trimmed = title.trim() || "Untitled";
  if (trimmed.length > NOTE_TITLE_MAX) {
    throw APIError.invalidArgument(`title must be ${NOTE_TITLE_MAX} characters or fewer`);
  }
  return trimmed;
}

function normalizeText(value: unknown, fieldName: string): string {
  if (typeof value !== "string") throw APIError.invalidArgument(`${fieldName} must be a string`);
  if (value.length > NOTE_TEXT_MAX) throw APIError.invalidArgument(`${fieldName} is too large`);
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
  if (typeof value !== "boolean") throw APIError.invalidArgument(`${fieldName} must be a boolean`);
  return value;
}

function parseArchived(value: string | undefined): boolean | null {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  if (value === "all") return null;
  throw APIError.invalidArgument("archived must be true, false, or all");
}

export const listNotes = api(
  { expose: true, auth: true, method: "GET", path: "/notes" },
  async (req: ListNotesRequest): Promise<ListNotesResponse> => {
    const { userID } = getAuthData()!;
    const folderId =
      req.folderId === undefined ? undefined : normalizeOptionalId(req.folderId, "folderId");
    const tagId = req.tagId === undefined ? undefined : normalizeRequiredId(req.tagId, "tagId");
    const archived = parseArchived(req.archived);

    if (folderId !== undefined && folderId !== null) {
      if (!(await getFolderRepo().validateOwnership(userID, folderId)))
        throw APIError.notFound("folder not found");
    }
    if (tagId !== undefined) {
      if (!(await getTagRepo().validateOwnership(userID, [tagId])))
        throw APIError.notFound("tag not found");
    }

    return {
      notes: await getNoteRepo().list(userID, {
        folderId,
        tagId,
        archived: archived === null ? undefined : archived,
      }),
    };
  },
);

export const listRecentNotes = api(
  { expose: true, auth: true, method: "GET", path: "/notes/recent" },
  async (req: ListRecentNotesRequest): Promise<ListNotesResponse> => {
    const { userID } = getAuthData()!;
    const rawLimit = Math.floor(req.limit ?? 50);
    if (rawLimit <= 0) throw APIError.invalidArgument("limit must be a positive integer");
    return { notes: await getNoteRepo().listRecent(userID, Math.min(rawLimit, 200)) };
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
    const isArchived =
      req.isArchived === undefined ? false : normalizeBoolean(req.isArchived, "isArchived");

    if (!(await getNoteRepo().isIdAvailable(id)))
      throw APIError.alreadyExists("note already exists");
    if (folderId !== null) {
      if (!(await getFolderRepo().validateOwnership(userID, folderId)))
        throw APIError.notFound("folder not found");
    }

    return getNoteRepo().create(userID, { id, folderId, title, content, plainText, isArchived });
  },
);

export const updateNote = api(
  { expose: true, auth: true, method: "PATCH", path: "/notes/:id" },
  async (req: UpdateNoteRequest & { id: string }): Promise<NoteItem> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    const current = await getNoteRepo().findRowById(userID, id);
    if (!current) throw APIError.notFound("note not found");

    const folderId =
      req.folderId === undefined ? current.folderId : normalizeOptionalId(req.folderId, "folderId");
    const title = req.title === undefined ? current.title : normalizeTitle(req.title);
    const content = req.content === undefined ? current.content : normalizeContent(req.content);
    const plainText =
      req.plainText === undefined ? current.plainText : normalizeText(req.plainText, "plainText");
    const isArchived =
      req.isArchived === undefined
        ? Boolean(current.isArchived)
        : normalizeBoolean(req.isArchived, "isArchived");

    if (folderId !== null) {
      if (!(await getFolderRepo().validateOwnership(userID, folderId)))
        throw APIError.notFound("folder not found");
    }

    return getNoteRepo().update(userID, id, { folderId, title, content, plainText, isArchived });
  },
);

export const deleteNote = api(
  { expose: true, auth: true, method: "DELETE", path: "/notes/:id" },
  async (req: { id: string }): Promise<{ ok: boolean }> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    if (!(await getNoteRepo().findRowById(userID, id))) throw APIError.notFound("note not found");
    await getNoteRepo().softDelete(userID, id);
    return { ok: true };
  },
);

export const replaceNoteTags = api(
  { expose: true, auth: true, method: "PUT", path: "/notes/:id/tags" },
  async (req: { id: string; tagIds: string[] }): Promise<NoteItem> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    if (!(await getNoteRepo().findRowById(userID, id))) throw APIError.notFound("note not found");

    if (!Array.isArray(req.tagIds)) throw APIError.invalidArgument("tagIds must be an array");
    const tagIds = [...new Set(req.tagIds.map((tagId) => normalizeRequiredId(tagId, "tagId")))];

    if (!(await getTagRepo().validateOwnership(userID, tagIds))) {
      throw APIError.invalidArgument("one or more tags were not found");
    }

    return getNoteRepo().replaceTags(userID, id, tagIds);
  },
);
