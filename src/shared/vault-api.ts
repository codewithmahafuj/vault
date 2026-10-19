import type {
  CredentialCopyField,
  CredentialInput,
  CredentialSecret,
  CredentialSummary,
} from './credential';
import type { VaultResult } from './vault-result';

// The privileged surface the renderer may reach. Every method answers with a
// `VaultResult`, so a failure is a code rather than a thrown error crossing
// into the renderer. No list payload carries a password: `readSecret` is the one
// channel that does, and it is only for the record the user is acting on.
export interface VaultApi {
  list(): Promise<VaultResult<CredentialSummary[]>>;
  create(input: CredentialInput): Promise<VaultResult<CredentialSummary>>;
  update(id: string, input: CredentialInput): Promise<VaultResult<CredentialSummary>>;
  remove(id: string): Promise<VaultResult<null>>;
  readSecret(id: string): Promise<VaultResult<CredentialSecret>>;
  setFavorite(id: string, favorite: boolean): Promise<VaultResult<CredentialSummary>>;
  // Puts one field of one record on the system clipboard and answers with nothing
  // but the outcome. The renderer sends an id and a field name, never a value, and
  // the main process does both the writing and the timed cleanup --- a window
  // cannot verify what it copied once the user has switched away, because reading
  // a clipboard needs its document to hold focus.
  copy(id: string, field: CredentialCopyField): Promise<VaultResult<null>>;
}
