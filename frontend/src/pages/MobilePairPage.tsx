import { useEffect, useState } from "react";
import { App as AppPlugin } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { BarcodeFormat, BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { ArrowLeft, Loader2, QrCode, RefreshCw, Save, ScanLine, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as AuthApi from "@/lib/auth-api";
import { ApiError } from "@/lib/api";
import {
  clearPairedServerUrl,
  getPairedAppConfig,
  isNativeApp,
  normalizeDevServerUrl,
  setPairedAppConfig,
  switchToPairedServerUrl,
} from "@/lib/dev-pairing";
import { extractMobileLoginPayload } from "@/lib/mobile-pairing";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";

export default function MobilePairPage() {
  const [existingUrl, setExistingUrl] = useState<string | null>(null);
  const [existingApiUrl, setExistingApiUrl] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [manualApiUrl, setManualApiUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const setUser = useAuthStore((state) => state.setUser);
  const platform = Capacitor.getPlatform();
  const supportsInAppScan = platform === "android";

  useEffect(() => {
    const loadCurrent = async () => {
      const current = await getPairedAppConfig();
      setExistingUrl(current.serverUrl);
      setExistingApiUrl(current.apiUrl);
      setManualUrl(current.serverUrl ?? "");
      setManualApiUrl(current.apiUrl ?? "");
    };
    void loadCurrent();
  }, []);

  const scanQr = async () => {
    if (!isNativeApp()) {
      toast.error("QR scanning works only in the native mobile app.");
      return;
    }

    if (!supportsInAppScan) {
      toast.error("Use your iPhone Camera app to scan the QR from Camel Settings.");
      return;
    }

    setBusy(true);
    try {
      const supported = await BarcodeScanner.isSupported();
      if (!supported.supported) {
        toast.error("Barcode scanning is not supported on this device.");
        return;
      }

      const permission = await BarcodeScanner.requestPermissions();
      if (permission.camera !== "granted") {
        toast.error("Camera permission is required to scan pairing QR codes.");
        return;
      }

      const result = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
      const first = result.barcodes[0];
      const rawUrl = first?.rawValue ?? first?.displayValue ?? "";
      if (!rawUrl) {
        toast.error("No QR payload detected.");
        return;
      }

      await savePairing(rawUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan failed.";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const savePairing = async (rawUrl: string) => {
    const payload = extractMobileLoginPayload(rawUrl);
    const candidateServerUrl = payload?.serverUrl ?? rawUrl;
    const normalized = normalizeDevServerUrl(candidateServerUrl);
    if (!normalized) {
      toast.error("Invalid QR code. Use a valid Camel mobile login QR.");
      return;
    }

    const pairedApiUrl = payload?.backendUrl ?? (manualApiUrl.trim() || null);
    const saved = await setPairedAppConfig(normalized, pairedApiUrl);
    setExistingUrl(saved.serverUrl);
    setExistingApiUrl(saved.apiUrl);
    setManualUrl(saved.serverUrl);
    setManualApiUrl(saved.apiUrl ?? "");

    if (payload?.token) {
      const currentOrigin = normalizeDevServerUrl(window.location.origin);
      if (currentOrigin !== saved.serverUrl) {
        toast.success("Connecting and signing you in...");
        switchToPairedServerUrl(`${saved.serverUrl}/mobile/consume-login?t=${encodeURIComponent(payload.token)}`);
        return;
      }

      try {
        const data = await AuthApi.consumeMobileLoginToken(payload.token);
        setUser(data.user);
        toast.success(`Signed in as @${data.user.username}.`);
        switchToPairedServerUrl(saved.serverUrl);
        return;
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to complete mobile sign-in.";
        toast.error(message);
        switchToPairedServerUrl(`${saved.serverUrl}/mobile/consume-login?t=${encodeURIComponent(payload.token)}`);
        return;
      }
    }

    toast.success("Server paired. Continue with login.");
    switchToPairedServerUrl(saved.serverUrl);
  };

  const saveManual = async () => {
    setBusy(true);
    try {
      await savePairing(manualUrl);
    } finally {
      setBusy(false);
    }
  };

  const clearPairing = async () => {
    setBusy(true);
    try {
      await clearPairedServerUrl();
      setExistingUrl(null);
      setExistingApiUrl(null);
      setManualUrl("");
      setManualApiUrl("");
      toast.success("Paired server cleared.");
    } finally {
      setBusy(false);
    }
  };

  const restartApp = async () => {
    if (!isNativeApp()) return;
    await AppPlugin.exitApp();
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-xl space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/login">
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Pair With Server
            </CardTitle>
            <CardDescription>
              Scan the QR from Settings then Add Mobile Device in the web app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Current server: {existingUrl ?? "Not paired"}
            </div>

            {existingApiUrl ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                Current backend: {existingApiUrl}
              </div>
            ) : null}

            {!supportsInAppScan && isNativeApp() ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                On iPhone, open the Camera app and scan the iPhone QR shown in Camel Settings. Camel will open automatically and finish sign-in.
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {supportsInAppScan ? (
                <Button type="button" onClick={() => void scanQr()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                  Scan QR
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => void restartApp()} disabled={!isNativeApp()}>
                <RefreshCw className="h-4 w-4" />
                Restart App (Fallback)
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-server-url">Manual URL (fallback)</Label>
              <Input
                id="manual-server-url"
                value={manualUrl}
                onChange={(event) => setManualUrl(event.target.value)}
                placeholder="http://192.168.1.6:5173"
              />
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <QrCode className="h-3.5 w-3.5" />
                Supports QR login, local, VPN, staging, and production URLs.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-api-url">Manual Backend URL (optional)</Label>
              <Input
                id="manual-api-url"
                value={manualApiUrl}
                onChange={(event) => setManualApiUrl(event.target.value)}
                placeholder="https://api.example.com"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank when the backend is on the same origin as the frontend.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void saveManual()} disabled={busy}>
                <Save className="h-4 w-4" />
                Save URL
              </Button>
              <Button type="button" variant="outline" onClick={() => void clearPairing()} disabled={busy}>
                Clear pairing
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
