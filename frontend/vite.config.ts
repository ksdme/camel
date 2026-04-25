import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import * as QRCode from "qrcode";
import { loadEnv } from "vite";
import { defineConfig } from "vite-plus";

function firstNonEmpty(...values: Array<string | undefined | null>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function createPairingPlugin(env: Record<string, string>) {
  const explicitPairingUrl = firstNonEmpty(
    env.CAMEL_PAIRING_URL,
    env.VITE_PAIRING_URL,
    env.VITE_PUBLIC_APP_URL,
    env.VITE_PUBLIC_BASE_URL,
    env.PUBLIC_APP_URL,
    env.APP_URL,
  );
  let pairingUrl: string | null = null;

  const ensurePairingData = async (port: number, useHttps: boolean) => {
    if (pairingUrl) return true;

    if (explicitPairingUrl) {
      const normalizedExplicit = normalizePairingUrl(explicitPairingUrl);
      if (normalizedExplicit) {
        pairingUrl = normalizedExplicit;
        return true;
      }
    }

    const host = pickLanAddress();
    if (!host) return false;

    const resolvedUrl = `${useHttps ? "https" : "http"}://${host}:${port}`;
    pairingUrl = normalizePairingUrl(resolvedUrl);
    return Boolean(pairingUrl);
  };

  return {
    name: "camel-pairing",
    apply: "serve" as const,
    configureServer(server: {
      config: { logger: { info: (message: string) => void }; server: { port?: number; https?: unknown } };
      httpServer?: { once: (event: "listening", cb: () => void) => void; listening?: boolean };
      middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void };
    }) {
      const logPairing = async () => {
        const port = server.config.server.port ?? 5173;
        const hasPairing = await ensurePairingData(port, Boolean(server.config.server.https));
        if (!hasPairing || !pairingUrl) {
          server.config.logger.info(
            "[camel] Mobile pairing: could not determine a reachable pairing URL. Set CAMEL_PAIRING_URL or VITE_PUBLIC_APP_URL for public domains, tunnels, or public IPs.",
          );
          return;
        }

        const terminalQr = await QRCode.toString(pairingUrl, { type: "terminal", small: true });
        server.config.logger.info(
          [
            "",
            "Camel mobile pairing QR:",
            terminalQr,
            `URL: ${pairingUrl}`,
            "Open this in browser: /__pair",
            "",
          ].join("\n"),
        );
      };

      if (server.httpServer?.listening) {
        void logPairing();
      } else {
        server.httpServer?.once("listening", () => {
          void logPairing();
        });
      }

      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        void (async () => {
          const requestUrl = req.url ? new URL(req.url, "http://camel.local") : null;
          const pathname = requestUrl?.pathname ?? "";
          const port = server.config.server.port ?? 5173;
          const useHttps = Boolean(server.config.server.https);

          await ensurePairingData(port, useHttps);
          const effectivePairingUrl = resolvePairingUrlFromRequest(req, pairingUrl ?? "", useHttps);
          if (!effectivePairingUrl) {
            if (pathname.startsWith("/__pair")) {
              sendJson(res, 503, { error: "Pairing unavailable" });
              return;
            }
            next();
            return;
          }

          if (pathname === "/__pair/meta") {
            sendJson(res, 200, { url: effectivePairingUrl });
            return;
          }

          if (pathname === "/__pair/qr.svg") {
            const qrSvg = await QRCode.toString(effectivePairingUrl, { type: "svg", margin: 1, width: 320 });
            sendText(res, 200, "image/svg+xml; charset=utf-8", qrSvg);
            return;
          }

          if (pathname === "/__pair") {
            sendText(res, 200, "text/html; charset=utf-8", renderPairingHtml(effectivePairingUrl));
            return;
          }

          next();
        })().catch(() => {
          next();
        });
      });
    },
  };
}

