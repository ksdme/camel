import type { IncomingMessage, ServerResponse } from "node:http";
import { APIError } from "encore.dev/api";

// Match the JWT TTLs defined in the token service files.
const ACCESS_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

// Secure flag is only added in production (Encore Cloud sets NODE_ENV=production).
// Local dev runs over plain HTTP so Secure would prevent cookies from being set.
const SECURE = process.env.NODE_ENV === "production" ? "; Secure" : "";

/**
 * Set HttpOnly, SameSite=Lax auth cookies on the response.
 * The refresh token is scoped to /auth/refresh so it is only sent to that endpoint.
 */
export function setAuthCookies(
  res: ServerResponse,
  accessToken: string,
  refreshToken: string,
): void {
  // Refresh cookie is scoped to `/` so /settings/sessions can identify the
  // current session by the caller's refresh jti. It remains HttpOnly.
  res.setHeader("Set-Cookie", [
    `access_token=${accessToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ACCESS_TOKEN_MAX_AGE}${SECURE}`,
    `refresh_token=${refreshToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${REFRESH_TOKEN_MAX_AGE}${SECURE}`,
  ]);
}

/** Expire both auth cookies immediately by setting Max-Age=0. */
export function clearAuthCookies(res: ServerResponse): void {
  res.setHeader("Set-Cookie", [
    `access_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE}`,
    `refresh_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE}`,
  ]);
}

/** Parse a raw Cookie header string into a name → decoded-value map. */
export function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    try {
      result[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // Skip cookies with malformed percent-encoding.
    }
  }
  return result;
}

/** Return a named cookie value from an incoming request. Returns undefined when absent. */
export function getCookieValue(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parseCookies(header)[name];
}

/** Read the full request body and parse it as JSON. Rejects on invalid JSON. */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer | string) => (data += String(chunk)));
    req.on("end", () => {
      try {
        resolve(data.length > 0 ? JSON.parse(data) : {});
      } catch {
        reject(APIError.invalidArgument("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/** Send a JSON payload with the given HTTP status code. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

/** Map an Encore APIError to an HTTP status code and send a JSON error response. */
export function sendApiError(res: ServerResponse, err: APIError): void {
  const statusMap: Record<string, number> = {
    unauthenticated: 401,
    not_found: 404,
    invalid_argument: 400,
    already_exists: 409,
    permission_denied: 403,
    unavailable: 503,
    internal: 500,
  };
  const status = statusMap[err.code] ?? 500;
  sendJson(res, status, { code: err.code, message: err.message });
}
