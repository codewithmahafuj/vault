import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DATABASE_FILE_NAME, openVault } from '../src/main/vault';
import type { VaultHandle } from '../src/main/vault';
import {
  FieldIntegrityError,
  KeyIntegrityError,
  KeyProtectionUnavailableError,
  MissingDataKeyError,
} from '../src/main/security/errors';
import type { CredentialInput } from '../src/shared/credential';
import { createFakeProtection, FAKE_PROTECTION_MARKER } from './fake-protection';

const SERVICE = 'Fictional Bank';
const IDENTIFIER = 'ada@example.com';
const PASSWORD = 'fictional-bank-password';
const NOTES = 'The card pin lives in the kitchen drawer.';

const account: CredentialInput = {
  service: SERVICE,
  identifier: IDENTIFIER,
  password: PASSWORD,
  notes: NOTES,
  favorite: true,
};

const temporaryDirectories: string[] = [];
const openHandles: VaultHandle[] = [];

function vaultDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'vault-data-'));
  temporaryDirectories.push(directory);
  return directory;
}

function databasePath(directory: string): string {
  return path.join(directory, DATABASE_FILE_NAME);
}

function open(directory: string): VaultHandle {
  const handle = openVault(directory, createFakeProtection());
  openHandles.push(handle);
  return handle;
}

// Reopens the same file outside the vault handle to inspect and mutate the
// metadata row, which is the only way to reach the "key lost or corrupted"
// states.
function withDirectAccess<T>(directory: string, run: (db: Database.Database) => T): T {
  const db = new Database(databasePath(directory));
  try {
    return run(db);
  } finally {
    db.close();
  }
}

function storedProtectedKey(directory: string): Buffer | undefined {
  return withDirectAccess(directory, (db) => {
    return db
      .prepare<[], { protected_key: Buffer }>(
        'select protected_key from vault_metadata where id = 1',
      )
      .get()?.protected_key;
  });
}

function storedProtectedKeyOrThrow(directory: string): Buffer {
  const key = storedProtectedKey(directory);
  if (key === undefined) {
    throw new Error('The vault stored no protected key row.');
  }
  return key;
}

function storedRecordCount(directory: string): number {
  return withDirectAccess(directory, (db) => {
    return (
      db.prepare<[], { count: number }>('select count(*) as count from credentials').get()?.count ??
      0
    );
  });
}

function deleteStoredKey(directory: string): void {
  withDirectAccess(directory, (db) => {
    db.prepare('delete from vault_metadata where id = 1').run();
  });
}

function countOccurrences(haystack: Buffer, needle: Buffer): number {
  let count = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    count += 1;
  }
  return count;
}

