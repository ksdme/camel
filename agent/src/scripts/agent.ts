import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { openDatabase, type SqliteDatabase } from "../db/sqlite";

type MarkdownEntryRow = {
  entry_path: string;
  name: string;
  is_directory: number;
  parent_name_normalized: string | null;
  markdown_content: string | null;
  updated_at: string;
};

type ListEntryRow = Pick<
  MarkdownEntryRow,
  | "entry_path"
  | "name"
  | "is_directory"
  | "parent_name_normalized"
  | "updated_at"
>;

type OutlineEntryRow = Pick<
  MarkdownEntryRow,
  | "entry_path"
  | "name"
  | "parent_name_normalized"
  | "markdown_content"
  | "updated_at"
>;

function requirePrompt(argv: string[]): string {
  const prompt = argv[2]?.trim();

  if (prompt) {
    return prompt;
  }

  throw new Error(
    'Missing prompt. Usage: npm run agent -- "What notes mention sqlite?" [db-path]',
  );
}

function getDbPath(argv: string[]): string {
  return argv[3] ?? "./notes.db";
}

function logToolCall(toolName: string, input: unknown): void {
  const timestamp = new Date().toISOString();
  const serializedInput = JSON.stringify(input, null, 2);
  console.error(`[ai-sdk] ${timestamp} tool.${toolName}`);
  console.error(serializedInput);
}

function makeSnippet(
  content: string | null,
  query: string,
  maxChars = 500,
): string | null {
  if (!content) {
    return null;
  }

  const normalizedContent = content.replace(/\s+/g, " ").trim();
  if (!normalizedContent) {
    return null;
  }

  const lowerContent = normalizedContent.toLowerCase();
  const lowerQuery = query.trim().toLowerCase();

  if (!lowerQuery) {
    return normalizedContent.slice(0, maxChars);
  }

  const matchIndex = lowerContent.indexOf(lowerQuery);
  if (matchIndex === -1) {
    return normalizedContent.slice(0, maxChars);
  }

  const halfWindow = Math.floor(maxChars / 2);
  const start = Math.max(0, matchIndex - halfWindow);
  const end = Math.min(normalizedContent.length, start + maxChars);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalizedContent.length ? "..." : "";

  return `${prefix}${normalizedContent.slice(start, end)}${suffix}`;
}

function extractMarkdownOutline(
  content: string | null,
  maxHeadings: number,
): Array<{ level: number; heading: string }> {
  if (!content) {
    return [];
  }

  const headings: Array<{ level: number; heading: string }> = [];

  for (const line of content.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());
    if (!match) {
      continue;
    }

    headings.push({
      level: match[1].length,
      heading: match[2].replace(/\s+#+\s*$/, "").trim(),
    });

    if (headings.length >= maxHeadings) {
      break;
    }
  }

  return headings;
}

