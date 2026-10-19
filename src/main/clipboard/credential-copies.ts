import type {
  CredentialCopyRequest,
  CredentialSecret,
  CredentialSummary,
} from '../../shared/credential';
import { failed, succeeded } from '../../shared/vault-result';
import type { VaultResult } from '../../shared/vault-result';
import { storageFailure } from '../credential-service';
import type { ClipboardCleanup } from './clipboard-cleanup';

// The two reads one copy can need, named by what a copy is allowed to answer with.
// The whole repository is not passed here because a copy cannot write, list, or
// delete anything.
export interface CredentialCopySource {
  findById(id: string): CredentialSummary | undefined;
  findSecretById(id: string): CredentialSecret | undefined;
}

export interface CredentialCopies {
  copy(request: CredentialCopyRequest): Promise<VaultResult<null>>;
}

// Puts one field of one record on the system clipboard from the main process, and
// arms that value's cleanup. The renderer sends no value: main reads the record the
// id names, so what lands on the clipboard is what is stored, and the answer
// carries nothing back (architecture.md invariant 17).
//
// A clipboard that refuses the write is a storage failure the card can show as a
// failed copy, and no cleanup is scheduled for a value that never arrived.
export function createCredentialCopies(
  source: CredentialCopySource,
  clipboard: ClipboardCleanup,
): CredentialCopies {
  return {
    async copy(request: CredentialCopyRequest): Promise<VaultResult<null>> {
      try {
        const value =
          request.field === 'identifier'
            ? source.findById(request.id)?.identifier
            : source.findSecretById(request.id)?.password;
        if (value === undefined) {
          return failed('not-found');
        }
        await clipboard.copy(value);
        return succeeded(null);
      } catch (error) {
        return storageFailure('copy', error);
      }
    },
  };
}
