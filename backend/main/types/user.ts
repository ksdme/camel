export interface PublicUser {
  id: string;
  username: string;
  createdAt: Date;
}

/** Full user profile — returned by /auth/me and /settings/profile. */
export interface UserProfile {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  createdAt: Date;
}

export interface SessionItem {
  jti: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
}

export interface AuthEventItem {
  id: string;
  eventType: string;
  success: boolean;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}
