import Database from "better-sqlite3";
import path from "node:path";

export type SqliteDatabase = Database.Database;

export function openDatabase(dbPath: string): SqliteDatabase {
  const resolvedPath = path.resolve(dbPath);
  return new Database(resolvedPath);
}
