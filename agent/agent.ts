import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

type JsonEntry = {
  entryPath: string;
  parentPath: string | null;
  name: string;
  isDirectory: boolean;
  content: string | null;
  summary: string | null;
};

type JsonExport = {
  rootDir: string;
  generatedAt: string;
  model?: string;
  entries: JsonEntry[];
};

type DirectoryTreeNode = {
  entryPath: string;
  name: string;
  childDirectoryCount: number;
  noteCount: number;
  children: DirectoryTreeNode[];
};

function requirePrompt(argv: string[]): string {
  const prompt = argv[2]?.trim();

  if (prompt) {
    return prompt;
  }

  throw new Error(
    'Missing prompt. Usage: npm run agent -- "What notes mention auth?" [json-path]',
  );
}

function getJsonPath(argv: string[]): string {
  return path.resolve(argv[3] ?? "./markdown-export.json");
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

function normalizeName(name: string | null): string | null {
  if (!name) {
    return null;
  }

  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || null
  );
}

function parentNameNormalizedForEntry(entry: JsonEntry): string | null {
  if (!entry.parentPath) {
    return null;
  }

  return normalizeName(path.basename(entry.parentPath));
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

function extractLeadParagraph(
  content: string | null,
  maxChars = 240,
): string | null {
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

async function loadExport(jsonPath: string): Promise<JsonExport> {
  const raw = await readFile(jsonPath, "utf8");
  const parsed = JSON.parse(raw) as JsonExport;

  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid export file: ${jsonPath}`);
  }

  return parsed;
}

function normalizePathSegment(segment: string): string {
  const normalized = segment.replace(/\s+/g, " ").trim();

  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("Path segments must not be empty, '.' or '..'.");
  }

  if (normalized.includes("/") || normalized.includes("\\")) {
    throw new Error("Path segments must not contain path separators.");
  }

  return normalized;
}

function resolveNotePath(inputPath: string): {
  entryPath: string;
  parentPath: string | null;
  directoryPaths: string[];
} {
  const trimmedPath = inputPath.trim().replace(/\\/g, "/");

  if (!trimmedPath) {
    throw new Error("Note path must not be empty.");
  }

  if (path.posix.isAbsolute(trimmedPath)) {
    throw new Error("Note path must be relative to the notes root.");
  }

  const rawSegments = trimmedPath.split("/").filter(Boolean);
  if (rawSegments.length === 0) {
    throw new Error("Note path must contain at least one segment.");
  }

  const normalizedSegments = rawSegments.map(normalizePathSegment);
  const fileName = normalizedSegments.at(-1);

  if (!fileName) {
    throw new Error("Note path must include a note name.");
  }

  const noteFileName = /\.md$/i.test(fileName) ? fileName : `${fileName}.md`;
  const directorySegments = normalizedSegments.slice(0, -1);
  const entryPath = [...directorySegments, noteFileName].join("/");
  const parentPath =
    directorySegments.length === 0 ? null : directorySegments.join("/");
  const directoryPaths = directorySegments.map((_, index) =>
    directorySegments.slice(0, index + 1).join("/"),
  );

  return {
    entryPath,
    parentPath,
    directoryPaths,
  };
}

function buildDirectoryTree(
  entries: JsonEntry[],
  parentPath: string | null,
  depth: number,
): DirectoryTreeNode[] {
  if (depth < 0) {
    return [];
  }

  const directories = entries
    .filter((entry) => entry.isDirectory && entry.parentPath === parentPath)
    .sort((left, right) => left.entryPath.localeCompare(right.entryPath));

  return directories.map((directory) => ({
    entryPath: directory.entryPath,
    name: directory.name,
    childDirectoryCount: entries.filter(
      (entry) => entry.isDirectory && entry.parentPath === directory.entryPath,
    ).length,
    noteCount: entries.filter(
      (entry) => !entry.isDirectory && entry.parentPath === directory.entryPath,
    ).length,
    children:
      depth === 0
        ? []
        : buildDirectoryTree(entries, directory.entryPath, depth - 1),
  }));
}

function createTools(rootDir: string, entries: JsonEntry[]) {
  return {
    listEntries: tool({
      description:
        "List files and directories stored in the JSON export. Use this to browse what exists before opening specific entries.",
      inputSchema: z.object({
        parentPath: z
          .string()
          .trim()
          .min(1)
          .nullable()
          .optional()
          .describe(
            "Optional parent path filter. Use null to inspect top-level entries.",
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
      execute: async ({ parentPath, directoriesOnly, limit }) => {
        const rows = entries
          .filter((entry) => {
            if (parentPath === null) {
              return entry.parentPath === null;
            }

            if (
              typeof parentPath === "string" &&
              entry.parentPath !== parentPath
            ) {
              return false;
            }

            if (directoriesOnly && !entry.isDirectory) {
              return false;
            }

            return true;
          })
          .sort((left, right) => {
            if (left.isDirectory !== right.isDirectory) {
              return left.isDirectory ? -1 : 1;
            }

            return left.entryPath.localeCompare(right.entryPath);
          })
          .slice(0, limit);

        return {
          count: rows.length,
          entries: rows.map((entry) => ({
            entryPath: entry.entryPath,
            name: entry.name,
            isDirectory: entry.isDirectory,
            parentPath: entry.parentPath,
            parentNameNormalized: parentNameNormalizedForEntry(entry),
          })),
        };
      },
    }),
    exploreFolderLayout: tool({
      description:
        "Explore the current directory layout of the notes database. Use this before creating notes so you can prefer existing folders and only create new directories when truly necessary.",
      inputSchema: z.object({
        parentPath: z
          .string()
          .trim()
          .min(1)
          .nullable()
          .optional()
          .describe(
            "Optional directory to explore. Use null for the top level.",
          ),
        maxDepth: z
          .number()
          .int()
          .min(0)
          .max(4)
          .default(2)
          .describe("How many nested directory levels to include."),
      }),
      execute: async ({ parentPath, maxDepth }) => {
        const directories = buildDirectoryTree(
          entries,
          parentPath ?? null,
          maxDepth,
        );

        return {
          root: parentPath ?? null,
          directoryCount: directories.length,
          directories,
        };
      },
    }),
    searchEntries: tool({
      description:
        "Search entry paths, names, markdown content, and summaries using a case-insensitive substring match.",
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
        const normalizedQuery = query.toLowerCase();
        const rows = entries
          .filter((entry) => {
            if (markdownOnly && entry.isDirectory) {
              return false;
            }

            const haystacks = [
              entry.entryPath,
              entry.name,
              entry.content ?? "",
              entry.summary ?? "",
            ].map((value) => value.toLowerCase());

            return haystacks.some((value) => value.includes(normalizedQuery));
          })
          .sort((left, right) => {
            const leftScore = left.entryPath
              .toLowerCase()
              .includes(normalizedQuery)
              ? 0
              : left.name.toLowerCase().includes(normalizedQuery)
                ? 1
                : left.summary?.toLowerCase().includes(normalizedQuery)
                  ? 2
                  : 3;
            const rightScore = right.entryPath
              .toLowerCase()
              .includes(normalizedQuery)
              ? 0
              : right.name.toLowerCase().includes(normalizedQuery)
                ? 1
                : right.summary?.toLowerCase().includes(normalizedQuery)
                  ? 2
                  : 3;

            if (leftScore !== rightScore) {
              return leftScore - rightScore;
            }

            return left.entryPath.localeCompare(right.entryPath);
          })
          .slice(0, limit);

        return {
          count: rows.length,
          matches: rows.map((entry) => ({
            entryPath: entry.entryPath,
            name: entry.name,
            isDirectory: entry.isDirectory,
            parentPath: entry.parentPath,
            summary: entry.summary,
            snippet: makeSnippet(entry.content, query),
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
        const entry = entries.find((item) => item.entryPath === entryPath);

        if (!entry) {
          return {
            found: false,
            entryPath,
          };
        }

        return {
          found: true,
          entry: {
            entryPath: entry.entryPath,
            name: entry.name,
            isDirectory: entry.isDirectory,
            parentPath: entry.parentPath,
            parentNameNormalized: parentNameNormalizedForEntry(entry),
            summary: entry.summary,
            markdownContent:
              entry.content === null
                ? null
                : entry.content.slice(0, maxCharacters),
            markdownWasTruncated:
              entry.content !== null && entry.content.length > maxCharacters,
          },
        };
      },
    }),
    exploreOutlines: tool({
      description:
        "Explore the structure of markdown files by returning headings and a short lead paragraph. Use this when keyword search is weak or you want to browse interesting content by outline.",
      inputSchema: z.object({
        parentPath: z
          .string()
          .trim()
          .min(1)
          .nullable()
          .optional()
          .describe(
            "Optional parent path to narrow the files. Use null for top-level files.",
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
      execute: async ({ parentPath, limit, headingsPerFile }) => {
        const rows = entries
          .filter((entry) => {
            if (entry.isDirectory || entry.content === null) {
              return false;
            }

            if (parentPath === null) {
              return entry.parentPath === null;
            }

            if (typeof parentPath === "string") {
              return entry.parentPath === parentPath;
            }

            return true;
          })
          .sort((left, right) => left.entryPath.localeCompare(right.entryPath))
          .slice(0, limit);

        return {
          count: rows.length,
          files: rows.map((entry) => ({
            entryPath: entry.entryPath,
            name: entry.name,
            parentPath: entry.parentPath,
            parentNameNormalized: parentNameNormalizedForEntry(entry),
            summary: entry.summary,
            leadParagraph: extractLeadParagraph(entry.content),
            outline: extractMarkdownOutline(entry.content, headingsPerFile),
          })),
        };
      },
    }),
    createNote: tool({
      description:
        "Create a markdown note under the notes root. This tool organizes the note into a proper nested path, creates missing parent directories, and appends .md when needed.",
      inputSchema: z.object({
        notePath: z
          .string()
          .trim()
          .min(1)
          .describe(
            "Relative note path under the notes root, for example 'Personal/Ideas/New Idea' or 'Work/Notes/Meeting.md'.",
          ),
        content: z
          .string()
          .default("")
          .describe("Initial markdown content for the note."),
        createParentsIfMissing: z
          .boolean()
          .default(false)
          .describe(
            "When true, create missing parent directories. Leave false to prefer the existing folder layout.",
          ),
        overwrite: z
          .boolean()
          .default(false)
          .describe("When true, replace an existing note at the same path."),
      }),
      execute: async ({
        notePath,
        content,
        createParentsIfMissing,
        overwrite,
      }) => {
        const { entryPath, parentPath, directoryPaths } =
          resolveNotePath(notePath);
        const existingEntry = entries.find(
          (entry) => entry.entryPath === entryPath,
        );
        const directoriesCreated: string[] = [];
        const missingDirectories = directoryPaths.filter(
          (directoryPath) =>
            !entries.some(
              (entry) => entry.entryPath === directoryPath && entry.isDirectory,
            ),
        );

        if (existingEntry && existingEntry.isDirectory) {
          throw new Error(`A directory already exists at '${entryPath}'.`);
        }

        if (existingEntry && !overwrite) {
          return {
            created: false,
            reason: "already_exists",
            entryPath,
            parentPath,
          };
        }

        if (missingDirectories.length > 0 && !createParentsIfMissing) {
          return {
            created: false,
            reason: "missing_parent_directories",
            entryPath,
            parentPath,
            missingDirectories,
          };
        }

        const absolutePath = path.join(rootDir, ...entryPath.split("/"));
        const absoluteParentPath =
          parentPath === null
            ? rootDir
            : path.join(rootDir, ...parentPath.split("/"));

        await mkdir(absoluteParentPath, { recursive: true });
        await writeFile(absolutePath, content, "utf8");

        for (const directoryPath of directoryPaths) {
          const hasDirectory = entries.some(
            (entry) => entry.entryPath === directoryPath && entry.isDirectory,
          );

          if (hasDirectory) {
            continue;
          }

          const directoryParentPath =
            path.posix.dirname(directoryPath) === "."
              ? null
              : path.posix.dirname(directoryPath);
          directoriesCreated.push(directoryPath);

          entries.push({
            entryPath: directoryPath,
            parentPath: directoryParentPath,
            name: path.posix.basename(directoryPath),
            isDirectory: true,
            content: null,
            summary: null,
          });
        }

        if (existingEntry) {
          existingEntry.content = content;
          existingEntry.summary = null;
        } else {
          entries.push({
            entryPath,
            parentPath,
            name: path.posix.basename(entryPath),
            isDirectory: false,
            content,
            summary: null,
          });
        }

        return {
          created: true,
          entryPath,
          parentPath,
          absolutePath,
          directoriesCreated,
          overwritten: Boolean(existingEntry),
        };
      },
    }),
    updateNote: tool({
      description:
        "Update an existing markdown note by exact path. Use this when the user wants to modify a note that already exists.",
      inputSchema: z.object({
        entryPath: z
          .string()
          .trim()
          .min(1)
          .describe(
            "Exact existing note path, for example 'Personal/Notes.md'.",
          ),
        content: z.string().describe("Markdown content to write or append."),
        mode: z
          .enum(["replace", "append", "prepend"])
          .default("replace")
          .describe(
            "How the new content should be applied to the existing note.",
          ),
      }),
      execute: async ({ entryPath, content, mode }) => {
        const normalizedPath = resolveNotePath(entryPath).entryPath;
        const existingEntry = entries.find(
          (entry) => entry.entryPath === normalizedPath,
        );

        if (!existingEntry) {
          return {
            updated: false,
            reason: "not_found",
            entryPath: normalizedPath,
          };
        }

        if (existingEntry.isDirectory) {
          throw new Error(`'${normalizedPath}' is a directory, not a note.`);
        }

        const currentContent = existingEntry.content ?? "";
        const nextContent =
          mode === "append"
            ? `${currentContent}${content}`
            : mode === "prepend"
              ? `${content}${currentContent}`
              : content;
        const absolutePath = path.join(rootDir, ...normalizedPath.split("/"));

        await writeFile(absolutePath, nextContent, "utf8");

        existingEntry.content = nextContent;
        existingEntry.summary = null;

        return {
          updated: true,
          entryPath: normalizedPath,
          absolutePath,
          mode,
          previousLength: currentContent.length,
          nextLength: nextContent.length,
        };
      },
    }),
  };
}

async function main(): Promise<void> {
  const prompt = requirePrompt(process.argv);
  const jsonPath = getJsonPath(process.argv);
  const modelId = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
  const dataset = await loadExport(jsonPath);

  const agent = new ToolLoopAgent({
    model: openrouter(modelId),
    instructions: `
You are a document exploration agent for a markdown notes workspace.

Rules:
- Use tools to inspect the database before making claims.
- If direct keyword search is weak, use outline exploration to browse structure and find likely relevant files.
- When answering, reference exact entry paths when possible.
- Use exploreFolderLayout or listEntries to understand the current folder structure before creating notes.
- Prefer existing directories wherever possible. Only create new directories when the current structure clearly does not fit.
- When asked to create a note, use the createNote tool instead of only describing what should be created.
- When asked to change an existing note, use the updateNote tool with the exact existing note path.
- Keep answers concise and factual.
- If the database does not contain enough evidence, say so clearly.
    `.trim(),
    tools: createTools(dataset.rootDir, dataset.entries),
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
}

main().catch((error: unknown) => {
  console.error("Agent failed:", error);
  process.exitCode = 1;
});
