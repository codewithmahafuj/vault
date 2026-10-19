import type { CredentialInput, CredentialSecret, CredentialSummary } from '../shared/credential';
import { findDuplicateCredential } from '../shared/duplicate-identity';
import { sortByServiceThenIdentifier } from '../shared/sorting';
import { failed, succeeded } from '../shared/vault-result';
import type { VaultResult } from '../shared/vault-result';
import type { CredentialRepository } from './database/credential-repository';

export interface CredentialService {
  list(): VaultResult<CredentialSummary[]>;
  create(input: CredentialInput): VaultResult<CredentialSummary>;
  update(id: string, input: CredentialInput): VaultResult<CredentialSummary>;
  remove(id: string): VaultResult<null>;
  readSecret(id: string): VaultResult<CredentialSecret>;
  setFavorite(id: string, favorite: boolean): VaultResult<CredentialSummary>;
}

// Only the error class name is recorded. A driver message can contain the
// database path or statement text, and a security error can name a record, so
// neither reaches the console; the renderer receives a fixed code instead.
// Exported because every main-process operation that can throw folds its failure
// the same way, not only the storage ones.
export function storageFailure(operation: string, error: unknown): VaultResult<never> {
  console.error(`vault: ${operation} failed (${error instanceof Error ? error.name : 'unknown'})`);
  return failed('storage-error');
}

// All domain decisions that a renderer could otherwise disagree with live here:
// ordering, the duplicate re-check, and the mapping of a failure to a code.
// Duplicate detection runs over the decrypted list because an encrypted column
// cannot be compared or searched in SQL (architecture.md).
export function createCredentialService(repository: CredentialRepository): CredentialService {
  return {
    list(): VaultResult<CredentialSummary[]> {
      try {
        return succeeded(sortByServiceThenIdentifier(repository.list()));
      } catch (error) {
        return storageFailure('list', error);
      }
    },

    create(input: CredentialInput): VaultResult<CredentialSummary> {
      try {
        const duplicate = findDuplicateCredential(input, repository.list());
        if (duplicate !== undefined) {
          return failed('duplicate-credential');
        }
        return succeeded(repository.create(input));
      } catch (error) {
        return storageFailure('create', error);
      }
    },

    update(id: string, input: CredentialInput): VaultResult<CredentialSummary> {
      try {
        // Existence is checked first: an id that is not in the vault is a
        // not-found, not someone else's duplicate.
        const existing = repository.findById(id);
        if (existing === undefined) {
          return failed('not-found');
        }

        const duplicate = findDuplicateCredential(input, repository.list(), id);
        if (duplicate !== undefined) {
          return failed('duplicate-credential');
        }

        const updated = repository.update(id, input);
        if (updated === undefined) {
          return failed('not-found');
        }
        return succeeded(updated);
      } catch (error) {
        return storageFailure('update', error);
      }
    },

    remove(id: string): VaultResult<null> {
      try {
        return repository.delete(id) ? succeeded(null) : failed('not-found');
      } catch (error) {
        return storageFailure('delete', error);
      }
    },

    // A flag flip on one record. No duplicate re-check runs here because the
    // duplicate identity is service plus identifier, and neither can change.
    setFavorite(id: string, favorite: boolean): VaultResult<CredentialSummary> {
      try {
        const updated = repository.setFavorite(id, favorite);
        return updated === undefined ? failed('not-found') : succeeded(updated);
      } catch (error) {
        return storageFailure('set-favorite', error);
      }
    },

    // The only path that hands a password to the renderer, and only for one id
    // the caller already holds. A field that fails authentication throws inside
    // the repository, so no partially decrypted value can be returned.
    readSecret(id: string): VaultResult<CredentialSecret> {
      try {
        const secret = repository.findSecretById(id);
        return secret === undefined ? failed('not-found') : succeeded(secret);
      } catch (error) {
        return storageFailure('read-secret', error);
      }
    },
  };
}