afterEach(() => {
  for (const handle of openHandles.splice(0)) {
    handle.close();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});

describe('openVault', () => {
  it('creates only the database, with the key stored inside it', () => {
    const directory = vaultDirectory();

    const vault = open(directory);

    expect(existsSync(databasePath(directory))).toBe(true);
    expect(existsSync(path.join(directory, 'vault.key'))).toBe(false);
    expect(vault.credentials.list()).toEqual([]);
  });

  it('creates a data directory that does not exist yet', () => {
    const directory = path.join(vaultDirectory(), 'Vault', 'nested');

    const vault = openVault(directory, createFakeProtection());
    openHandles.push(vault);

    expect(vault.credentials.create(account).service).toBe(SERVICE);
  });

  it('writes a protected key row on first open and reuses it on the next', () => {
    const directory = vaultDirectory();
    open(directory).close();

    const firstKey = storedProtectedKey(directory);
    expect(firstKey).toBeDefined();

    const reopened = open(directory);
    expect(reopened.credentials.create(account).service).toBe(SERVICE);
    reopened.close();

    expect(storedProtectedKey(directory)).toEqual(firstKey);
  });

  it('reads a saved credential again after the vault is closed and reopened', () => {
    const directory = vaultDirectory();

    const first = open(directory);
    const created = first.credentials.create(account);
    first.close();

    const reopened = open(directory);
    expect(reopened.credentials.list()).toEqual([created]);
    expect(reopened.credentials.findSecretById(created.id)?.password).toBe(account.password);
  });

  it('keeps an edit visible after a reopen', () => {
    const directory = vaultDirectory();

    const first = open(directory);
    const created = first.credentials.create(account);
    first.credentials.update(created.id, { ...account, password: 'fictional-rotated-password' });
    first.close();

    const reopened = open(directory);
    expect(reopened.credentials.findById(created.id)?.favorite).toBe(true);
    expect(reopened.credentials.findSecretById(created.id)?.password).toBe(
      'fictional-rotated-password',
    );
  });

  it('writes no plaintext credential value or unprotected key copy to the database file', () => {
    const directory = vaultDirectory();
    const vault = open(directory);
    const created = vault.credentials.create(account);

    // The fake protector encodes as `marker + base64(key)`, so this recovers the
    // raw key and its encoded form for the scan below.
    const encodedKey = Buffer.from(
      storedProtectedKeyOrThrow(directory).toString('utf8').slice(FAKE_PROTECTION_MARKER.length),
      'utf8',
    );
    const rawKey = Buffer.from(encodedKey.toString('utf8'), 'base64');
    expect(rawKey).toHaveLength(32);
    vault.close();

    const file = readFileSync(databasePath(directory));
    for (const value of [SERVICE, IDENTIFIER, PASSWORD, NOTES]) {
      expect(file.includes(Buffer.from(value, 'utf8'))).toBe(false);
    }
    expect(file.includes(Buffer.from(created.id, 'utf8'))).toBe(true);

    // The raw key bytes never appear anywhere in the file.
    expect(countOccurrences(file, rawKey)).toBe(0);

    // The encoded key appears exactly once: inside the protected row the vault
    // wrote. The fake protector keeps its payload readable, so that single
    // occurrence is expected, and the check proves no second, unprotected copy
    // was written beside it. Hiding the payload itself is the OS protector's
    // job and was verified against Electron safeStorage, not against this fake.
    expect(countOccurrences(file, encodedKey)).toBe(1);
  });

  it('refuses to open when OS-backed key protection is unavailable', () => {
    const directory = vaultDirectory();
    const vault = open(directory);
    vault.credentials.create(account);
    vault.close();

    const before = readFileSync(databasePath(directory));

    expect(() => openVault(directory, createFakeProtection(false))).toThrow(
      KeyProtectionUnavailableError,
    );
    expect(readFileSync(databasePath(directory))).toEqual(before);
  });

  it('fails closed when records exist but the key row was lost', () => {
    const directory = vaultDirectory();
    const vault = open(directory);
    vault.credentials.create(account);
    vault.close();

    deleteStoredKey(directory);

    expect(() => openVault(directory, createFakeProtection())).toThrow(MissingDataKeyError);

    // The refusal leaves the file exactly as it was: the record survives and no
    // replacement key is created, so the vault can never appear as an empty one
    // whose data is quietly gone.
    expect(storedRecordCount(directory)).toBe(1);
    expect(storedProtectedKey(directory)).toBeUndefined();
  });

  it('reports a corrupted key row instead of overwriting it', () => {
    const directory = vaultDirectory();
    const vault = open(directory);
    vault.credentials.create(account);
    vault.close();

    const corrupted = Buffer.from('not a protected payload');
    withDirectAccess(directory, (db) => {
      db.prepare('update vault_metadata set protected_key = ? where id = 1').run(corrupted);
    });

    expect(() => openVault(directory, createFakeProtection())).toThrow(KeyIntegrityError);
    expect(storedProtectedKey(directory)).toEqual(corrupted);
  });

  it('fails closed on records encrypted under a key that no longer matches', () => {
    const directory = vaultDirectory();
    const vault = open(directory);
    vault.credentials.create(account);
    vault.close();

    // A restored out-of-sync vault: the metadata row holds a well-formed
    // protected key, just not the one the records were written under. Reading
    // must fail rather than return partially decrypted data.
    withDirectAccess(directory, (db) => {
      db.prepare('update vault_metadata set protected_key = ? where id = 1').run(
        Buffer.from(
          `${FAKE_PROTECTION_MARKER}${Buffer.from(randomBytes(32)).toString('base64')}`,
          'utf8',
        ),
      );
    });

    const orphaned = open(directory);
    expect(() => orphaned.credentials.list()).toThrow(FieldIntegrityError);
    expect(existsSync(databasePath(directory))).toBe(true);
    orphaned.close();
  });

  it('keeps one vault directory independent of another', () => {
    const directory = vaultDirectory();
    const other = vaultDirectory();

    const first = open(directory);
    first.credentials.create(account);
    expect(open(other).credentials.list()).toEqual([]);
  });
});
