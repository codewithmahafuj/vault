import path from 'node:path';
import { createCredentialRepository } from './database/credential-repository';
import type { CredentialRepository } from './database/credential-repository';
import { openVaultDatabase } from './database/open-vault-database';
import { createStoredKeyAccess } from './database/vault-metadata';
import { loadOrCreateStoredDataKey } from './security/stored-data-key';
import type { KeyProtection } from './security/key-protection';

export const DATABASE_FILE_NAME = 'vault.db';

export interface VaultHandle {
  readonly credentials: CredentialRepository;
  close(): void;
}

// Storage composition root. The data directory and the key protector come from
// the caller, so this module never imports Electron and can be exercised
// against a temporary directory with a stand-in protector in tests.
//
// The database opens first because its own metadata row decides the key
// lifecycle, and a failed key step must not leave a connection behind.
export function openVault(dataDirectory: string, protection: KeyProtection): VaultHandle {
  const db = openVaultDatabase(path.join(dataDirectory, DATABASE_FILE_NAME));

  let dataKey: Buffer;
  try {
    dataKey = loadOrCreateStoredDataKey(createStoredKeyAccess(db), protection);
  } catch (error) {
    db.close();
    throw error;
  }

  return {
    credentials: createCredentialRepository(db, dataKey),
    close: () => db.close(),
  };
}
