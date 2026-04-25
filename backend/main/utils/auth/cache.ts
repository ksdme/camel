import { CacheCluster, StringKeyspace } from "encore.dev/storage/cache";

const cluster = new CacheCluster("auth-cache", {
  evictionPolicy: "allkeys-lru",
});

// Revoked-token set keyed by JWT `jti`. Entries are written with a TTL equal
// to the remaining lifetime of the underlying access token, so they expire
// naturally and don't grow unbounded.
export const tokenBlocklist = new StringKeyspace<{ jti: string }>(cluster, {
  keyPattern: "blocklist/:jti",
});

// Short-lived one-time tokens used to sign a mobile app into the same account
// after scanning a QR code from the authenticated web settings screen.
export const mobileLoginTokens = new StringKeyspace<{ token: string }>(cluster, {
  keyPattern: "mobile-login/:token",
});
