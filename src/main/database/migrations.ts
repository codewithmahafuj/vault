import type Database from 'better-sqlite3';

interface Migration {
  readonly version: number;
  readonly up: (db: Database.Database) => void;
}

// Service name, identifier, password, and notes are stored as AES-256-GCM
// blobs, so SQL cannot search or order them. List, search, duplicate checks,
// and sorting therefore run in main-process memory on decrypted values, and no
// index on an encrypted column is possible or needed. Favorite status and
// timestamps are not designated sensitive and stay readable.
const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        create table credentials (
          id text primary key,
          service_encrypted blob not null,
          identifier_encrypted blob not null,
          password_encrypted blob not null,
          notes_encrypted blob,
          favorite integer not null,
          created_at text not null,
          updated_at text not null
        );
      `);
    },
  },
  {
    // The protected data key lives beside the records it decrypts, in the same
    // file, so a database and its key can never drift apart into two states.
    // The `id = 1` check keeps this a single-row table.
    version: 2,
    up: (db) => {
      db.exec(`
        create table vault_metadata (
          id integer primary key check (id = 1),
          protected_key blob not null
        );
      `);
    },
  },
];

function readUserVersion(db: Database.Database): number {
  const row = db.prepare<[], { user_version: number }>('pragma user_version').get();
  return row?.user_version ?? 0;
}

export function applyMigrations(db: Database.Database): void {
  const appliedVersion = readUserVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.version <= appliedVersion) {
      continue;
    }

    db.transaction(() => {
      migration.up(db);
      // A migration and the version that records it commit together, so a
      // half-applied schema can never be reported as applied. SQLite has no
      // parameter form for PRAGMA; this version comes from the in-code list
      // above, never from stored or user-supplied data.
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
}
