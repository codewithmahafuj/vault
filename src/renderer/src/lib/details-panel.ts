import type { VaultErrorCode } from '../../../shared/vault-result';

// The details card's view layer: the wording for the two writes the card can
// make. The rules behind these messages live in the main process, which reports a
// code; this file can only describe an outcome it already reported.

export type CopyOutcome = 'copied' | 'failed';

// Shared by both affordances: a record that answers `not-found` has been removed
// since the card was drawn, whichever button the user happened to press.
const goneMessage = 'This account is no longer in your vault.';

export function favoriteFailureMessage(code: VaultErrorCode): string {
  return code === 'not-found' ? goneMessage : 'Vault could not update this account. Try again.';
}

export function revealFailureMessage(code: VaultErrorCode): string {
  return code === 'not-found' ? goneMessage : 'Vault could not read this password. Try again.';
}
