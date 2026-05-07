import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  cosineSimilarity,
  embed,
  embedMany,
  generateText,
  stepCountIs,
  tool,
  type ModelMessage,
} from "ai";
import { createHash } from "node:crypto";
import { glob } from "node:fs/promises";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import * as readline from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
const DEFAULT_TREE_DEPTH = 2;
const DEFAULT_SEARCH_RESULTS = 8;
const CHUNK_VERSION = 1;
const MARKDOWN_PATTERNS = ["**/*.md", "**/*.markdown", "**/*.mdx"] as const;
const GLOB_EXCLUDE = ["**/.git/**", "**/node_modules/**"] as const;
const DEFAULT_NOTES_DB_PATH = path.resolve(process.cwd(), "notes.db");

type CliOptions = {
  kbPath: string;
  model: string;
  prompt?: string;
};

type TreeNode = {
  directories: Map<string, TreeNode>;
  files: string[];
};

type ChunkRecord = {
  chunkId: string;
  relativePath: string;
  chunkIndex: number;
  headingPath: string;
  content: string;
  preview: string;
};

type IndexSyncResult = {
  indexedFiles: number;
  indexedChunks: number;
  removedFiles: number;
  totalFiles: number;
  totalChunks: number;
  embeddingModel: string;
};

function formatValue(value: unknown, maxLength = 600) {
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);

  if (!serialized) {
    return "(empty)";
  }

  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}\n...`;
}

function logBlock(title: string, lines: string[]) {
  const body = lines.map((line) => `  ${line}`).join("\n");
  console.error(`[agent] ${title}\n${body}\n`);
}

function logReasoning(stepNumber: number, reasoningText: string | undefined) {
  if (!reasoningText?.trim()) {
    return;
  }

  logBlock(`Thought · Step ${stepNumber + 1}`, [reasoningText.trim()]);
}

function logToolStart(args: {
  stepNumber?: number;
  model?: { provider: string; modelId: string };
  toolCallId: string;
  toolName: string;
  input: unknown;
}) {
  logBlock(`Tool Call · Step ${(args.stepNumber ?? 0) + 1}`, [
    `Model: ${args.model?.modelId ?? "unknown"}`,
    `Tool: ${args.toolName}`,
    `Call ID: ${args.toolCallId}`,
    "Input:",
    formatValue(args.input),
  ]);
}

function logToolFinish(args: {
  stepNumber?: number;
  model?: { provider: string; modelId: string };
  durationMs: number;
  toolCallId: string;
  toolName: string;
  output: unknown;
}) {
  logBlock(`Tool Result · Step ${(args.stepNumber ?? 0) + 1}`, [
    `Model: ${args.model?.modelId ?? "unknown"}`,
    `Tool: ${args.toolName}`,
    `Call ID: ${args.toolCallId}`,
    `Duration: ${Math.round(args.durationMs)}ms`,
    "Output:",
    formatValue(args.output),
  ]);
}

function logToolError(args: {
  stepNumber?: number;
  model?: { provider: string; modelId: string };
  durationMs: number;
  toolCallId: string;
  toolName: string;
  error: string;
}) {
  logBlock(`Tool Error · Step ${(args.stepNumber ?? 0) + 1}`, [
    `Model: ${args.model?.modelId ?? "unknown"}`,
    `Tool: ${args.toolName}`,
    `Call ID: ${args.toolCallId}`,
    `Duration: ${Math.round(args.durationMs)}ms`,
    `Error: ${args.error}`,
  ]);
}

function logStepSummary(
  stepNumber: number,
  toolCallCount: number,
  toolResultCount: number,
) {
  logBlock(`Step Summary · Step ${stepNumber + 1}`, [
    `Tool calls: ${toolCallCount}`,
    `Tool results: ${toolResultCount}`,
  ]);
}

function printHelp() {
  console.log(`Usage: npm run agent -- --kb <path> [--model <model>] [--prompt "<text>"]