function extractLeadParagraph(content: string | null, maxChars = 240): string | null {
  if (!content) {
    return null;
  }

  const withoutHeadings = content
    .split(/\r?\n/)
    .filter((line) => !/^\s*#{1,6}\s+/.test(line))
    .join("\n");

  const paragraph = withoutHeadings
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .find(Boolean);

  if (!paragraph) {
    return null;
  }

  return paragraph.slice(0, maxChars);
}

function createTools(db: SqliteDatabase) {
  return {
    listEntries: tool({
      description:
        "List files and directories stored in the markdown_entries table. Use this to browse what exists before opening specific entries.",
      inputSchema: z.object({
        parentNameNormalized: z
          .string()
          .trim()
          .min(1)
          .nullable()
          .optional()
          .describe(
            "Optional normalized parent name to filter by. Use null to inspect top-level entries.",
          ),
        directoriesOnly: z
          .boolean()
          .optional()
          .describe("When true, only return directory rows."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25)
          .describe("Maximum number of rows to return."),
      }),
      execute: async ({ parentNameNormalized, directoriesOnly, limit }) => {
        const where: string[] = [];
        const params: Array<string | number | null> = [];

        if (parentNameNormalized === null) {
          where.push("parent_name_normalized IS NULL");
        } else if (typeof parentNameNormalized === "string") {
          where.push("parent_name_normalized = ?");
          params.push(parentNameNormalized);
        }

        if (directoriesOnly) {
          where.push("is_directory = 1");
        }

        const sql = `
          SELECT entry_path, name, is_directory, parent_name_normalized, updated_at
          FROM markdown_entries
          ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY is_directory DESC, entry_path ASC
          LIMIT ?
        `;

        const rows = db.prepare(sql).all(...params, limit) as ListEntryRow[];

        return {
          count: rows.length,
          entries: rows.map((row) => ({
            entryPath: row.entry_path,
            name: row.name,
            isDirectory: Boolean(row.is_directory),
            parentNameNormalized: row.parent_name_normalized,
            updatedAt: row.updated_at,
          })),
        };
      },
    }),
    searchEntries: tool({
      description:
        "Search entry paths, names, and markdown content using a case-insensitive substring match.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("Search phrase."),
        markdownOnly: z
          .boolean()
          .default(false)
          .describe("When true, limit results to markdown file rows."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Maximum number of matches to return."),
      }),
      execute: async ({ query, markdownOnly, limit }) => {
        const like = `%${query}%`;
        const sql = `
          SELECT entry_path, name, is_directory, markdown_content, updated_at
          FROM markdown_entries
          WHERE (
            entry_path LIKE ? COLLATE NOCASE
            OR name LIKE ? COLLATE NOCASE
            OR COALESCE(markdown_content, '') LIKE ? COLLATE NOCASE
          )
          ${markdownOnly ? "AND is_directory = 0" : ""}
          ORDER BY
            CASE
              WHEN entry_path LIKE ? COLLATE NOCASE THEN 0
              WHEN name LIKE ? COLLATE NOCASE THEN 1
              ELSE 2
            END,
            entry_path ASC
          LIMIT ?
        `;

        const rows = db
          .prepare(sql)
          .all(like, like, like, like, like, limit) as MarkdownEntryRow[];

        return {
          count: rows.length,
          matches: rows.map((row) => ({
            entryPath: row.entry_path,
            name: row.name,
            isDirectory: Boolean(row.is_directory),
            updatedAt: row.updated_at,
            snippet: makeSnippet(row.markdown_content, query),
          })),
        };
      },
    }),
    getEntry: tool({
      description:
        "Fetch one entry by its exact entry_path. Returns metadata and markdown content when available.",
      inputSchema: z.object({
        entryPath: z
          .string()
          .trim()
          .min(1)
          .describe("Exact entry_path value from the database."),
        maxCharacters: z
          .number()
          .int()
          .min(200)
          .max(20000)
          .default(8000)
          .describe("Maximum markdown characters to return."),
      }),
      execute: async ({ entryPath, maxCharacters }) => {
        const row = db
          .prepare(
            `
              SELECT entry_path, name, is_directory, parent_name_normalized, markdown_content, updated_at
              FROM markdown_entries
              WHERE entry_path = ?
            `,
          )
          .get(entryPath) as MarkdownEntryRow | undefined;

        if (!row) {
          return {
            found: false,
            entryPath,
          };
        }

        return {
          found: true,
          entry: {
            entryPath: row.entry_path,
            name: row.name,
            isDirectory: Boolean(row.is_directory),
            parentNameNormalized: row.parent_name_normalized,
            updatedAt: row.updated_at,
            markdownContent:
              row.markdown_content === null
                ? null
                : row.markdown_content.slice(0, maxCharacters),
            markdownWasTruncated:
              row.markdown_content !== null &&
              row.markdown_content.length > maxCharacters,
          },
        };
      },
    }),
    exploreOutlines: tool({
      description:
        "Explore the structure of markdown files by returning headings and a short lead paragraph. Use this when keyword search is weak or you want to browse interesting content by outline.",
      inputSchema: z.object({
        parentNameNormalized: z
          .string()
          .trim()
          .min(1)
          .nullable()
          .optional()
          .describe(
            "Optional normalized parent name to narrow the files. Use null for top-level files.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(30)
          .default(10)
          .describe("Maximum number of markdown files to inspect."),
        headingsPerFile: z
          .number()
          .int()
          .min(1)
          .max(12)
          .default(6)
          .describe("Maximum number of headings to include per file."),
      }),
      execute: async ({ parentNameNormalized, limit, headingsPerFile }) => {
        const where = ["is_directory = 0", "markdown_content IS NOT NULL"];
        const params: Array<string | number | null> = [];

        if (parentNameNormalized === null) {
          where.push("parent_name_normalized IS NULL");
        } else if (typeof parentNameNormalized === "string") {
          where.push("parent_name_normalized = ?");
          params.push(parentNameNormalized);
        }

        const rows = db
          .prepare(
            `
              SELECT entry_path, name, parent_name_normalized, markdown_content, updated_at
              FROM markdown_entries
              WHERE ${where.join(" AND ")}
              ORDER BY updated_at DESC, entry_path ASC
              LIMIT ?
            `,
          )
          .all(...params, limit) as OutlineEntryRow[];

        return {
          count: rows.length,
          files: rows.map((row) => ({
            entryPath: row.entry_path,
            name: row.name,
            parentNameNormalized: row.parent_name_normalized,
            updatedAt: row.updated_at,
            leadParagraph: extractLeadParagraph(row.markdown_content),
            outline: extractMarkdownOutline(
              row.markdown_content,
              headingsPerFile,
            ),
          })),
        };
      },
    }),
  };
}

async function main(): Promise<void> {
  const prompt = requirePrompt(process.argv);
  const dbPath = getDbPath(process.argv);
  const modelId = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
  const db = openDatabase(dbPath);

  try {
    const agent = new ToolLoopAgent({
      model: openrouter(modelId),
      instructions: `
You are a database exploration agent for a markdown content index stored in SQLite.

Rules:
- Use tools to inspect the database before making claims.
- If direct keyword search is weak, use outline exploration to browse structure and find likely relevant files.
- When answering, reference exact entry paths when possible.
- Keep answers concise and factual.
- If the database does not contain enough evidence, say so clearly.
      `.trim(),
      tools: createTools(db),
      stopWhen: stepCountIs(8),
      onStepFinish: (step) => {
        for (const toolCall of step.toolCalls) {
          logToolCall(toolCall.toolName, toolCall.input);
        }
      },
    });

    const result = await agent.generate({ prompt });
    const output = result.text.trim();

    if (!output) {
      throw new Error("The agent completed without returning text.");
    }

    console.log(output);
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error("Agent failed:", error);
  process.exitCode = 1;
});
