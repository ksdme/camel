import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { glob } from "node:fs/promises";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as process from "node:process";
import * as readline from "node:readline/promises";
import { z } from "zod";

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_TREE_DEPTH = 2;
const MARKDOWN_PATTERNS = ["**/*.md", "**/*.markdown", "**/*.mdx"] as const;
const GLOB_EXCLUDE = ["**/.git/**", "**/node_modules/**"] as const;

type CliOptions = {
  kbPath: string;
  model: string;
  prompt?: string;
};

type TreeNode = {
  directories: Map<string, TreeNode>;
  files: string[];
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
  console.log("------------");
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
  const resolvedPath = path.resolve(rootPath, targetPath);
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

function createTreeRoot(): TreeNode {
  return {
    directories: new Map<string, TreeNode>(),
    files: [],
  };
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
        "Search markdown notes for a keyword or phrase. Returns matching files with surrounding snippets.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe(
            "Keyword or phrase to search for in markdown note contents.",
          ),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(8)
          .describe("Maximum number of note matches to return."),
      }),
      execute: async ({ query, maxResults }) => {
        const queryLower = query.toLocaleLowerCase();
        const matches: Array<{ path: string; snippet: string }> = [];

        for (const relativePath of toolContext.markdownFiles) {
          const absolutePath = path.join(toolContext.rootPath, relativePath);
          const content = await fs.readFile(absolutePath, "utf8");
          const haystack = content.toLocaleLowerCase();
          const matchIndex = haystack.indexOf(queryLower);

          if (matchIndex === -1) {
            continue;
          }

          const snippetStart = Math.max(0, matchIndex - 120);
          const snippetEnd = Math.min(
            content.length,
            matchIndex + query.length + 120,
          );
          const snippet = content
            .slice(snippetStart, snippetEnd)
            .replace(/\s+/g, " ")
            .trim();

          matches.push({
            path: relativePath,
            snippet,
          });

          if (matches.length >= maxResults) {
            break;
          }
        }

        return {
          query,
          matchCount: matches.length,
          matches,
        };
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

        return {
          path: relativePath,
          content: await fs.readFile(absolutePath, "utf8"),
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
- Use searchNotes to locate relevant notes by keyword or phrase.
- If searchNotes returns nothing useful or the results look incomplete, use exploreDirectoryStructure to inspect nearby folders and identify promising notes to open next.
- Use outlineNote before reading a long note when structure matters.
- Use readNote when exact note contents are needed.
- When citing notes in your answer, mention the KB-relative note path.
- If the KB tools do not provide enough evidence, say so instead of guessing.`;
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