Options:
  --kb, -k      Root path of the markdown knowledge base. Can also use KB_ROOT.
  --model, -m   OpenRouter model id. Defaults to ${DEFAULT_MODEL}.
  --prompt, -p  Run a single prompt and exit. Without this, an interactive chat starts.
  --help, -h    Show this help message.

Environment:
  OPENROUTER_API_KEY  Required OpenRouter API key.
  KB_ROOT             Optional default knowledge-base root.
  MODEL               Optional default model id.
  EMBEDDING_MODEL     Optional embedding model. Defaults to ${DEFAULT_EMBEDDING_MODEL}.
  NOTES_DB_PATH       Optional SQLite path for chunk/vector index. Defaults to ${DEFAULT_NOTES_DB_PATH}.
`);
}

function parseArgs(argv: string[]): CliOptions | null {
  let kbPath = process.env.KB_ROOT?.trim() || "";
  let model = process.env.MODEL?.trim() || DEFAULT_MODEL;
  let prompt: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      return null;
    }

    if (arg === "--kb" || arg === "-k") {
      kbPath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--kb=")) {
      kbPath = arg.slice("--kb=".length);
      continue;
    }

    if (arg === "--model" || arg === "-m") {
      model = argv[index + 1] ?? model;
      index += 1;
      continue;
    }

    if (arg.startsWith("--model=")) {
      model = arg.slice("--model=".length);
      continue;
    }

    if (arg === "--prompt" || arg === "-p") {
      prompt = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--prompt=")) {
      prompt = arg.slice("--prompt=".length);
      continue;
    }
  }

  if (!kbPath) {
    throw new Error("Missing KB path. Pass --kb <path> or set KB_ROOT.");
  }

  return {
    kbPath: path.resolve(kbPath),
    model,
    prompt,
  };
}

async function listMarkdownFiles(rootPath: string): Promise<string[]> {
  const relativePaths = new Set<string>();

  for (const pattern of MARKDOWN_PATTERNS) {
    for await (const entry of glob(pattern, {
      cwd: rootPath,
      exclude: GLOB_EXCLUDE,
    })) {
      relativePaths.add(entry.replaceAll(path.sep, "/"));
    }
  }

  return [...relativePaths].sort((left, right) => left.localeCompare(right));
}

async function ensureKnowledgeBase(rootPath: string) {
  const stats = await fs.stat(rootPath).catch(() => null);

  if (!stats?.isDirectory()) {
    throw new Error(`Knowledge-base path is not a directory: ${rootPath}`);
  }

  const markdownFiles = await listMarkdownFiles(rootPath);

  if (markdownFiles.length === 0) {
    throw new Error(`No markdown files found under ${rootPath}`);
  }

  return { rootPath, markdownFiles };
}

function resolveInsideRoot(rootPath: string, targetPath: string) {
  const resolvedPath = path.resolve(rootPath, normalizePathInput(targetPath));
  const relativePath = path.relative(rootPath, resolvedPath);

  if (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  ) {
    return resolvedPath;
  }

  throw new Error(`Path is outside the knowledge base root: ${targetPath}`);
}

function asKbRelativePath(rootPath: string, targetPath: string) {
  return path.relative(rootPath, targetPath).replaceAll(path.sep, "/");
}

function normalizePathInput(targetPath: string) {
  if (targetPath.startsWith("file://")) {
    return new URL(targetPath).pathname;
  }

  if (targetPath === "~") {
    return homedir();
  }

  if (targetPath.startsWith("~/")) {
    return path.join(homedir(), targetPath.slice(2));
  }

  return targetPath;
}

function isMarkdownPath(targetPath: string) {
  const lowerPath = targetPath.toLocaleLowerCase();
  return (
    lowerPath.endsWith(".md") ||
    lowerPath.endsWith(".markdown") ||
    lowerPath.endsWith(".mdx")
  );
}

function createTreeRoot(): TreeNode {
  return {
    directories: new Map<string, TreeNode>(),
    files: [],
  };
}

function getNotesDbPath() {
  return path.resolve(
    process.env.NOTES_DB_PATH?.trim() || DEFAULT_NOTES_DB_PATH,
  );
}

function getEmbeddingModelId() {
  return process.env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

function getProvider() {
  return createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

function openNotesDb() {
  const db = new DatabaseSync(getNotesDbPath());
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS kb_files (
      kb_root TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      chunk_version INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (kb_root, relative_path)
    );
    CREATE TABLE IF NOT EXISTS kb_chunks (
      chunk_id TEXT PRIMARY KEY,
      kb_root TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      heading_path TEXT NOT NULL,
      content TEXT NOT NULL,
      preview TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      chunk_version INTEGER NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_root
      ON kb_chunks (kb_root, relative_path);
  `);
  return db;
}

