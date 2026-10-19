import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { applyMigrations } from './migrations';

export function openVaultDatabase(filePath: string): Database.Database {
  mkdirSync(path.dirname(filePath), { recursive: true });

  const db = new Database(filePath);
  try {
    applyMigrations(db);
  } catch (error) {
    // A failed migration still holds an open handle to the file, which keeps it
    // busy for anything that tries again. Close before rethrowing so the next
    // attempt --- or the user's own recovery --- can open the database at all.
    db.close();
    throw error;
  }
  return db;
}
