CREATE TABLE "notes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "folderId" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "plainText" TEXT NOT NULL DEFAULT '',
  "isArchived" INTEGER NOT NULL DEFAULT 0,
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notes_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE INDEX "idx_notes_user_updated" ON "notes"("userId", "updatedAt" DESC);
CREATE INDEX "idx_notes_folder" ON "notes"("folderId");
CREATE INDEX "idx_notes_user_deleted" ON "notes"("userId", "deletedAt");

CREATE TABLE "tags" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_tags_user_name" ON "tags"("userId", "name");
CREATE INDEX "idx_tags_userId" ON "tags"("userId");

CREATE TABLE "note_tags" (
  "noteId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("noteId", "tagId"),
  CONSTRAINT "note_tags_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "note_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_note_tags_tagId" ON "note_tags"("tagId");
