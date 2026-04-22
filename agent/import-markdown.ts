import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

type EntryRecord = {
  entryPath: string;
  name: string;
  isDirectory: 0 | 1;
  parentNameNormalized: string | null;
  markdownContent: string | null;
  contentDigest: string | null;
};

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
  output: EntryRecord[],
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

function ensureTable(db: InstanceType<typeof DatabaseSync>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS markdown_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      is_directory INTEGER NOT NULL,
      parent_name_normalized TEXT,
      markdown_content TEXT,
      content_digest TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function upsertEntries(
  db: InstanceType<typeof DatabaseSync>,
  entries: EntryRecord[],
): void {
  const stmt = db.prepare(`
    INSERT INTO markdown_entries (
      entry_path,
      name,
      is_directory,
      parent_name_normalized,
      markdown_content,
      content_digest,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(entry_path) DO UPDATE SET
      name = excluded.name,
      is_directory = excluded.is_directory,
      parent_name_normalized = excluded.parent_name_normalized,
      markdown_content = excluded.markdown_content,
      content_digest = excluded.content_digest,
      updated_at = CURRENT_TIMESTAMP;
  `);

  db.exec("BEGIN");
  try {
    for (const row of entries) {
      stmt.run(
        row.entryPath,
        row.name,
        row.isDirectory,
        row.parentNameNormalized,
        row.markdownContent,
        row.contentDigest,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  const rootArg = process.argv[2] ?? ".";
  const dbArg = process.argv[3] ?? "./notes.db";
  const rootDir = path.resolve(rootArg);
  const dbPath = path.resolve(dbArg);

  const entries: EntryRecord[] = [];
  await walkDirectory(rootDir, rootDir, null, entries);

  const db = new DatabaseSync(dbPath);
  ensureTable(db);
  upsertEntries(db, entries);
  db.close();

  console.log(`Imported ${entries.length} entries into ${dbPath}`);
}

main().catch((error: unknown) => {
  console.error("Import failed:", error);
  process.exitCode = 1;
});
