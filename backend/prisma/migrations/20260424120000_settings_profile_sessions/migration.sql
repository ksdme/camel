-- Users: add email, displayName, deletedAt
ALTER TABLE "users" ADD COLUMN "email" TEXT;
ALTER TABLE "users" ADD COLUMN "displayName" TEXT;
ALTER TABLE "users" ADD COLUMN "deletedAt" DATETIME;
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- RefreshToken: add device metadata + cascade delete. SQLite requires
-- table recreate to alter the FK onDelete, so rebuild with the new schema.
PRAGMA foreign_keys=OFF;

CREATE TABLE "refresh_tokens_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

INSERT INTO "refresh_tokens_new" ("id", "userId", "jti", "expiresAt", "revokedAt", "createdAt")
SELECT "id", "userId", "jti", "expiresAt", "revokedAt", "createdAt" FROM "refresh_tokens";

DROP TABLE "refresh_tokens";
ALTER TABLE "refresh_tokens_new" RENAME TO "refresh_tokens";

CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "refresh_tokens"("jti");
CREATE INDEX "idx_refresh_tokens_user_revoked" ON "refresh_tokens"("userId", "revokedAt");

-- AuthEvent: rebuild to add cascade delete for consistency.
CREATE TABLE "auth_events_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "username" TEXT,
    "eventType" TEXT NOT NULL,
    "success" INTEGER NOT NULL,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

INSERT INTO "auth_events_new" ("id", "userId", "username", "eventType", "success", "reason", "ipAddress", "userAgent", "createdAt")
SELECT "id", "userId", "username", "eventType", "success", "reason", "ipAddress", "userAgent", "createdAt" FROM "auth_events";

DROP TABLE "auth_events";
ALTER TABLE "auth_events_new" RENAME TO "auth_events";

CREATE INDEX "idx_auth_events_user_createdAt" ON "auth_events"("userId", "createdAt" DESC);
CREATE INDEX "idx_auth_events_username_createdAt" ON "auth_events"("username", "createdAt" DESC);

PRAGMA foreign_keys=ON;
