import type Database from 'better-sqlite3';
import type { StoredKeyAccess } from '../security/stored-data-key';

// Implements the security layer's storage seam over parameterized statements,
// so nothing in src/main/security needs to know about SQLite.
export function createStoredKeyAccess(db: Database.Database): StoredKeyAccess {
  const read = db.prepare<[], { protected_key: Buffer }>(
    'select protected_key from vault_metadata where id = 1',
  );
  const write = db.prepare<[Buffer]>(
    'insert into vault_metadata (id, protected_key) values (1, ?)',
  );
  const recordCount = db.prepare<[], { count: number }>(
    'select count(*) as count from credentials',
  );

  return {
    readProtectedKey(): Buffer | null {
      const row = read.get();
      return row === undefined ? null : row.protected_key;
    },

    writeProtectedKey(protectedKey: Buffer): void {
      write.run(protectedKey);
    },

    hasStoredRecords(): boolean {
      return (recordCount.get()?.count ?? 0) > 0;
    },
  };
}
