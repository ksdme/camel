CREATE TABLE "users" (
    "id"           TEXT        NOT NULL,
    "username"     TEXT        NOT NULL,
    "passwordHash" TEXT        NOT NULL,
    "email"        TEXT,
    "displayName"  TEXT,
    "deletedAt"    TIMESTAMPTZ,
    "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"    TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_email_key"    ON "users"("email");

-- ----------------------------------------------------------------

CREATE TABLE "auth_events" (
    "id"        TEXT        NOT NULL,
    "userId"    TEXT,
    "username"  TEXT,
    "eventType" TEXT        NOT NULL,
    "success"   BOOLEAN     NOT NULL,
    "reason"    TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "auth_events_pkey"       PRIMARY KEY ("id"),
    CONSTRAINT "auth_events_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_auth_events_user_createdAt"     ON "auth_events"("userId", "createdAt" DESC);
CREATE INDEX "idx_auth_events_username_createdAt" ON "auth_events"("username", "createdAt" DESC);

-- ----------------------------------------------------------------

CREATE TABLE "refresh_tokens" (
    "id"         TEXT        NOT NULL,
    "userId"     TEXT        NOT NULL,
    "jti"        TEXT        NOT NULL,
    "expiresAt"  TIMESTAMPTZ NOT NULL,
    "revokedAt"  TIMESTAMPTZ,
    "userAgent"  TEXT,
    "ipAddress"  TEXT,
    "lastUsedAt" TIMESTAMPTZ,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "refresh_tokens_pkey"        PRIMARY KEY ("id"),
    CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "refresh_tokens_jti_key"         ON "refresh_tokens"("jti");
CREATE INDEX        "idx_refresh_tokens_user_revoked" ON "refresh_tokens"("userId", "revokedAt");

-- ----------------------------------------------------------------

CREATE TABLE "folders" (
    "id"        TEXT        NOT NULL,
    "userId"    TEXT        NOT NULL,
    "name"      TEXT        NOT NULL,
    "parentId"  TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "folders_pkey"          PRIMARY KEY ("id"),
    CONSTRAINT "folders_userId_fkey"   FOREIGN KEY ("userId")
        REFERENCES "users"("id")   ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId")
        REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX        "idx_folders_userId"          ON "folders"("userId");
CREATE UNIQUE INDEX "uq_folders_user_parent_name" ON "folders"("userId", "parentId", "name");

-- ----------------------------------------------------------------

CREATE TABLE "notes" (
    "id"         TEXT        NOT NULL,
    "userId"     TEXT        NOT NULL,
    "folderId"   TEXT,
    "title"      TEXT        NOT NULL,
    "content"    TEXT        NOT NULL,
    "plainText"  TEXT        NOT NULL DEFAULT '',
    "isArchived" BOOLEAN     NOT NULL DEFAULT false,
    "deletedAt"  TIMESTAMPTZ,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"  TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notes_pkey"          PRIMARY KEY ("id"),
    CONSTRAINT "notes_userId_fkey"   FOREIGN KEY ("userId")
        REFERENCES "users"("id")   ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notes_folderId_fkey" FOREIGN KEY ("folderId")
        REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_notes_user_updated" ON "notes"("userId", "updatedAt" DESC);
CREATE INDEX "idx_notes_folder"       ON "notes"("folderId");
CREATE INDEX "idx_notes_user_deleted" ON "notes"("userId", "deletedAt");

-- ----------------------------------------------------------------

CREATE TABLE "tags" (
    "id"        TEXT        NOT NULL,
    "userId"    TEXT        NOT NULL,
    "name"      TEXT        NOT NULL,
    "color"     TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tags_pkey"        PRIMARY KEY ("id"),
    CONSTRAINT "tags_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_tags_user_name" ON "tags"("userId", "name");
CREATE INDEX        "idx_tags_userId"   ON "tags"("userId");

-- ----------------------------------------------------------------

CREATE TABLE "note_tags" (
    "noteId"    TEXT        NOT NULL,
    "tagId"     TEXT        NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "note_tags_pkey"        PRIMARY KEY ("noteId", "tagId"),
    CONSTRAINT "note_tags_noteId_fkey" FOREIGN KEY ("noteId")
        REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "note_tags_tagId_fkey"  FOREIGN KEY ("tagId")
        REFERENCES "tags"("id")  ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_note_tags_tagId" ON "note_tags"("tagId");

-- ----------------------------------------------------------------

CREATE TABLE "shares" (
    "id"             TEXT        NOT NULL,
    "ownerId"        TEXT        NOT NULL,
    "kind"           TEXT        NOT NULL,
    "targetId"       TEXT        NOT NULL,
    "recipientEmail" TEXT        NOT NULL,
    "accessLevel"    TEXT        NOT NULL,
    "token"          TEXT        NOT NULL,
    "revokedAt"      TIMESTAMPTZ,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ NOT NULL,

    CONSTRAINT "shares_pkey"         PRIMARY KEY ("id"),
    CONSTRAINT "shares_ownerId_fkey" FOREIGN KEY ("ownerId")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "shares_token_key"                 ON "shares"("token");
CREATE UNIQUE INDEX "uq_shares_owner_target_recipient" ON "shares"("ownerId", "kind", "targetId", "recipientEmail");
CREATE INDEX        "idx_shares_owner_target"           ON "shares"("ownerId", "kind", "targetId");
CREATE INDEX        "idx_shares_recipient_email"        ON "shares"("recipientEmail");
