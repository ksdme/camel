import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateText } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";

type JsonEntry = {
  entryPath: string;
  parentPath: string | null;
  name: string;
  isDirectory: boolean;
  content: string | null;
  summary: string | null;
};

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
const SUMMARY_INPUT_LIMIT = 12000;

function getRootDir(argv: string[]): string {
  return path.resolve(argv[2] ?? ".");
}

function getOutputPath(argv: string[], rootDir: string): string {
  return path.resolve(argv[3] ?? path.join(rootDir, "markdown-export.json"));
}

async function summarizeMarkdown(content: string): Promise<string> {
  const prompt = `
Summarize the following markdown article in 2 concise sentences.
Focus on the main topic and the most useful takeaway.
Do not use bullets.

Article:
${content.slice(0, SUMMARY_INPUT_LIMIT)}
  `.trim();

  const result = await generateText({
    model: openrouter(DEFAULT_MODEL),
    prompt,
    temperature: 0.2,
    maxOutputTokens: 120,
  });

  return result.text.trim();
}

async function walkDirectory(
  rootDir: string,
  currentDir: string,
  output: JsonEntry[],
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath) || ".";
    const parentRelativePath =
      relativePath === "."
        ? null
        : path.dirname(relativePath) === "."
          ? null
          : path.dirname(relativePath);

    if (entry.isDirectory()) {
      output.push({
        entryPath: relativePath,
        parentPath: parentRelativePath,
        name: entry.name,
        isDirectory: true,
        content: null,
        summary: null,
      });

      await walkDirectory(rootDir, absolutePath, output);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const isMarkdown = /\.md$/i.test(entry.name);
    const content = isMarkdown ? await readFile(absolutePath, "utf8") : null;

    let summary: string | null = null;
    if (content) {
      console.error(`Summarizing ${relativePath}`);
      summary = await summarizeMarkdown(content);
    }

    output.push({
      entryPath: relativePath,
      parentPath: parentRelativePath,
      name: entry.name,
      isDirectory: false,
      content,
      summary,
    });
  }
}

async function main(): Promise<void> {
  const rootDir = getRootDir(process.argv);
  const outputPath = getOutputPath(process.argv, rootDir);

  const entries: JsonEntry[] = [];
  await walkDirectory(rootDir, rootDir, entries);

  await writeFile(
    outputPath,
    JSON.stringify(
      {
        rootDir,
        generatedAt: new Date().toISOString(),
        model: DEFAULT_MODEL,
        entries,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Wrote ${entries.length} entries to ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error("Export failed:", error);
  process.exitCode = 1;
});
