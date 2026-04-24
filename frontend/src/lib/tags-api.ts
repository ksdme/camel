import { apiFetch } from "@/lib/api";
import type { WorkspaceTag } from "@/types/workspace";

interface TagItem {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListTagsResponse {
  tags: TagItem[];
}

interface CreateTagRequest {
  id: string;
  name: string;
  color: string | null;
}

interface UpdateTagRequest {
  name?: string;
  color?: string | null;
}

function toWorkspaceTag(tag: TagItem): WorkspaceTag {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
  };
}

export async function listTags(): Promise<WorkspaceTag[]> {
  const response = await apiFetch<ListTagsResponse>("/tags", { method: "GET" });
  return response.tags.map(toWorkspaceTag);
}

export async function createTag(body: CreateTagRequest): Promise<WorkspaceTag> {
  const response = await apiFetch<TagItem>("/tags", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return toWorkspaceTag(response);
}

export async function updateTag(id: string, body: UpdateTagRequest): Promise<WorkspaceTag> {
  const response = await apiFetch<TagItem>(`/tags/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return toWorkspaceTag(response);
}

export function deleteTag(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/tags/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
