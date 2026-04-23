-- CreateTable
CREATE TABLE "auth_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "username" TEXT,
    "eventType" TEXT NOT NULL,
    "success" INTEGER NOT NULL,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "users"("id")
);

-- CreateIndex
CREATE INDEX "idx_auth_events_user_createdAt" ON "auth_events"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_auth_events_username_createdAt" ON "auth_events"("username", "createdAt" DESC);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "users"("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "refresh_tokens"("jti");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_user_revoked" ON "refresh_tokens"("userId", "revokedAt");