import type { SqliteDatabase } from "./sqlite";

export type MarkdownEntryRecord = {
  entryPath: string;
  name: string;
  isDirectory: 0 | 1;
  parentNameNormalized: string | null;
  markdownContent: string | null;
  contentDigest: string | null;
};

export function ensureMarkdownEntriesTable(db: SqliteDatabase): void {
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

export function upsertMarkdownEntries(
  db: SqliteDatabase,
  entries: MarkdownEntryRecord[],
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

  const upsertMany = db.transaction((rows: MarkdownEntryRecord[]) => {
    for (const row of rows) {
      stmt.run(
        row.entryPath,
        row.name,
        row.isDirectory,
        row.parentNameNormalized,
        row.markdownContent,
        row.contentDigest,
      );
    }
  });

  upsertMany(entries);
}