function makeFingerprint(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeParagraph(paragraph: string) {
  return paragraph.replace(/\s+/g, " ").trim();
}

function splitLongParagraph(paragraph: string, maxLength = 1400) {
  const normalized = normalizeParagraph(paragraph);
  if (normalized.length <= maxLength) {
    return [normalized];
  }

  const parts: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(". ", maxLength);
    if (splitAt < Math.floor(maxLength * 0.5)) {
      splitAt = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitAt < Math.floor(maxLength * 0.5)) {
      splitAt = maxLength;
    }

    const chunk = remaining.slice(0, splitAt).trim();
    if (chunk) {
      parts.push(chunk);
    }
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    parts.push(remaining);
  }

  return parts;
}

function chunkMarkdown(relativePath: string, content: string): ChunkRecord[] {
  const chunks: ChunkRecord[] = [];
  const headings: string[] = [];
  const lines = content.split(/\r?\n/);
  let paragraphLines: string[] = [];
  let chunkIndex = 0;

  const flushParagraph = () => {
    const paragraph = normalizeParagraph(paragraphLines.join(" "));
    paragraphLines = [];

    if (!paragraph) {
      return;
    }

    const headingPath = headings.join(" > ");

    for (const piece of splitLongParagraph(paragraph)) {
      const text = headingPath ? `${headingPath}\n\n${piece}` : piece;
      chunks.push({
        chunkId: `${relativePath}#${chunkIndex}`,
        relativePath,
        chunkIndex,
        headingPath,
        content: text,
        preview: piece,
      });
      chunkIndex += 1;
    }
  };

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      headings[level - 1] = headingMatch[2].trim();
      headings.length = level;
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    paragraphLines.push(line.trim());
  }

  flushParagraph();

  if (chunks.length === 0 && content.trim()) {
    chunks.push({
      chunkId: `${relativePath}#0`,
      relativePath,
      chunkIndex: 0,
      headingPath: "",
      content: normalizeParagraph(content),
      preview: normalizeParagraph(content).slice(0, 400),
    });
  }

  return chunks;
}

function buildSnippet(content: string, query: string) {
  const normalizedContent = normalizeParagraph(content);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchIndex = normalizedContent
    .toLocaleLowerCase()
    .indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return normalizedContent.slice(0, 240);
  }

  const start = Math.max(0, matchIndex - 100);
  const end = Math.min(
    normalizedContent.length,
    matchIndex + normalizedQuery.length + 140,
  );
  return normalizedContent.slice(start, end).trim();
}

function computeKeywordScore(content: string, query: string) {
  const haystack = content.toLocaleLowerCase();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return 0;
  }

  let score = 0;
  if (haystack.includes(normalizedQuery)) {
    score += 1;
  }

  const terms = [
    ...new Set(normalizedQuery.split(/\s+/).filter((term) => term.length > 2)),
  ];
  for (const term of terms) {
    if (haystack.includes(term)) {
      score += 0.35;
    }
  }

  return Math.min(score, 2);
}

