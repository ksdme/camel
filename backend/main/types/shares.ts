export type ShareKind = "note" | "folder";
export type AccessLevel = "view" | "edit";

export interface ShareItem {
  id: string;
  ownerId: string;
  kind: ShareKind;
  targetId: string;
  targetTitle: string;
  recipientEmail: string;
  targetContent?: string;
  targetPlainText?: string;
  accessLevel: AccessLevel;
  token: string;
  createdAt: Date;
  updatedAt: Date;
}
