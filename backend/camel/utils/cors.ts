import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * CORS is handled by Encore's built-in middleware.
 * Keep this helper as a no-op so raw handlers can call it without emitting
 * duplicate Access-Control-* headers.
 */
export function applyCors(_req: IncomingMessage, _res: ServerResponse): boolean {
  return false;
}
