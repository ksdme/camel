import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export const DEV_SERVER_URL_STORAGE_KEY = "serverUrl";
export const API_URL_STORAGE_KEY = "apiUrl";

export interface DevPairingMeta {
  url: string;
}

export interface PairedAppConfig {
  serverUrl: string | null;
  apiUrl: string | null;
}

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function getPairedServerUrl() {
  const { value } = await Preferences.get({ key: DEV_SERVER_URL_STORAGE_KEY });
  return value;
}

export async function getPairedApiUrl() {
  const { value } = await Preferences.get({ key: API_URL_STORAGE_KEY });
  return value;
}

export async function getPairedAppConfig(): Promise<PairedAppConfig> {
  const [serverUrl, apiUrl] = await Promise.all([getPairedServerUrl(), getPairedApiUrl()]);
  return { serverUrl, apiUrl };
}

export async function clearPairedServerUrl() {
  await Promise.all([
    Preferences.remove({ key: DEV_SERVER_URL_STORAGE_KEY }),
    Preferences.remove({ key: API_URL_STORAGE_KEY }),
  ]);
}

export async function setPairedServerUrl(rawUrl: string) {
  const config = await setPairedAppConfig(rawUrl, null);
  return config.serverUrl;
}

export async function setPairedAppConfig(rawServerUrl: string, rawApiUrl?: string | null) {
  const normalizedServerUrl = normalizeDevServerUrl(rawServerUrl);
  if (!normalizedServerUrl) {
    throw new Error("Invalid server URL.");
  }

  const normalizedApiUrl = rawApiUrl ? normalizeDevServerUrl(rawApiUrl) : null;
  await Preferences.set({ key: DEV_SERVER_URL_STORAGE_KEY, value: normalizedServerUrl });

  if (!normalizedApiUrl || normalizedApiUrl === normalizedServerUrl) {
    await Preferences.remove({ key: API_URL_STORAGE_KEY });
  } else {
    await Preferences.set({ key: API_URL_STORAGE_KEY, value: normalizedApiUrl });
  }

  return {
    serverUrl: normalizedServerUrl,
    apiUrl: normalizedApiUrl && normalizedApiUrl !== normalizedServerUrl ? normalizedApiUrl : null,
  };
}

export function switchToPairedServerUrl(serverUrl: string) {
  const normalized = normalizeDevServerUrl(serverUrl);
  if (!normalized) {
    throw new Error("Invalid server URL.");
  }

  // Replace current shell URL with the paired server in-place. This avoids
  // forcing a manual app relaunch after scanning.
  window.location.replace(normalized);
}

export async function fetchDevPairingMeta(signal?: AbortSignal): Promise<DevPairingMeta> {
  try {
    const response = await fetch("/__pair/meta", {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });

    if (!response.ok) {
      throw new Error("Pairing metadata is not available.");
    }

    const data = (await response.json()) as { url?: unknown };
    if (typeof data.url !== "string") {
      throw new Error("Pairing metadata payload is invalid.");
    }

    const normalized = normalizeDevServerUrl(data.url);
    if (!normalized) {
      throw new Error("Pairing URL from server is invalid.");
    }

    return { url: normalized };
  } catch {
    const fallback = normalizeDevServerUrl(window.location.origin);
    if (!fallback) {
      throw new Error("Could not resolve a pairing URL.");
    }
    return { url: fallback };
  }
}

export function normalizeDevServerUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname || parsed.hostname === "0.0.0.0") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.pathname && parsed.pathname !== "/") return null;
  if (parsed.search || parsed.hash) return null;

  const host = parsed.hostname.toLowerCase();
  if (!isAllowedHost(host)) return null;

  return parsed.origin;
}

function isAllowedHost(hostname: string) {
  if (hostname === "0.0.0.0") return false;
  if (hostname === "localhost") return false;
  if (hostname === "127.0.0.1") return false;
  if (hostname === "::") return false;
  if (hostname === "[::]") return false;
  if (hostname === "::1") return false;
  if (hostname.startsWith("127.")) return false;
  if (hostname.startsWith("192.168.56.")) return false;
  return true;
}
