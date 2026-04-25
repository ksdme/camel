import { useEffect, useMemo, useState } from "react";
import { Copy, Download, ExternalLink, Loader2, MonitorSmartphone, QrCode, RefreshCw, Smartphone } from "lucide-react";
import * as QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import * as AuthApi from "@/lib/auth-api";
import { getPairingApiBaseUrl } from "@/lib/api";
import { fetchDevPairingMeta } from "@/lib/dev-pairing";
import {
  buildAndroidIntentPairUrl,
  buildIOSAppOpenUrl,
  buildMobileLoginPayloadUrl,
  getAndroidDownloadUrl,
  getIOSDownloadUrl,
} from "@/lib/mobile-pairing";
import { toast } from "sonner";

type PairingState =
  | { status: "loading" }
  | { status: "ready"; url: string; backendUrl: string | null; loginToken: string; expiresInSec: number }
  | { status: "error"; message: string };

export function MobileDevicePairingCard() {
  const [state, setState] = useState<PairingState>({ status: "loading" });
  const [loginQrDataUrl, setLoginQrDataUrl] = useState<string | null>(null);
  const [androidLaunchQrDataUrl, setAndroidLaunchQrDataUrl] = useState<string | null>(null);
  const [iosLaunchQrDataUrl, setIosLaunchQrDataUrl] = useState<string | null>(null);
  const androidDownloadUrl = getAndroidDownloadUrl();
  const iosDownloadUrl = getIOSDownloadUrl();

  const loginPayloadUrl = useMemo(() => {
    if (state.status !== "ready") return null;
    return buildMobileLoginPayloadUrl(state.url, state.loginToken, state.backendUrl);
  }, [state]);

  const launchIntentUrl = useMemo(() => {
    if (state.status !== "ready") return null;
    return buildAndroidIntentPairUrl(state.url, state.loginToken, state.backendUrl);
  }, [state]);

  const iosOpenUrl = useMemo(() => {
    if (state.status !== "ready") return null;
    return buildIOSAppOpenUrl(state.url, state.loginToken, state.backendUrl);
  }, [state]);

  const loadPairing = async () => {
    setState({ status: "loading" });
    try {
      const [data, mobileLogin] = await Promise.all([
        fetchDevPairingMeta(),
        AuthApi.createMobileLoginToken(),
      ]);
      setState({
        status: "ready",
        url: data.url,
        backendUrl: (() => {
          const resolved = getPairingApiBaseUrl(data.url);
          return resolved && resolved !== data.url ? resolved : null;
        })(),
        loginToken: mobileLogin.token,
        expiresInSec: mobileLogin.expiresInSec,
      });
    } catch {
      setState({
        status: "error",
        message: "Could not generate a mobile login QR for this server.",
      });
    }
  };

  useEffect(() => {
    void loadPairing();
  }, []);

  useEffect(() => {
    if (!loginPayloadUrl) {
      setLoginQrDataUrl(null);
      return;
    }

    let cancelled = false;
    void QRCode.toDataURL(loginPayloadUrl, { margin: 1, width: 320 })
      .then((dataUrl) => {
        if (!cancelled) {
          setLoginQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoginQrDataUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loginPayloadUrl]);

  useEffect(() => {
    if (!launchIntentUrl) {
      setAndroidLaunchQrDataUrl(null);
      return;
    }

    let cancelled = false;
    void QRCode.toDataURL(launchIntentUrl, { margin: 1, width: 320 })
      .then((dataUrl) => {
        if (!cancelled) {
          setAndroidLaunchQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAndroidLaunchQrDataUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [launchIntentUrl]);

  useEffect(() => {
    if (!iosOpenUrl) {
      setIosLaunchQrDataUrl(null);
      return;
    }

    let cancelled = false;
    void QRCode.toDataURL(iosOpenUrl, { margin: 1, width: 320 })
      .then((dataUrl) => {
        if (!cancelled) {
          setIosLaunchQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIosLaunchQrDataUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [iosOpenUrl]);

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error("Copy failed. Copy manually.");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-body font-medium">
            <Smartphone className="h-4 w-4 text-primary" />
            Add Mobile Device
          </div>
          <p className="text-meta text-muted-foreground mt-1">
            Use QR Scan Login in the app. Works with local IPs, public IPs, public domains, VPN hosts, and tunnels.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void loadPairing()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {state.status === "loading" && (
        <div className="mt-4 rounded-lg border border-dashed border-border px-3 py-4 text-meta text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading pairing QR...
        </div>
      )}

      {state.status === "error" && (
        <div className="mt-4 rounded-lg border border-dashed border-border px-3 py-4 text-meta text-muted-foreground">
          {state.message}
        </div>
      )}

      {state.status === "ready" && (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="text-sm font-medium">1. Pair In App (Recommended)</div>
            <div className="text-meta text-muted-foreground">
              Open Camel app and use QR Scan Login. This signs the phone in to your account on whatever host Camel is currently served from.
            </div>
            {state.backendUrl ? (
              <div className="text-xs text-muted-foreground">
                Backend: {state.backendUrl}
              </div>
            ) : null}
            <code className="block rounded-md bg-muted px-2.5 py-2 text-xs break-all">
              {loginPayloadUrl}
            </code>
            <div className="rounded-lg border border-border bg-background p-2.5 inline-flex items-center justify-center">
              {loginQrDataUrl ? (
                <img
                  src={loginQrDataUrl}
                  alt="QR code for mobile sign-in"
                  className="h-44 w-44"
                  loading="lazy"
                />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Expires in about {Math.max(1, Math.floor(state.expiresInSec / 60))} minutes.
            </div>
            <div className="flex flex-wrap gap-2">
              {loginPayloadUrl && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void copyText(loginPayloadUrl, "Mobile login link copied")}
                >
                  <Copy className="h-4 w-4" />
                  Copy Login Link
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={() => void copyText(state.url, "Server URL copied")}>
                <Copy className="h-4 w-4" />
                Copy URL
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="text-sm font-medium">2. Android Install / Open</div>
            <div className="text-meta text-muted-foreground">
              Scan with system camera. If app is installed it opens Camel and forwards the same sign-in payload.
            </div>
            <div className="rounded-lg border border-border bg-background p-2.5 inline-flex items-center justify-center min-h-[196px]">
              {androidLaunchQrDataUrl ? (
                <img
                  src={androidLaunchQrDataUrl}
                  alt="QR code to open or install Camel on Android"
                  className="h-44 w-44"
                  loading="lazy"
                />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {launchIntentUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void copyText(launchIntentUrl, "Launch link copied")}
                >
                  <Copy className="h-4 w-4" />
                  Copy Launch Link
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={androidDownloadUrl} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                  Download Android
                </a>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="text-sm font-medium">3. iPhone Open / Install</div>
            <div className="text-meta text-muted-foreground">
              Scan with iPhone camera to open Camel if installed. If not installed, use the App Store link below.
            </div>
            <div className="rounded-lg border border-border bg-background p-2.5 inline-flex items-center justify-center min-h-[196px]">
              {iosLaunchQrDataUrl ? (
                <img
                  src={iosLaunchQrDataUrl}
                  alt="QR code to open Camel on iPhone"
                  className="h-44 w-44"
                  loading="lazy"
                />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <MonitorSmartphone className="h-3.5 w-3.5" />
              iPhone cannot auto-fallback from a custom scheme QR, so install uses the App Store button.
            </div>
            <div className="flex flex-wrap gap-2">
              {iosOpenUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void copyText(iosOpenUrl, "iPhone launch link copied")}
                >
                  <Copy className="h-4 w-4" />
                  Copy iPhone Link
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={iosDownloadUrl} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                  App Store
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-meta text-muted-foreground inline-flex items-center gap-1.5">
        <QrCode className="h-3.5 w-3.5" />
        Mobile workflow: QR Scan Login (recommended) or Username & Password fallback.
      </p>
      <p className="mt-1 text-meta text-muted-foreground inline-flex items-center gap-1.5">
        <ExternalLink className="h-3.5 w-3.5" />
        Android: {androidDownloadUrl} | iPhone: {iosDownloadUrl}
      </p>
    </div>
  );
}
