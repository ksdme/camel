export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://192.168.56.1:4000";

export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, body: ApiErrorBody | string) {
    const message =
      typeof body === "string" ? body : body.message ?? `request failed with status ${status}`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (typeof body === "object" && body !== null) {
      this.code = body.code;
      this.details = body.details;
    }
  }
}

interface ApiFetchOptions extends RequestInit {
  /** Skip the silent refresh-on-401 retry (used by the refresh endpoint itself). */
  skipAuthRefresh?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }
  return refreshInFlight;
}

async function rawFetch<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, (data as ApiErrorBody) ?? text);
  }

  return data as T;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { skipAuthRefresh, ...init } = options;

  try {
    return await rawFetch<T>(path, init);
  } catch (err) {
    if (
      !skipAuthRefresh &&
      err instanceof ApiError &&
      err.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/refresh"
    ) {
      const refreshed = await attemptRefresh();
      if (refreshed) {
        return await rawFetch<T>(path, init);
      }
    }
    throw err;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
