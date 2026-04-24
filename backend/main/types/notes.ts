import type { TagItem } from "./tags";

export interface NoteItem {
  id: string;
  userId: string;
  folderId: string | null;
  title: string;
  content: string;
  plainText: string;
  isArchived: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tags: TagItem[];
}