async function syncKnowledgeBaseIndex(
  rootPath: string,
  markdownFiles: string[],
): Promise<IndexSyncResult> {
  const db = openNotesDb();
  const embeddingModel = getEmbeddingModelId();
  const provider = getProvider();
  const now = new Date().toISOString();

  try {
    const existingRows = db
      .prepare(
        `
          SELECT relative_path, fingerprint
          FROM kb_files
          WHERE kb_root = ?
            AND chunk_version = ?
        `,
      )
      .all(rootPath, CHUNK_VERSION) as Array<Record<string, unknown>>;

    const existingFingerprints = new Map<string, string>();
    for (const row of existingRows) {
      existingFingerprints.set(
        String(row.relative_path),
        String(row.fingerprint),
      );
    }

    const currentSet = new Set(markdownFiles);
    const removedPaths = [...existingFingerprints.keys()].filter(
      (relativePath) => !currentSet.has(relativePath),
    );

    const deleteChunks = db.prepare(`
      DELETE FROM kb_chunks
      WHERE kb_root = ?
        AND relative_path = ?
    `);
    const deleteFile = db.prepare(`
      DELETE FROM kb_files
      WHERE kb_root = ?
        AND relative_path = ?
    `);
    const insertChunk = db.prepare(`
      INSERT INTO kb_chunks (
        chunk_id,
        kb_root,
        relative_path,
        chunk_index,
        heading_path,
        content,
        preview,
        fingerprint,
        chunk_version,
        embedding_model,
        embedding,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertFile = db.prepare(`
      INSERT INTO kb_files (
        kb_root,
        relative_path,
        fingerprint,
        chunk_version,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(kb_root, relative_path) DO UPDATE SET
        fingerprint = excluded.fingerprint,
        chunk_version = excluded.chunk_version,
        updated_at = excluded.updated_at
    `);

    for (const relativePath of removedPaths) {
      deleteChunks.run(rootPath, relativePath);
      deleteFile.run(rootPath, relativePath);
    }

    let indexedFiles = 0;
    let indexedChunks = 0;

    for (const relativePath of markdownFiles) {
      const absolutePath = path.join(rootPath, relativePath);
      const content = await fs.readFile(absolutePath, "utf8");
      const fingerprint = makeFingerprint(content);

      if (existingFingerprints.get(relativePath) === fingerprint) {
        continue;
      }

      const chunks = chunkMarkdown(relativePath, content);
      const embeddingValues = chunks.map((chunk) => chunk.content);
      const embeddings =
        embeddingValues.length === 0
          ? []
          : (
              await embedMany({
                model: provider.textEmbeddingModel(embeddingModel),
                values: embeddingValues,
                maxParallelCalls: 4,
              })
            ).embeddings;

      deleteChunks.run(rootPath, relativePath);

      chunks.forEach((chunk, index) => {
        insertChunk.run(
          chunk.chunkId,
          rootPath,
          chunk.relativePath,
          chunk.chunkIndex,
          chunk.headingPath,
          chunk.content,
          chunk.preview,
          fingerprint,
          CHUNK_VERSION,
          embeddingModel,
          JSON.stringify(embeddings[index] ?? []),
          now,
        );
      });

      upsertFile.run(rootPath, relativePath, fingerprint, CHUNK_VERSION, now);
      indexedFiles += 1;
      indexedChunks += chunks.length;
    }

    const totals = db
      .prepare(
        `
          SELECT
            COUNT(DISTINCT relative_path) AS file_count,
            COUNT(*) AS chunk_count
          FROM kb_chunks
          WHERE kb_root = ?
            AND chunk_version = ?
            AND embedding_model = ?
        `,
      )
      .get(rootPath, CHUNK_VERSION, embeddingModel) as
      | Record<string, unknown>
      | undefined;

    return {
      indexedFiles,
      indexedChunks,
      removedFiles: removedPaths.length,
      totalFiles: Number(totals?.file_count ?? 0),
      totalChunks: Number(totals?.chunk_count ?? 0),
      embeddingModel,
    };
  } finally {
    db.close();
  }
}

function buildTree(markdownPaths: string[]) {
  const root = createTreeRoot();

  for (const markdownPath of markdownPaths) {
    const parts = markdownPath.split("/").filter(Boolean);
    let node = root;

    for (const segment of parts.slice(0, -1)) {
      let nextNode = node.directories.get(segment);
      if (!nextNode) {
        nextNode = createTreeRoot();
        node.directories.set(segment, nextNode);
      }
      node = nextNode;
    }

    node.files.push(parts.at(-1)!);
  }

  return root;
}

function renderTree(node: TreeNode, depth: number, prefix = ""): string[] {
  const lines: string[] = [];
  const directoryNames = [...node.directories.keys()].sort((left, right) =>
    left.localeCompare(right),
  );
  const fileNames = [...node.files].sort((left, right) =>
    left.localeCompare(right),
  );
  const entries = [
    ...directoryNames.map((name) => ({ type: "directory" as const, name })),
    ...fileNames.map((name) => ({ type: "file" as const, name })),
  ];

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";

    if (entry.type === "file") {
      lines.push(`${prefix}${connector}${entry.name}`);
      return;
    }

    lines.push(`${prefix}${connector}${entry.name}/`);

    if (depth <= 1) {
      const childNode = node.directories.get(entry.name)!;
      const hasChildren =
        childNode.directories.size > 0 || childNode.files.length > 0;
      if (hasChildren) {
        const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
        lines.push(`${childPrefix}└── ...`);
      }
      return;
    }

    const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
    lines.push(
      ...renderTree(node.directories.get(entry.name)!, depth - 1, childPrefix),
    );
  });

  return lines;
}

async function markdownFilesWithin(rootPath: string, scopedRootPath: string) {
  const relativePatterns = MARKDOWN_PATTERNS.map((pattern) =>
    path
      .join(asKbRelativePath(rootPath, scopedRootPath), pattern)
      .replaceAll(path.sep, "/"),
  );
  const relativePaths = new Set<string>();

  for (const pattern of relativePatterns) {
    for await (const entry of glob(pattern, {
      cwd: rootPath,
      exclude: GLOB_EXCLUDE,
    })) {
      relativePaths.add(entry.replaceAll(path.sep, "/"));
    }
  }

  return [...relativePaths].sort((left, right) => left.localeCompare(right));
}

async function buildKnowledgeTools(kbRoot: string) {
  const toolContext = await ensureKnowledgeBase(kbRoot);
  let indexSyncPromise: Promise<IndexSyncResult> | null = null;

  const ensureIndex = async () => {
    if (!indexSyncPromise) {
      const markdownFiles = await listMarkdownFiles(toolContext.rootPath);
      toolContext.markdownFiles = markdownFiles;

      indexSyncPromise = syncKnowledgeBaseIndex(
        toolContext.rootPath,
        markdownFiles,
      ).finally(() => {
        indexSyncPromise = null;
      });
    }

    return indexSyncPromise;
  };

  return {
    exploreDirectoryStructure: tool({
      description:
        "Explore the markdown-aware knowledge-base tree. Use this first when directory structure matters.",
      inputSchema: z.object({
        rootPath: z
          .string()
          .optional()
          .describe(
            "Optional subdirectory inside the knowledge base to inspect. Defaults to the KB root.",
          ),
        depth: z
          .number()
          .int()
          .min(1)
          .max(8)
          .default(DEFAULT_TREE_DEPTH)
          .describe("How many directory levels to print. Defaults to 2."),
      }),
      execute: async ({ rootPath, depth }) => {
        const scopedRootPath = rootPath
          ? resolveInsideRoot(toolContext.rootPath, rootPath)
          : toolContext.rootPath;
        const stats = await fs.stat(scopedRootPath).catch(() => null);

        if (!stats?.isDirectory()) {
          throw new Error(`Directory not found: ${rootPath ?? "."}`);
        }

        const markdownPaths = await markdownFilesWithin(
          toolContext.rootPath,
          scopedRootPath,
        );

        if (markdownPaths.length === 0) {
          return {
            root: asKbRelativePath(toolContext.rootPath, scopedRootPath) || ".",
            depth,
            markdownFileCount: 0,
            tree: "(no markdown files found under this path)",
          };
        }

        const scopedRelativeRoot = asKbRelativePath(
          toolContext.rootPath,
          scopedRootPath,
        );
        const normalizedRoot = scopedRelativeRoot
          ? `${scopedRelativeRoot}/`
          : "";
        const scopedMarkdownPaths = markdownPaths.map((markdownPath) =>
          normalizedRoot
            ? markdownPath.slice(normalizedRoot.length)
            : markdownPath,
        );
        const tree = buildTree(scopedMarkdownPaths);

        return {
          root: scopedRelativeRoot || ".",
          depth,
          markdownFileCount: scopedMarkdownPaths.length,
          tree: [".", ...renderTree(tree, depth)].join("\n"),
        };
      },
    }),
    searchNotes: tool({
      description:
        "Search markdown notes using hybrid semantic and keyword search over heading- and paragraph-level chunks.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe(
            "Natural-language search query for semantic retrieval across note chunks.",
          ),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(DEFAULT_SEARCH_RESULTS)
          .describe("Maximum number of note matches to return."),
      }),
      execute: async ({ query, maxResults }) => {
        const provider = getProvider();
        const indexSummary = await ensureIndex();
        const db = openNotesDb();

        try {
          const { embedding } = await embed({
            model: provider.textEmbeddingModel(indexSummary.embeddingModel),
            value: query,
          });

          const rows = db
            .prepare(
              `
                SELECT
                  relative_path,
                  chunk_index,
                  heading_path,
                  content,
                  preview,
                  embedding
                FROM kb_chunks
                WHERE kb_root = ?
                  AND chunk_version = ?
                  AND embedding_model = ?
              `,
            )
            .all(
              toolContext.rootPath,
              CHUNK_VERSION,
              indexSummary.embeddingModel,
            ) as Array<Record<string, unknown>>;

          const results = rows
            .map((row) => {
              const content = String(row.content);
              const vector = JSON.parse(String(row.embedding)) as number[];
              const vectorScore =
                vector.length > 0 ? cosineSimilarity(embedding, vector) : 0;
              const keywordScore = computeKeywordScore(
                `${row.heading_path ?? ""}\n${content}`,
                query,
              );
              const score =
                vectorScore * 0.8 + Math.min(keywordScore / 2, 1) * 0.2;

              return {
                path: String(row.relative_path),
                chunkIndex: Number(row.chunk_index),
                headingPath: String(row.heading_path ?? ""),
                snippet: buildSnippet(String(row.preview || content), query),
                vectorScore: Number(vectorScore.toFixed(4)),
                keywordScore: Number(keywordScore.toFixed(4)),
                score,
              };
            })
            .filter(
              (result) => result.vectorScore > 0.15 || result.keywordScore > 0,
            )
            .sort((left, right) => right.score - left.score);

          const matches: Array<{
            path: string;
            chunkIndex: number;
            headingPath: string;
            snippet: string;
            score: number;
            vectorScore: number;
            keywordScore: number;
          }> = [];
          const perFileCounts = new Map<string, number>();

          for (const result of results) {
            const existingCount = perFileCounts.get(result.path) ?? 0;
            if (existingCount >= 2) {
              continue;
            }

            matches.push({
              path: result.path,
              chunkIndex: result.chunkIndex,
              headingPath: result.headingPath,
              snippet: result.snippet,
              score: Number(result.score.toFixed(4)),
              vectorScore: result.vectorScore,
              keywordScore: result.keywordScore,
            });
            perFileCounts.set(result.path, existingCount + 1);

            if (matches.length >= maxResults) {
              break;
            }
          }

          return {
            query,
            strategy: "hybrid-semantic-keyword",
            index: indexSummary,
            matchCount: matches.length,
            matches,
          };
        } finally {
          db.close();
        }
      },
    }),
    outlineNote: tool({
      description:
        "Read the heading outline of a markdown note. Use this to inspect structure before reading the whole file.",
      inputSchema: z.object({
        notePath: z
          .string()
          .describe(
            "Path to a markdown note, relative to the KB root unless absolute.",
          ),
      }),
      execute: async ({ notePath }) => {
        const absolutePath = resolveInsideRoot(toolContext.rootPath, notePath);
        const stats = await fs.stat(absolutePath).catch(() => null);

        if (!stats?.isFile()) {
          throw new Error(`Note not found: ${notePath}`);
        }

        const relativePath = asKbRelativePath(
          toolContext.rootPath,
          absolutePath,
        );
        const content = await fs.readFile(absolutePath, "utf8");
        const headings = content
          .split(/\r?\n/)
          .map((line, index) => {
            const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
            if (!match) {
              return null;
            }

            return {
              line: index + 1,
              level: match[1].length,
              heading: match[2],
            };
          })
          .filter(
            (
              heading,
            ): heading is {
              line: number;
              level: number;
              heading: string;
            } => heading !== null,
          );

        const outline =
          headings.length === 0
            ? "(no markdown headings found)"
            : headings
                .map(
                  (heading) =>
                    `${"  ".repeat(heading.level - 1)}- ${heading.heading} (line ${heading.line})`,
                )
                .join("\n");

        return {
          path: relativePath,
          headingCount: headings.length,
          outline,
        };
      },
    }),
    readNote: tool({
      description: "Read the full contents of a markdown note.",
      inputSchema: z.object({
        notePath: z
          .string()
          .describe(
            "Path to a markdown note. Accepts KB-relative paths, absolute paths inside the KB, ~/ paths, and file:// URLs.",
          ),
      }),
      execute: async ({ notePath }) => {
        const absolutePath = resolveInsideRoot(toolContext.rootPath, notePath);
        const stats = await fs.stat(absolutePath).catch(() => null);

        if (!stats?.isFile()) {
          throw new Error(`Note not found: ${notePath}`);
        }

        const relativePath = asKbRelativePath(
          toolContext.rootPath,
          absolutePath,
        );

        return {
          path: relativePath,
          content: await fs.readFile(absolutePath, "utf8"),
        };
      },
    }),
    writeNote: tool({
      description:
        "Create a new markdown note or update an existing one inside the knowledge base. Prefer using the exact provided path and replacing the full note content when editing an existing note.",
      inputSchema: z.object({
        notePath: z
          .string()
          .describe(
            "Markdown note path. Accepts KB-relative paths, absolute paths inside the KB, ~/ paths, and file:// URLs. Must end with .md, .markdown, or .mdx.",
          ),
        content: z
          .string()
          .describe(
            "Markdown content to write into the note. For existing notes, prefer the complete revised note so structure can be preserved.",
          ),
        mode: z
          .enum(["replace", "append", "prepend"])
          .default("replace")
          .describe(
            "How to apply the content. replace overwrites the full note and is preferred for structured edits to an existing note. append adds to the end. prepend adds to the beginning.",
          ),
      }),
      execute: async ({ notePath, content, mode }) => {
        const absolutePath = resolveInsideRoot(toolContext.rootPath, notePath);
        const relativePath = asKbRelativePath(
          toolContext.rootPath,
          absolutePath,
        );

        if (!isMarkdownPath(relativePath)) {
          throw new Error(`Note path must be a markdown file: ${notePath}`);
        }

        await fs.mkdir(path.dirname(absolutePath), { recursive: true });

        const existingContent = await fs
          .readFile(absolutePath, "utf8")
          .catch((error: unknown) => {
            if (
              error &&
              typeof error === "object" &&
              "code" in error &&
              error.code === "ENOENT"
            ) {
              return null;
            }

            throw error;
          });

        let nextContent: string;
        switch (mode) {
          case "append":
            nextContent = existingContent
              ? `${existingContent}${existingContent.endsWith("\n") ? "" : "\n"}${content}`
              : content;
            break;
          case "prepend":
            nextContent = existingContent
              ? `${content}${content.endsWith("\n") ? "" : "\n"}${existingContent}`
              : content;
            break;
          case "replace":
          default:
            nextContent = content;
            break;
        }

        await fs.writeFile(absolutePath, nextContent, "utf8");
        toolContext.markdownFiles = await listMarkdownFiles(
          toolContext.rootPath,
        );
        const index = await syncKnowledgeBaseIndex(
          toolContext.rootPath,
          toolContext.markdownFiles,
        );

        return {
          path: relativePath,
          absolutePath,
          mode,
          created: existingContent === null,
          bytesWritten: Buffer.byteLength(nextContent, "utf8"),
          index,
        };
      },
    }),
  };
}

function createSystemPrompt(kbRoot: string) {
  return `You are a knowledge-base assistant for a local markdown KB.

Knowledge-base root: ${kbRoot}

Rules:
- The KB consists of markdown files only.
- Prefer using the available KB tools before making claims about file structure or note contents.
- Use exploreDirectoryStructure when folder layout matters.
- Use searchNotes as the primary retrieval tool. It performs hybrid semantic and keyword search over heading- and paragraph-level chunks.
- If searchNotes returns nothing useful or the results look incomplete, use exploreDirectoryStructure to inspect nearby folders and identify promising notes to open next.
- Use outlineNote before reading a long note when structure matters.
- Use readNote when exact note contents are needed.
- When the user points to a current note or gives an exact path, prefer updating that note in place instead of creating a new note.
- Before updating an existing note, prefer reading it and/or outlining it first so you preserve its current structure and revise the relevant section rather than blindly appending a new top-level section.
- Use writeNote with mode=replace for structured edits to existing notes, after incorporating the existing note structure into the revised content.
- Use writeNote to create a new note only when the user asks for a new note or there is no suitable existing note to update.
- When citing notes in your answer, mention the KB-relative note path.
- If the KB tools do not provide enough evidence, say so instead of guessing.
- Do not prompt for questions or confirmations. Prefer performing actions instead.
- Wherever possible, update notes with any new information or ideas.
- Be very careful before replacing existing data. You are forbidden from desctructing data.`;
}

async function runTurn(
  messages: ModelMessage[],
  modelId: string,
  kbRoot: string,
  tools: Awaited<ReturnType<typeof buildKnowledgeTools>>,
) {
  const provider = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const result = await generateText({
    model: provider(modelId),
    system: createSystemPrompt(kbRoot),
    messages,
    tools,
    stopWhen: stepCountIs(8),
    experimental_onToolCallStart: ({ stepNumber, toolCall, model }) => {
      logToolStart({
        stepNumber,
        model,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.input,
      });
    },
    experimental_onToolCallFinish: ({
      stepNumber,
      toolCall,
      model,
      durationMs,
      ...event
    }) => {
      if (event.success) {
        logToolFinish({
          stepNumber,
          model,
          durationMs,
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          output: event.output,
        });
        return;
      }

      logToolError({
        stepNumber,
        model,
        durationMs,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        error:
          event.error instanceof Error
            ? event.error.message
            : String(event.error),
      });
    },
    onStepFinish: ({ stepNumber, reasoningText, toolCalls, toolResults }) => {
      logReasoning(stepNumber, reasoningText);

      if (toolCalls.length > 0 || toolResults.length > 0) {
        logStepSummary(stepNumber, toolCalls.length, toolResults.length);
      }
    },
  });

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    return;
  }

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new Error("Missing OPENROUTER_API_KEY.");
  }

  const kb = await ensureKnowledgeBase(options.kbPath);
  const tools = await buildKnowledgeTools(kb.rootPath);

  if (options.prompt) {
    const messages: ModelMessage[] = [
      { role: "user", content: options.prompt },
    ];
    const result = await runTurn(messages, options.model, kb.rootPath, tools);
    console.log(result.text);
    return;
  }

  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const messages: ModelMessage[] = [];

  console.log(`KB root: ${kb.rootPath}`);
  console.log(`Markdown files: ${kb.markdownFiles.length}`);
  console.log(`Model: ${options.model}`);
  console.log("Type 'exit' or 'quit' to stop.\n");

  try {
    while (true) {
      const userInput = (await terminal.question("You: ")).trim();

      if (!userInput) {
        continue;
      }

      if (userInput === "exit" || userInput === "quit") {
        break;
      }

      messages.push({ role: "user", content: userInput });
      const result = await runTurn(messages, options.model, kb.rootPath, tools);
      messages.push(...result.response.messages);

      process.stdout.write("\nAssistant: ");
      process.stdout.write(result.text || "(no text response)");
      process.stdout.write("\n\n");
    }
  } finally {
    terminal.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
