import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  ensureMarkdownEntriesTable,
  type MarkdownEntryRecord,
  upsertMarkdownEntries,
} from "../db/markdown-entries";
import { openDatabase } from "../db/sqlite";

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

async function walkDirectory(
  rootDir: string,
  currentDir: string,
  parentName: string | null,
  output: MarkdownEntryRecord[],
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath) || ".";

    if (entry.isDirectory()) {
      output.push({
        entryPath: relativePath,
        name: entry.name,
        isDirectory: 1,
        parentNameNormalized: normalizeName(parentName),
        markdownContent: null,
        contentDigest: null,
      });

      await walkDirectory(rootDir, absolutePath, entry.name, output);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const isMarkdown = /\.md$/i.test(entry.name);
    const markdownContent = isMarkdown
      ? await readFile(absolutePath, "utf8")
      : null;

    output.push({
      entryPath: relativePath,
      name: entry.name,
      isDirectory: 0,
      parentNameNormalized: normalizeName(parentName),
      markdownContent,
      contentDigest: null,
    });
  }
}

async function main(): Promise<void> {
  const rootArg = process.argv[2] ?? ".";
  const dbArg = process.argv[3] ?? "./notes.db";
  const rootDir = path.resolve(rootArg);
  const dbPath = path.resolve(dbArg);

  const entries: MarkdownEntryRecord[] = [];
  await walkDirectory(rootDir, rootDir, null, entries);

  const db = openDatabase(dbPath);
  ensureMarkdownEntriesTable(db);
  upsertMarkdownEntries(db, entries);
  db.close();

  console.log(`Imported ${entries.length} entries into ${dbPath}`);
}

main().catch((error: unknown) => {
  console.error("Import failed:", error);
  process.exitCode = 1;
});
