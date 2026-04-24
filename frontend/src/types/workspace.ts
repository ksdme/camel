export interface WorkspaceFolder {
  id: string;
  parentFolderId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceTag {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceNote {
  id: string;
  parentFolderId: string | null;
  title: string;
  documentJson: any; // BlockNote document JSON
  plainText: string;
  isArchived: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: WorkspaceTag[];
}

export type ShareKind = "note" | "folder";
export type ShareAccessLevel = "view" | "edit";

export interface WorkspaceShare {
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
