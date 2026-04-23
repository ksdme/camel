/*
  Warnings:

  - You are about to alter the column `success` on the `auth_events` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_auth_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "username" TEXT,
    "eventType" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_auth_events" ("createdAt", "eventType", "id", "ipAddress", "reason", "success", "userAgent", "userId", "username") SELECT "createdAt", "eventType", "id", "ipAddress", "reason", "success", "userAgent", "userId", "username" FROM "auth_events";
DROP TABLE "auth_events";
ALTER TABLE "new_auth_events" RENAME TO "auth_events";
CREATE INDEX "idx_auth_events_user_createdAt" ON "auth_events"("userId", "createdAt");
CREATE INDEX "idx_auth_events_username_createdAt" ON "auth_events"("username", "createdAt");
CREATE TABLE "new_refresh_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_refresh_tokens" ("createdAt", "expiresAt", "id", "jti", "revokedAt", "userId") SELECT "createdAt", "expiresAt", "id", "jti", "revokedAt", "userId" FROM "refresh_tokens";
DROP TABLE "refresh_tokens";
ALTER TABLE "new_refresh_tokens" RENAME TO "refresh_tokens";
CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "refresh_tokens"("jti");
CREATE INDEX "idx_refresh_tokens_user_revoked" ON "refresh_tokens"("userId", "revokedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
