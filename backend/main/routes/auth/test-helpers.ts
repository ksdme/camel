import { Readable } from "node:stream";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

interface InvokeOptions {
  body?: unknown;
  headers?: IncomingHttpHeaders;
}

interface InvokeResult {
  statusCode: number;
  headers: Record<string, string | string[] | number>;
  text: string;
  json: unknown;
}

export async function invokeRawHandler(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  options: InvokeOptions = {},
): Promise<InvokeResult> {
  const req = Readable.from(
    options.body === undefined ? [] : [JSON.stringify(options.body)],
  ) as IncomingMessage;
  req.headers = options.body === undefined
    ? { ...(options.headers ?? {}) }
    : { "content-type": "application/json", ...(options.headers ?? {}) };

  let statusCode = 200;
  const headers: Record<string, string | string[] | number> = {};
  let text = "";

  const res = {
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    writeHead(code: number, nextHeaders?: Record<string, string | string[] | number>) {
      statusCode = code;
      if (nextHeaders) {
        for (const [name, value] of Object.entries(nextHeaders)) {
          headers[name.toLowerCase()] = value;
        }
      }
      return this;
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) {
        text += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
      }
      return this;
    },
  } as unknown as ServerResponse;

  await handler(req, res);

  return {
    statusCode,
    headers,
    text,
    json: text.length > 0 ? JSON.parse(text) : undefined,
  };
}
