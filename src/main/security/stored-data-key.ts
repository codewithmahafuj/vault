import { generateDataKey, protectDataKey, unprotectDataKey } from './data-key';
import { MissingDataKeyError } from './errors';
import type { KeyProtection } from './key-protection';

export interface StoredKeyAccess {
  readProtectedKey(): Buffer | null;
  writeProtectedKey(protectedKey: Buffer): void;
  hasStoredRecords(): boolean;
}

// The key lifecycle for a vault whose protected key lives in its own database
// (architecture.md invariants 2 and 16):
//
// - A row exists, so it is restored. A malformed or un-protectable row raises
//   KeyIntegrityError and is never repaired.
// - No row and no records: this is a brand-new vault, so one key is generated.
//   protectDataKey runs first and refuses when OS-backed protection is
//   unavailable, so a key is never written unprotected and nothing is written
//   at all on failure.
// - No row but records exist: the key was lost while the data survived.
//   Generating a replacement would make every stored record permanently
//   unreadable while pretending the vault is empty, so this fails closed
//   instead. Nothing is created, overwritten, or deleted.
export function loadOrCreateStoredDataKey(
  access: StoredKeyAccess,
  protection: KeyProtection,
): Buffer {
  const stored = access.readProtectedKey();
  if (stored !== null) {
    return unprotectDataKey(stored, protection);
  }

  if (access.hasStoredRecords()) {
    throw new MissingDataKeyError();
  }

  const key = generateDataKey();
  access.writeProtectedKey(protectDataKey(key, protection));
  return key;
}
