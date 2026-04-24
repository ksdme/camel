CREATE TABLE "shares" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "accessLevel" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "shares_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "shares_token_key" ON "shares"("token");
CREATE UNIQUE INDEX "uq_shares_owner_target_recipient" ON "shares"("ownerId", "kind", "targetId", "recipientEmail");
CREATE INDEX "idx_shares_owner_target" ON "shares"("ownerId", "kind", "targetId");
CREATE INDEX "idx_shares_recipient_email" ON "shares"("recipientEmail");
