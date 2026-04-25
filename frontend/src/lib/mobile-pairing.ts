const DEFAULT_ANDROID_APP_ID = "com.camel.re";
const DEFAULT_IOS_BUNDLE_ID = "com.camel.re";

export interface MobileLoginPayload {
  serverUrl: string;
  backendUrl: string | null;
  token: string | null;
}

export function getAndroidAppId() {
  return (import.meta.env.VITE_ANDROID_APP_ID as string | undefined)?.trim() || DEFAULT_ANDROID_APP_ID;
}

export function getAndroidDownloadUrl() {
  const fromEnv = (import.meta.env.VITE_ANDROID_APP_DOWNLOAD_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv;
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(getAndroidAppId())}`;
}

export function getIOSBundleId() {
  return (import.meta.env.VITE_IOS_BUNDLE_ID as string | undefined)?.trim() || DEFAULT_IOS_BUNDLE_ID;
}

export function getIOSDownloadUrl() {
  const explicit = (import.meta.env.VITE_IOS_APP_STORE_URL as string | undefined)?.trim();
  if (explicit) return explicit;

  const storeId = (import.meta.env.VITE_IOS_APP_STORE_ID as string | undefined)?.trim();
  if (storeId) return `https://apps.apple.com/app/id${encodeURIComponent(storeId)}`;

  return "https://apps.apple.com";
}

export function buildMobileLoginPayloadUrl(
  pairingUrl: string,
  token?: string | null,
  backendUrl?: string | null,
) {
  const encodedPairingUrl = encodeURIComponent(pairingUrl);
  const tokenPart = token ? `&t=${encodeURIComponent(token)}` : "";
  const backendPart = backendUrl ? `&b=${encodeURIComponent(backendUrl)}` : "";
  return `camel://pair-login?u=${encodedPairingUrl}${backendPart}${tokenPart}`;
}

export function buildAndroidIntentPairUrl(pairingUrl: string, token?: string | null, backendUrl?: string | null) {
  const appLinkUrl = buildMobileLoginPayloadUrl(pairingUrl, token, backendUrl);
  const encodedAppLinkUrl = encodeURIComponent(appLinkUrl);
  const encodedFallbackUrl = encodeURIComponent(getAndroidDownloadUrl());
  const packageId = encodeURIComponent(getAndroidAppId());

  return `intent://pair-login?link=${encodedAppLinkUrl}#Intent;scheme=camel;package=${packageId};S.browser_fallback_url=${encodedFallbackUrl};end`;
}

export function buildIOSAppOpenUrl(pairingUrl: string, token?: string | null, backendUrl?: string | null) {
  return buildMobileLoginPayloadUrl(pairingUrl, token, backendUrl);
}

export function extractMobileLoginPayload(rawUrl: string): MobileLoginPayload | null {
  try {
    const parsed = new URL(rawUrl);
    const nestedLink = parsed.searchParams.get("link");
    if (nestedLink) {
      return extractMobileLoginPayload(nestedLink);
    }

    const serverUrl = parsed.searchParams.get("u")?.trim() || "";
    if (!serverUrl) return null;

    const backendUrl = parsed.searchParams.get("b")?.trim() || null;
    const token = parsed.searchParams.get("t")?.trim() || null;
    return { serverUrl, backendUrl, token };
  } catch {
    return null;
  }
}
