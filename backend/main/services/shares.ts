import { randomBytes, randomUUID } from "node:crypto";
import { APIError, api, type Query } from "encore.dev/api";
import { Prisma } from "@/lib/db";
import { getShareRepo, getUserRepo } from "@/main/repos";
import type { AccessLevel, ShareItem, ShareKind } from "@/main/types";
import { normalizeRequiredId } from "@/main/utils/validation";
import { getAuthData } from "~encore/auth";

export type { ShareItem };

interface ListSharesRequest {
  filter?: Query<"by-me" | "with-me">;
}

interface ListSharesResponse {
  shares: ShareItem[];
}

interface CreateShareRequest {
  kind: ShareKind;
  targetId: string;
  recipientEmail?: string;
  accessLevel?: AccessLevel;
}

interface UpdateShareRequest {
  accessLevel?: AccessLevel;
}

const EMAIL_MAX = 320;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeKind(value: unknown): ShareKind {
  if (value !== "note" && value !== "folder") {
    throw APIError.invalidArgument('kind must be "note" or "folder"');
  }
  return value;
}

function normalizeAccessLevel(value: unknown, fallback: AccessLevel = "view"): AccessLevel {
  if (value === undefined || value === null) return fallback;
  if (value !== "view" && value !== "edit") {
    throw APIError.invalidArgument('accessLevel must be "view" or "edit"');
  }
  return value;
}

function normalizeEmail(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw APIError.invalidArgument("recipientEmail must be a string");
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.length > EMAIL_MAX || !EMAIL_RE.test(trimmed)) {
    throw APIError.invalidArgument("recipientEmail must be a valid address");
  }
  return trimmed;
}

function normalizeToken(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw APIError.invalidArgument("token is required");
  }
  return value.trim();
}

export const listShares = api(
  { expose: true, auth: true, method: "GET", path: "/shares" },
  async (req: ListSharesRequest): Promise<ListSharesResponse> => {
    const { userID } = getAuthData()!;
    const filter = req.filter ?? "by-me";
    if (filter !== "by-me" && filter !== "with-me") {
      throw APIError.invalidArgument('filter must be "by-me" or "with-me"');
    }

    if (filter === "by-me") {
      return { shares: await getShareRepo().listByOwner(userID) };
    }

    const email = await getUserRepo().findEmailById(userID);
    if (!email) return { shares: [] };
    return { shares: await getShareRepo().listForRecipient(email) };
  },
);

export const createShare = api(
  { expose: true, auth: true, method: "POST", path: "/shares" },
  async (req: CreateShareRequest): Promise<ShareItem> => {
    const { userID } = getAuthData()!;
    const kind = normalizeKind(req.kind);
    const targetId = normalizeRequiredId(req.targetId, "targetId");
    const recipientEmail = normalizeEmail(req.recipientEmail);
    const accessLevel = normalizeAccessLevel(req.accessLevel);

    if (!(await getShareRepo().validateTarget(userID, kind, targetId))) {
      throw APIError.notFound(kind === "note" ? "note not found" : "folder not found");
    }

    try {
      return await getShareRepo().create({
        id: randomUUID(),
        ownerId: userID,
        kind,
        targetId,
        recipientEmail,
        accessLevel,
        token: randomBytes(12).toString("base64url"),
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw APIError.alreadyExists("already shared with this recipient");
      }
      throw err;
    }
  },
);

export const getShareByToken = api(
  { expose: true, auth: false, method: "GET", path: "/s/:token" },
  async (req: { token: string }): Promise<ShareItem> => {
    const token = normalizeToken(req.token);
    return getShareRepo().getPublicShare(token);
  },
);

export const updateShare = api(
  { expose: true, auth: true, method: "PATCH", path: "/shares/:id" },
  async (req: UpdateShareRequest & { id: string }): Promise<ShareItem> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    const current = await getShareRepo().findByOwner(userID, id);
    if (!current) throw APIError.notFound("share not found");

    const accessLevel =
      req.accessLevel === undefined
        ? (current.accessLevel as AccessLevel)
        : normalizeAccessLevel(req.accessLevel);

    return getShareRepo().updateAccessLevel(userID, id, accessLevel);
  },
);

export const deleteShare = api(
  { expose: true, auth: true, method: "DELETE", path: "/shares/:id" },
  async (req: { id: string }): Promise<{ ok: boolean }> => {
    const { userID } = getAuthData()!;
    const id = normalizeRequiredId(req.id, "id");
    if (!(await getShareRepo().findByOwner(userID, id))) throw APIError.notFound("share not found");
    await getShareRepo().delete(userID, id);
    return { ok: true };
  },
);

interface UpdateSharedNoteRequest {
  content: string;
  plainText: string;
}

export const updateSharedNote = api(
  { expose: true, auth: false, method: "PATCH", path: "/s/:token/note" },
  async (req: UpdateSharedNoteRequest & { token: string }): Promise<{ ok: boolean }> => {
    const token = normalizeToken(req.token);
    const row = await getShareRepo().findEditableByToken(token);
    if (!row) throw APIError.notFound("share not found or does not allow editing");
    await getShareRepo().updateNoteContent(row.targetId, req.content, req.plainText);
    return { ok: true };
  },
);
