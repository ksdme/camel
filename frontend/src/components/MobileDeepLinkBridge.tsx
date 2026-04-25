import { useEffect } from "react";
import { App as AppPlugin } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useNavigate } from "react-router-dom";
import { setPairedAppConfig, switchToPairedServerUrl } from "@/lib/dev-pairing";
import { extractMobileLoginPayload } from "@/lib/mobile-pairing";
import { toast } from "sonner";

export function MobileDeepLinkBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleIncomingUrl = async (url: string) => {
      const payload = extractMobileLoginPayload(url);
      if (!payload) return;

      try {
        const saved = await setPairedAppConfig(payload.serverUrl, payload.backendUrl);
        if (payload.token) {
          toast.success("Opening Camel and signing in...");
          switchToPairedServerUrl(`${saved.serverUrl}/mobile/consume-login?t=${encodeURIComponent(payload.token)}`);
          return;
        }

        toast.success("Server paired from QR link.");
        switchToPairedServerUrl(saved.serverUrl);
      } catch {
        toast.error("QR link did not contain a valid sign-in payload.");
        navigate("/mobile/pair", { replace: true });
      }
    };

    void AppPlugin.getLaunchUrl().then((launch) => {
      if (launch?.url) {
        void handleIncomingUrl(launch.url);
      }
    });

    let active = true;
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    void AppPlugin.addListener("appUrlOpen", ({ url }) => {
      if (!active || !url) return;
      void handleIncomingUrl(url);
    }).then((listener) => {
      listenerHandle = listener;
      if (!active) {
        void listener.remove();
      }
    });

    return () => {
      active = false;
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, [navigate]);

  return null;
}
