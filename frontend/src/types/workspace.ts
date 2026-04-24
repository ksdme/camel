export interface WorkspaceFolder {
  id: string;
  parentFolderId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceNote {
  id: string;
  parentFolderId: string | null;
  title: string;
  documentJson: any; // BlockNote document JSON
  plainText: string;
  createdAt: string;
  updatedAt: string;
}