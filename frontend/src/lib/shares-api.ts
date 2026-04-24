import { apiFetch } from "@/lib/api";
import type { ShareAccessLevel, ShareKind, WorkspaceShare } from "@/types/workspace";

interface ShareItem {
  id: string;
  ownerId: string;
  kind: ShareKind;
  targetId: string;
  targetTitle: string;
  recipientEmail: string;
  accessLevel: ShareAccessLevel;
  token: string;
  createdAt: string;
  updatedAt: string;
}

interface ListSharesResponse {
  shares: ShareItem[];
}

export type ShareFilter = "by-me" | "with-me";

interface CreateShareRequest {
  kind: ShareKind;
  targetId: string;
  recipientEmail?: string;
  accessLevel?: ShareAccessLevel;
}

interface UpdateShareRequest {
  accessLevel?: ShareAccessLevel;
}

function toWorkspaceShare(share: ShareItem): WorkspaceShare {
  return {
    id: share.id,
    ownerId: share.ownerId,
    kind: share.kind,
    targetId: share.targetId,
    targetTitle: share.targetTitle,
    recipientEmail: share.recipientEmail,
    accessLevel: share.accessLevel,
    token: share.token,
    createdAt: share.createdAt,
    updatedAt: share.updatedAt,
  };
}

export async function listShares(filter: ShareFilter = "by-me"): Promise<WorkspaceShare[]> {
  const qs = `?filter=${encodeURIComponent(filter)}`;
  const response = await apiFetch<ListSharesResponse>(`/shares${qs}`, { method: "GET" });
  return response.shares.map(toWorkspaceShare);
}

export async function createShare(body: CreateShareRequest): Promise<WorkspaceShare> {
  const response = await apiFetch<ShareItem>("/shares", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return toWorkspaceShare(response);
}

export async function updateShare(id: string, body: UpdateShareRequest): Promise<WorkspaceShare> {
  const response = await apiFetch<ShareItem>(`/shares/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return toWorkspaceShare(response);
}

export function deleteShare(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/shares/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
