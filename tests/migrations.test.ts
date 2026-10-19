import { mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../src/main/database/migrations';
import { openVaultDatabase } from '../src/main/database/open-vault-database';

const temporaryDirectories: string[] = [];
const openDatabases: Database.Database[] = [];

function createTempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'vault-migrations-'));
  temporaryDirectories.push(directory);
  return directory;
}

function track(db: Database.Database): Database.Database {
  openDatabases.push(db);
  return db;
}

afterEach(() => {
  for (const db of openDatabases.splice(0)) {
    if (db.open) {
      db.close();
    }
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});

function columnNames(db: Database.Database, table: 'credentials' | 'vault_metadata'): string[] {
  // SQLite has no parameter form for PRAGMA, so the table name is typed as a
  // union of the two tables this file owns rather than a free-form string.
  return db
    .prepare<[], { name: string }>(`pragma table_info(${table})`)
    .all()
    .map((column) => column.name);
}

function userVersion(db: Database.Database): number {
  const row = db.prepare<[], { user_version: number }>('pragma user_version').get();
  return row?.user_version ?? 0;
}

function insertRawRow(db: Database.Database, id: string): void {
  db.prepare(
    `insert into credentials (
        id, service_encrypted, identifier_encrypted, password_encrypted,
        notes_encrypted, favorite, created_at, updated_at
      )
     values (?, ?, ?, ?, null, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(id, Buffer.from('encrypted'), Buffer.from('encrypted'), Buffer.from('encrypted'));
}

describe('applyMigrations', () => {
  it('creates the credentials table with the documented encrypted column layout', () => {
    const db = track(new Database(':memory:'));
    applyMigrations(db);

    expect(columnNames(db, 'credentials')).toEqual([
      'id',
      'service_encrypted',
      'identifier_encrypted',
      'password_encrypted',
      'notes_encrypted',
      'favorite',
      'created_at',
      'updated_at',
    ]);
  });

  it('creates the single-row key metadata table', () => {
    const db = track(new Database(':memory:'));
    applyMigrations(db);

    expect(columnNames(db, 'vault_metadata')).toEqual(['id', 'protected_key']);
    expect(() =>
      db
        .prepare('insert into vault_metadata (id, protected_key) values (?, ?)')
        .run(2, Buffer.from('key')),
    ).toThrow();
  });

  it('records the applied schema version', () => {
    const db = track(new Database(':memory:'));
    applyMigrations(db);

    expect(userVersion(db)).toBe(2);
  });

  it('skips applied migrations instead of failing a second time', () => {
    const db = track(new Database(':memory:'));
    applyMigrations(db);
    insertRawRow(db, 'row-1');

    expect(() => applyMigrations(db)).not.toThrow();
    expect(
      db.prepare<[], { count: number }>('select count(*) as count from credentials').get()?.count,
    ).toBe(1);
    expect(userVersion(db)).toBe(2);
  });

  it('keeps rows and schema when the same database file is reopened', () => {
    const filePath = path.join(createTempDir(), 'vault.db');

    const first = new Database(filePath);
    applyMigrations(first);
    insertRawRow(first, 'row-1');
    first.close();

    const reopened = track(openVaultDatabase(filePath));
    expect(userVersion(reopened)).toBe(2);
    expect(
      reopened.prepare<[], { count: number }>('select count(*) as count from credentials').get()
        ?.count,
    ).toBe(1);
  });

  it('migrates an existing version 1 database in place without losing rows', () => {
    const filePath = path.join(createTempDir(), 'vault.db');

    // Build the shape the previous release shipped: schema 1 with a record and
    // no metadata table.
    const legacy = new Database(filePath);
    legacy.exec(`
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
      pragma user_version = 1;
    `);
    insertRawRow(legacy, 'legacy-row');
    legacy.close();

    const migrated = track(openVaultDatabase(filePath));

    expect(userVersion(migrated)).toBe(2);
    expect(columnNames(migrated, 'vault_metadata')).toEqual(['id', 'protected_key']);
    expect(
      migrated.prepare<[], { count: number }>('select count(*) as count from credentials').get()
        ?.count,
    ).toBe(1);
  });

  it('creates the parent directory for a database path that does not exist yet', () => {
    const filePath = path.join(createTempDir(), 'nested', 'vault.db');

    const db = track(openVaultDatabase(filePath));
    expect(userVersion(db)).toBe(2);
  });

  it('releases the database file when a migration fails, so it can be opened again', () => {
    const filePath = path.join(createTempDir(), 'vault.db');

    // Schema 1 with something else occupying the table migration 2 creates: the
    // migration fails, and the connection that failed must not be left holding
    // the file.
    const blocked = new Database(filePath);
    blocked.exec(`
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
      create table vault_metadata (note text);
      pragma user_version = 1;
    `);
    insertRawRow(blocked, 'row-1');
    blocked.close();

    expect(() => openVaultDatabase(filePath)).toThrow(/vault_metadata/);
    // Windows refuses to rename a file another handle still has open, so this is
    // the failed open handing the database back.
    expect(() => renameSync(filePath, `${filePath}.released`)).not.toThrow();
    renameSync(`${filePath}.released`, filePath);

    // The transaction took the failed migration back with it: the version and the
    // record are exactly as they were, and clearing the blocking table lets the
    // same file finish migrating.
    const inspected = new Database(filePath);
    expect(userVersion(inspected)).toBe(1);
    expect(
      inspected.prepare<[], { count: number }>('select count(*) as count from credentials').get()
        ?.count,
    ).toBe(1);
    inspected.exec('drop table vault_metadata');
    inspected.close();

    const reopened = track(openVaultDatabase(filePath));
    expect(userVersion(reopened)).toBe(2);
    expect(
      reopened.prepare<[], { count: number }>('select count(*) as count from credentials').get()
        ?.count,
    ).toBe(1);
  });
});
