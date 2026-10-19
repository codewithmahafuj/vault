import type { CredentialInput, CredentialSummary } from '../../../shared/credential';
import type {
  CredentialFieldProblem,
  CredentialFormField,
  CredentialFormValues,
} from '../../../shared/credential-form';
import { findDuplicateCredential } from '../../../shared/duplicate-identity';
import { CREDENTIAL_FIELD_LIMITS } from '../../../shared/credential-validation';
import type { VaultErrorCode } from '../../../shared/vault-result';

// The Add/Edit form's view layer: the values it starts from, and the wording it
// shows. The rules themselves live in `shared/credential-form.ts`, which is the
// same source the main-process gate reads, so this file can only describe a
// problem the gate already rejects.

export const emptyFormValues: CredentialFormValues = {
  service: '',
  identifier: '',
  password: '',
  notes: '',
};

// An edit starts from the stored record. The summary payload carries no password,
// so the caller supplies the one it read through the `credentials:read-secret`
// channel for this record.
export function formValuesFor(
  credential: CredentialSummary,
  password: string,
): CredentialFormValues {
  return {
    service: credential.service,
    identifier: credential.identifier,
    password,
    notes: credential.notes ?? '',
  };
}

const fieldNouns: Record<CredentialFormField, string> = {
  service: 'Service',
  identifier: 'Username / email',
  password: 'Password',
  notes: 'Notes',
};

// Only the three required fields can read as blank, and only `notes` may be
// empty, so `required` never arrives with the `notes` field.
export function fieldProblemMessage(
  field: CredentialFormField,
  problem: CredentialFieldProblem,
): string {
  const noun = fieldNouns[field];
  return problem === 'required'
    ? `${noun} is required.`
    : `${noun} must be ${CREDENTIAL_FIELD_LIMITS[field]} characters or fewer.`;
}

export function submitFailureMessage(code: VaultErrorCode): string {
  switch (code) {
    case 'invalid-credential':
      return 'Vault rejected these details. Check the fields above and try again.';
    case 'duplicate-credential':
      return 'An account for this service and username is already saved.';
    case 'not-found':
      return 'This account is no longer in your vault.';
    case 'storage-error':
      return 'Vault could not save your changes. Try again.';
  }
}

// A delete can only come back `not-found` or `storage-error`; the other codes
// cannot reach it, so they fold into the retry message rather than getting copy
// for a case that never happens.
export function deleteFailureMessage(code: VaultErrorCode): string {
  return code === 'not-found'
    ? 'This account is no longer in your vault.'
    : 'Vault could not delete this account. Try again.';
}

// The main process is what reports a duplicate, and it answers with a code
// rather than a record. This re-finds the colliding row in the list the renderer
// already holds, using the shared identity rules, so the warning can offer to
// jump to it. It never decides whether a save is allowed.
export function existingCollision(
  submitted: CredentialInput,
  records: readonly CredentialSummary[],
  editedId: string | null,
): CredentialSummary | undefined {
  return findDuplicateCredential(submitted, records, editedId ?? undefined);
}

// The Edit form's copy button goes through `credentials:copy`, which reads the
// record by id inside the main process and arms that value's cleanup. It can only
// ever put the *saved* password on the clipboard, so the button is offered while
// the field still holds the value Vault read for this record. Once the user types,
// the text on screen is not text the vault has, and a channel that accepted it
// would be a general clipboard endpoint rather than this narrow one --- which is
// also why copying an unsaved value is refused in the UI instead of quietly
// copying something else.
export function unsavedPasswordCopyProblem(field: string, storedPassword: string): string | null {
  return field === storedPassword
    ? null
    : 'Vault copies the password that is saved. Save these changes to copy this one.';
}
