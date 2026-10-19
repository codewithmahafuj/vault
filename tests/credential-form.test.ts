import { describe, expect, it } from 'vitest';
import {
  credentialFormIsValid,
  toCredentialInput,
  validateCredentialForm,
} from '../src/shared/credential-form';
import type { CredentialFormValues } from '../src/shared/credential-form';
import {
  CREDENTIAL_FIELD_LIMITS,
  validateCredentialInput,
} from '../src/shared/credential-validation';

const complete: CredentialFormValues = {
  service: 'Fictional Bank',
  identifier: 'ada@example.com',
  password: 'fictional-bank-password',
  notes: 'The card pin lives in the kitchen drawer.',
};

function withField(field: keyof CredentialFormValues, value: string): CredentialFormValues {
  return { ...complete, [field]: value };
}

const blank: CredentialFormValues = { service: '', identifier: '', password: '', notes: '' };

describe('validateCredentialForm', () => {
  it('accepts a complete set of values', () => {
    expect(validateCredentialForm(complete)).toEqual({});
    expect(credentialFormIsValid(complete)).toBe(true);
  });

  it.each(['service', 'identifier', 'password'] as const)(
    'reports a blank %s as required, not as too long',
    (field) => {
      expect(validateCredentialForm(withField(field, ''))).toEqual({ [field]: 'required' });
      expect(validateCredentialForm(withField(field, '   '))).toEqual({ [field]: 'required' });
      expect(credentialFormIsValid(withField(field, '  '))).toBe(false);
    },
  );

  it('lets notes stay empty', () => {
    expect(validateCredentialForm(withField('notes', ''))).toEqual({});
  });

  it('reports one problem per field and names every offending field', () => {
    expect(validateCredentialForm(blank)).toEqual({
      service: 'required',
      identifier: 'required',
      password: 'required',
    });
  });

  it.each(['service', 'identifier', 'password', 'notes'] as const)(
    'accepts a %s at its limit and rejects one past it',
    (field) => {
      const limit = CREDENTIAL_FIELD_LIMITS[field];
      expect(validateCredentialForm(withField(field, 'x'.repeat(limit)))).toEqual({});
      expect(validateCredentialForm(withField(field, 'x'.repeat(limit + 1)))).toEqual({
        [field]: 'too-long',
      });
    },
  );

  it('calls a whitespace-only field required even when it is also over the limit', () => {
    const tooLongSpaces = ' '.repeat(CREDENTIAL_FIELD_LIMITS.service + 1);
    expect(validateCredentialForm(withField('service', tooLongSpaces))).toEqual({
      service: 'required',
    });
  });

  it('counts length in the same units the main-process gate uses', () => {
    // Emoji are two UTF-16 code units each, so both sides of the boundary see
    // the same number and cannot disagree about what fits.
    const password = '😀'.repeat(CREDENTIAL_FIELD_LIMITS.password / 2);
    expect(password.length).toBe(CREDENTIAL_FIELD_LIMITS.password);
    expect(validateCredentialForm(withField('password', password))).toEqual({});
    expect(validateCredentialForm(withField('password', `${password}x`))).toEqual({
      password: 'too-long',
    });
  });
});

describe('toCredentialInput', () => {
  it('preserves the entered text and maps an empty note to null', () => {
    const entered: CredentialFormValues = {
      service: '  Google    Drive  ',
      identifier: ' ADA@Example.com ',
      password: 'pässwörd-émoji-😀',
      notes: '  ',
    };

    expect(toCredentialInput(entered, true)).toEqual({
      service: entered.service,
      identifier: entered.identifier,
      password: entered.password,
      notes: null,
      favorite: true,
    });
  });

  it('keeps a note that holds real text', () => {
    expect(toCredentialInput(withField('notes', ' work '), false).notes).toBe(' work ');
  });

  it('agrees with the main-process gate in both directions', () => {
    const cases: readonly CredentialFormValues[] = [
      complete,
      withField('notes', ''),
      withField('notes', '   '),
      withField('service', 'x'.repeat(CREDENTIAL_FIELD_LIMITS.service)),
      withField('service', 'x'.repeat(CREDENTIAL_FIELD_LIMITS.service + 1)),
      withField('identifier', ' '),
      blank,
    ];

    for (const values of cases) {
      const validHere = credentialFormIsValid(values);
      const acceptedByMain =
        validateCredentialInput(toCredentialInput(values, false)) !== undefined;
      expect(validHere).toBe(acceptedByMain);
    }
  });
});
