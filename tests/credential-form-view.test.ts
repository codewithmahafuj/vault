import { describe, expect, it } from 'vitest';
import type { CredentialInput, CredentialSummary } from '../src/shared/credential';
import { CREDENTIAL_FIELD_LIMITS } from '../src/shared/credential-validation';
import {
  deleteFailureMessage,
  emptyFormValues,
  existingCollision,
  fieldProblemMessage,
  formValuesFor,
  submitFailureMessage,
  unsavedPasswordCopyProblem,
} from '../src/renderer/src/lib/credential-form';

function summaryFor(id: string, values: Partial<CredentialSummary> = {}): CredentialSummary {
  return {
    id,
    service: 'Fictional Bank',
    identifier: 'ada@example.com',
    notes: null,
    favorite: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...values,
  };
}

const stored = summaryFor('row-1');

describe('formValuesFor', () => {
  it('starts an edit from the stored record plus its separately read password', () => {
    const credential = summaryFor('row-1', { notes: 'card pin in the drawer' });

    expect(formValuesFor(credential, 'read-back-password')).toEqual({
      service: 'Fictional Bank',
      identifier: 'ada@example.com',
      password: 'read-back-password',
      notes: 'card pin in the drawer',
    });
  });

  it('opens a null note as an empty field', () => {
    expect(formValuesFor(stored, 'x').notes).toBe('');
  });

  it('keeps the shared empty form untouched', () => {
    expect(emptyFormValues).toEqual({ service: '', identifier: '', password: '', notes: '' });
    expect(formValuesFor(stored, 'x')).not.toBe(emptyFormValues);
  });
});

describe('fieldProblemMessage', () => {
  it('names the field it is complaining about', () => {
    expect(fieldProblemMessage('identifier', 'required')).toBe('Username / email is required.');
    expect(fieldProblemMessage('service', 'required')).toBe('Service is required.');
  });

  it('quotes the same limit the main-process gate enforces', () => {
    expect(fieldProblemMessage('notes', 'too-long')).toBe(
      `Notes must be ${CREDENTIAL_FIELD_LIMITS.notes} characters or fewer.`,
    );
    expect(fieldProblemMessage('password', 'too-long')).toContain(
      String(CREDENTIAL_FIELD_LIMITS.password),
    );
  });
});

describe('failure messages', () => {
  it.each(['invalid-credential', 'duplicate-credential', 'not-found', 'storage-error'] as const)(
    'says something for %s',
    (code) => {
      expect(submitFailureMessage(code)).not.toBe('');
    },
  );

  it('distinguishes an already-deleted record from a storage failure', () => {
    expect(deleteFailureMessage('not-found')).toContain('no longer in your vault');
    expect(deleteFailureMessage('storage-error')).toContain('could not delete');
  });
});

describe('existingCollision', () => {
  const records = [stored, summaryFor('row-2', { service: 'Zebra Mail' })];
  const input: CredentialInput = {
    service: '  fictional   BANK ',
    identifier: 'ADA@example.com ',
    password: 'new-password',
    notes: null,
    favorite: false,
  };

  it('points at the row the shared identity rules match', () => {
    expect(existingCollision(input, records, null)?.id).toBe('row-1');
  });

  it('ignores the record being edited', () => {
    expect(existingCollision(input, records, 'row-1')).toBeUndefined();
  });

  it('finds nothing for a new identity', () => {
    expect(
      existingCollision({ ...input, identifier: 'grace@example.com' }, records, null),
    ).toBeUndefined();
  });

  it('never carries the submitted password forward', () => {
    const found = existingCollision(input, records, null);
    expect(JSON.stringify(found)).not.toContain(input.password);
  });
});

describe('unsavedPasswordCopyProblem', () => {
  const storedPassword = 'saved-fictional-password';

  it('offers the copy while the field still holds the saved password', () => {
    expect(unsavedPasswordCopyProblem(storedPassword, storedPassword)).toBeNull();
  });

  it('refuses the copy once the field holds a different value', () => {
    expect(unsavedPasswordCopyProblem('typed-a-new-one', storedPassword)).toContain(
      'Vault copies the password that is saved',
    );
  });

  it('refuses the copy when the field has been cleared', () => {
    expect(unsavedPasswordCopyProblem('', storedPassword)).not.toBeNull();
  });

  it('offers it again when the field holds nothing and so does the vault', () => {
    // An Add card is the case: no record, no saved password, and the pill is not
    // rendered for it at all.
    expect(unsavedPasswordCopyProblem('', '')).toBeNull();
  });

  it('says what to do without naming either value', () => {
    const problem = unsavedPasswordCopyProblem('typed-a-new-one', storedPassword) ?? '';
    expect(problem).toContain('Save these changes');
    expect(problem).not.toContain(storedPassword);
    expect(problem).not.toContain('typed-a-new-one');
  });
});
