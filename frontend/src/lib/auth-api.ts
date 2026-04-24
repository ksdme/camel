import { apiFetch } from "@/lib/api";
import type { AuthUser } from "@/stores/authStore";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  created: boolean;
}

export interface OkResponse {
  ok: boolean;
}

export interface AuthEventItem {
  id: string;
  eventType: string;
  success: boolean;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface EventLogsResponse {
  events: AuthEventItem[];
  retentionDays: number;
  page: number;
  pageSize: number;
  total: number;
}

export interface EventLogsParams {
  page?: number;
  pageSize?: number;
}

export function login(body: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    skipAuthRefresh: true,
  });
}

export function logout(): Promise<OkResponse> {
  return apiFetch<OkResponse>("/auth/logout", { method: "POST" });
}

export function refresh(): Promise<OkResponse> {
  return apiFetch<OkResponse>("/auth/refresh", {
    method: "POST",
    skipAuthRefresh: true,
  });
}

function buildEventLogsPath(params: EventLogsParams): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.pageSize !== undefined) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();
  return qs ? `/settings/event_logs?${qs}` : "/settings/event_logs";
}

export function getAuthEvents(params: EventLogsParams = {}): Promise<EventLogsResponse> {
  return apiFetch<EventLogsResponse>(buildEventLogsPath(params), { method: "GET" });
}

export function me(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/auth/me", { method: "GET" });
}

export function eventLogs(params: EventLogsParams = {}): Promise<EventLogsResponse> {
  return apiFetch<EventLogsResponse>(buildEventLogsPath(params), { method: "GET" });
}

export interface ProfileResponse {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
}

export interface UpdateProfileRequest {
  email?: string | null;
  displayName?: string | null;
}

export function getProfile(): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>("/settings/profile", { method: "GET" });
}

export function updateProfile(body: UpdateProfileRequest): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>("/settings/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  ok: boolean;
  otherSessionsRevoked: number;
}

export function changePassword(body: ChangePasswordRequest): Promise<ChangePasswordResponse> {
  return apiFetch<ChangePasswordResponse>("/settings/password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface SessionItem {
  jti: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

export interface SessionsResponse {
  sessions: SessionItem[];
}

export interface RevokeSessionResponse {
  ok: boolean;
  signedOut: boolean;
}

export function listSessions(): Promise<SessionsResponse> {
  return apiFetch<SessionsResponse>("/settings/sessions", { method: "GET" });
}

export function revokeSession(jti: string): Promise<RevokeSessionResponse> {
  return apiFetch<RevokeSessionResponse>("/settings/sessions/revoke", {
    method: "POST",
    body: JSON.stringify({ jti }),
  });
}

export function revokeCurrentSession(): Promise<RevokeSessionResponse> {
  return apiFetch<RevokeSessionResponse>("/settings/sessions/revoke-current", {
    method: "POST",
  });
}

export interface RevokeOthersResponse {
  ok: boolean;
  revoked: number;
  signedOut: boolean;
}

export function revokeOtherSessions(): Promise<RevokeOthersResponse> {
  return apiFetch<RevokeOthersResponse>("/settings/sessions/revoke-others", {
    method: "POST",
  });
}

export type DeleteScope = "profile" | "all";

export interface DeleteAccountRequest {
  password: string;
  scope: DeleteScope;
}

export interface DeleteAccountResponse {
  ok: boolean;
  scope: DeleteScope;
}

export function deleteAccount(body: DeleteAccountRequest): Promise<DeleteAccountResponse> {
  return apiFetch<DeleteAccountResponse>("/settings/account", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}
