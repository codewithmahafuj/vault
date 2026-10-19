import {
  KeyIntegrityError,
  KeyProtectionUnavailableError,
  MissingDataKeyError,
} from './security/errors';

export const STARTUP_FAILURE_TITLE = 'Vault cannot start';

// Fixed copy for the failures that happen before the renderer can show a state
// of its own. Neither names a file path, record, or driver detail, because a
// rejected startup can carry all three.
export const UNEXPECTED_STARTUP_FAILURE_MESSAGE = [
  'Vault could not finish starting.',
  '',
  'No data was read or changed. Close Vault and open it again.',
].join('\n');

export const RENDERER_LOAD_FAILURE_MESSAGE = [
  'Vault could not display its window.',
  '',
  'No data was read or changed. Close Vault and open it again.',
].join('\n');

// Startup failures are fatal, so the user needs to know the vault did not open
// and that nothing of theirs was lost or changed. The messages name no file
// path, record, or error detail (architecture.md), and a driver or crypto
// message can contain all three, so none of it is ever interpolated here.
export function startupFailureMessage(error: unknown): string {
  if (error instanceof KeyProtectionUnavailableError) {
    return [
      'Windows did not make secure storage available to Vault, so its encryption key',
      'could not be read or created.',
      '',
      'Nothing was written, and no existing data was changed.',
    ].join('\n');
  }

  if (error instanceof MissingDataKeyError || error instanceof KeyIntegrityError) {
    return [
      'Vault could not unlock its saved data because its encryption key is missing or',
      'unreadable.',
      '',
      'Vault did not create a new key, replace any file, or start an empty vault. Your',
      'data is still on disk in its previous state.',
    ].join('\n');
  }

  return [
    'Vault could not open its local database.',
    '',
    'No data was changed. Vault did not create a new database or replace any file.',
  ].join('\n');
}
