import { apiFetch } from "@/lib/api";
import type { WorkspaceNote, WorkspaceTag } from "@/types/workspace";

interface TagItem {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NoteItem {
  id: string;
  userId: string;
  folderId: string | null;
  title: string;
  content: string;
  plainText: string;
  isArchived: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: TagItem[];
}

interface ListNotesResponse {
  notes: NoteItem[];
}

interface CreateNoteRequest {
  id: string;
  folderId: string | null;
  title: string;
  content: string;
  plainText: string;
  isArchived?: boolean;
}

interface UpdateNoteRequest {
  folderId?: string | null;
  title?: string;
  content?: string;
  plainText?: string;
  isArchived?: boolean;
}

function parseContent(content: string): unknown {
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) && parsed.length === 0 ? null : parsed;
  } catch {
    return null;
  }
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

function toWorkspaceNote(note: NoteItem): WorkspaceNote {
  return {
    id: note.id,
    parentFolderId: note.folderId,
    title: note.title,
    documentJson: parseContent(note.content),
    plainText: note.plainText,
    isArchived: note.isArchived,
    deletedAt: note.deletedAt,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    tags: note.tags.map(toWorkspaceTag),
  };
}

export async function listNotes(): Promise<WorkspaceNote[]> {
  const response = await apiFetch<ListNotesResponse>("/notes", { method: "GET" });
  return response.notes.map(toWorkspaceNote);
}

export async function listRecentNotes(limit = 50): Promise<WorkspaceNote[]> {
  const qs = `?limit=${encodeURIComponent(String(limit))}`;
  const response = await apiFetch<ListNotesResponse>(`/notes/recent${qs}`, { method: "GET" });
  return response.notes.map(toWorkspaceNote);
}

export async function createNote(body: CreateNoteRequest): Promise<WorkspaceNote> {
  const response = await apiFetch<NoteItem>("/notes", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return toWorkspaceNote(response);
}

export async function updateNote(id: string, body: UpdateNoteRequest): Promise<WorkspaceNote> {
  const response = await apiFetch<NoteItem>(`/notes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return toWorkspaceNote(response);
}

export function deleteNote(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/notes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function replaceNoteTags(id: string, tagIds: string[]): Promise<WorkspaceNote> {
  const response = await apiFetch<NoteItem>(`/notes/${encodeURIComponent(id)}/tags`, {
    method: "PUT",
    body: JSON.stringify({ tagIds }),
  });
  return toWorkspaceNote(response);
}
