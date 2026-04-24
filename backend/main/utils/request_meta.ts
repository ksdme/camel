import type { IncomingMessage, IncomingHttpHeaders } from "node:http";

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }
  return value?.trim() || undefined;
}

function firstForwardedIp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const first = value.split(",")[0]?.trim();
  return first || undefined;
}

export function requestMetaFromHeaders(headers: IncomingHttpHeaders): RequestMeta {
  const xForwardedFor = firstForwardedIp(firstHeaderValue(headers["x-forwarded-for"]));
  const xRealIp = firstHeaderValue(headers["x-real-ip"]);
  const remote = xForwardedFor ?? xRealIp;
  const userAgent = firstHeaderValue(headers["user-agent"]);

  return {
    ipAddress: remote,
    userAgent,
  };
}

export function requestMetaFromIncomingMessage(req: IncomingMessage): RequestMeta {
  return requestMetaFromHeaders(req.headers);
}