function renderPairingHtml(url: string) {
  const safeUrl = escapeHtml(url);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>Camel Mobile Pairing</title>",
    "<style>",
    "body{font-family:ui-sans-serif,system-ui;margin:0;background:#f7f8fb;color:#111827;}",
    ".wrap{max-width:720px;margin:40px auto;padding:24px;}",
    ".card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:20px;}",
    "h1{margin:0 0 10px;font-size:24px;}",
    "p{margin:0 0 10px;color:#4b5563;line-height:1.5;}",
    "code{display:block;background:#f3f4f6;border-radius:8px;padding:10px;margin:10px 0;word-break:break-all;}",
    ".qr{margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:10px;display:inline-block;background:#fff;}",
    "a{color:#1d4ed8;text-decoration:none;}a:hover{text-decoration:underline;}",
    "</style>",
    "</head>",
    "<body>",
    '<main class="wrap">',
    '<section class="card">',
    "<h1>Pair Camel Mobile App</h1>",
    "<p>Open Camel on your Android device, go to <strong>Pair with server</strong>, then scan this QR.</p>",
    `<code>${safeUrl}</code>`,
    '<div class="qr"><img src="/__pair/qr.svg" alt="Camel pairing QR" width="260" height="260" /></div>',
    "<p style=\"margin-top:14px\">You can also open this from the app at <a href=\"/settings\">Settings -> Add Mobile Device</a>.</p>",
    "</section>",
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendText(res: ServerResponse, status: number, contentType: string, body: string) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", contentType);
  res.end(body);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function resolvePairingUrlFromRequest(
  req: IncomingMessage,
  fallbackUrl: string,
  defaultHttps: boolean,
) {
  const candidateHost = firstHeaderValue(req.headers["x-forwarded-host"]) ?? firstHeaderValue(req.headers.host);
  if (!candidateHost) {
    return fallbackUrl;
  }

  const hostname = extractHostname(candidateHost);
  if (!hostname || isWildcardOrLocalHost(hostname)) {
    return fallbackUrl;
  }

  const forwardedProto = firstHeaderValue(req.headers["x-forwarded-proto"]);
  const protocol = forwardedProto === "https" || forwardedProto === "http"
    ? forwardedProto
    : defaultHttps
      ? "https"
      : "http";

  const normalized = normalizePairingUrl(`${protocol}://${candidateHost}`);
  return normalized ?? fallbackUrl;
}

function firstHeaderValue(value: string | string[] | undefined) {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw.split(",")[0]?.trim();
  return first || null;
}

function extractHostname(hostHeader: string) {
  const trimmed = hostHeader.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[")) {
    const match = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
    return match?.[1]?.toLowerCase() ?? null;
  }

  const [host] = trimmed.split(":");
  return host?.toLowerCase() ?? null;
}

function isWildcardOrLocalHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "127.0.0.1" ||
    hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("192.168.56.")
  );
}

function normalizePairingUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || isWildcardOrLocalHost(url.hostname.toLowerCase())) return null;
    if (url.username || url.password) return null;
    if (url.pathname && url.pathname !== "/") return null;
    if (url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function pickLanAddress() {
  const interfaces = os.networkInterfaces();
  const defaultRouteIp = detectDefaultRouteIp(interfaces);
  const blockedAddressPrefixes = ["192.168.56.", "169.254."];
  const blockedNameTokens = ["virtual", "vmware", "vbox", "hyper-v", "docker", "wsl", "loopback", "tailscale", "zerotier", "hamachi", "utun", "tun"];

  let bestCandidate: { address: string; score: number } | null = null;

  for (const [name, details] of Object.entries(interfaces)) {
    if (!details) continue;

    for (const detail of details) {
      const family = typeof detail.family === "string" ? detail.family : detail.family === 4 ? "IPv4" : "";
      if (family !== "IPv4" || detail.internal) continue;
      if (!isIpv4(detail.address)) continue;
      if (blockedAddressPrefixes.some((prefix) => detail.address.startsWith(prefix))) continue;
      if (blockedNameTokens.some((token) => name.toLowerCase().includes(token))) continue;

      let score = 0;
      if (defaultRouteIp && detail.address === defaultRouteIp) score += 100;
      if (isPrivateIpv4(detail.address)) score += 30;
      if (detail.address.startsWith("192.168.")) score += 15;
      if (detail.address.startsWith("10.")) score += 10;
      if (detail.address.startsWith("172.")) score -= 5;

      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { address: detail.address, score };
      }
    }
  }

  return bestCandidate?.address ?? null;
}

function detectDefaultRouteIp(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>) {
  try {
    if (process.platform === "win32") {
      const output = execSync("route print -4 0.0.0.0", { encoding: "utf8" });
      const lines = output.split(/\r?\n/).map((line) => line.trim());
      for (const line of lines) {
        const match = line.match(/^0\.0\.0\.0\s+0\.0\.0\.0\s+\d{1,3}(?:\.\d{1,3}){3}\s+(\d{1,3}(?:\.\d{1,3}){3})\s+\d+$/);
        if (match?.[1]) return match[1];
      }
      return null;
    }

    if (process.platform === "linux") {
      const output = execSync("ip route get 1.1.1.1", { encoding: "utf8" });
      const match = output.match(/\bsrc\s+(\d{1,3}(?:\.\d{1,3}){3})\b/);
      return match?.[1] ?? null;
    }

    if (process.platform === "darwin") {
      const output = execSync("route -n get default", { encoding: "utf8" });
      const ifaceMatch = output.match(/interface:\s+([A-Za-z0-9._-]+)/);
      const ifaceName = ifaceMatch?.[1];
      if (!ifaceName) return null;

      const candidates = interfaces[ifaceName] ?? [];
      const ipv4 = candidates.find((detail) => detail.family === "IPv4" && !detail.internal);
      return ipv4?.address ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

function isIpv4(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

function isPrivateIpv4(value: string) {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}

export default defineConfig({
  plugins: [react(), createPairingPlugin(loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), ""))],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: Object.fromEntries(
      ["/auth", "/folders", "/notes", "/tags", "/shares", "/settings"].map((p) => [
        p,
        { target: "http://127.0.0.1:4000", changeOrigin: false },
      ]),
    ),
  },

  fmt: {},
  lint: { options: { typeAware: true, typeCheck: true } },
});
