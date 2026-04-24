import { apiFetch } from "@/lib/api";
import type { WorkspaceFolder } from "@/types/workspace";

interface FolderItem {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListFoldersResponse {
  folders: FolderItem[];
}

interface CreateFolderRequest {
  id: string;
  name: string;
  parentId: string | null;
}

interface UpdateFolderRequest {
  name?: string;
  parentId?: string | null;
}

function toWorkspaceFolders(items: FolderItem[]): WorkspaceFolder[] {
  const siblingCounts = new Map<string, number>();

  return items.map((folder) => {
    const siblingKey = folder.parentId ?? "root";
    const sortOrder = siblingCounts.get(siblingKey) ?? 0;
    siblingCounts.set(siblingKey, sortOrder + 1);

    return {
      id: folder.id,
      parentFolderId: folder.parentId,
      name: folder.name,
      sortOrder,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  });
}

export async function listFolders(): Promise<WorkspaceFolder[]> {
  const response = await apiFetch<ListFoldersResponse>("/folders", { method: "GET" });
  return toWorkspaceFolders(response.folders);
}

export async function createFolder(body: CreateFolderRequest): Promise<WorkspaceFolder> {
  const response = await apiFetch<FolderItem>("/folders", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return toWorkspaceFolders([response])[0];
}

export async function updateFolder(id: string, body: UpdateFolderRequest): Promise<WorkspaceFolder> {
  const response = await apiFetch<FolderItem>(`/folders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return toWorkspaceFolders([response])[0];
}

export function deleteFolder(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/folders/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
