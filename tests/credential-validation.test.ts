import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_FIELD_LIMITS,
  validateCredentialId,
  validateCredentialInput,
  validateCredentialUpdate,
  validateFavoriteUpdate,
} from '../src/shared/credential-validation';
import type { CredentialInput } from '../src/shared/credential';

const valid: CredentialInput = {
  service: 'Fictional Bank',
  identifier: 'ada@example.com',
  password: 'fictional-bank-password',
  notes: 'The card pin lives in the kitchen drawer.',
  favorite: true,
};

function withField(field: keyof CredentialInput, value: unknown): unknown {
  return { ...valid, [field]: value };
}

describe('validateCredentialInput', () => {
  it('accepts a complete record and preserves the entered values', () => {
    const entered: CredentialInput = {
      service: '  Google    Drive  ',
      identifier: ' ADA@Example.com ',
      password: 'pässwörd-émoji-😀',
      notes: '',
      favorite: false,
    };

    expect(validateCredentialInput(entered)).toEqual(entered);
  });

  it('returns exactly the five fields and ignores extra properties', () => {
    const result = validateCredentialInput({ ...valid, id: 'injected', admin: true });

    expect(result).toEqual(valid);
    expect(Object.keys(result ?? {})).toEqual([
      'service',
      'identifier',
      'password',
      'notes',
      'favorite',
    ]);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'Fictional Bank'],
    ['a number', 7],
    ['an array', [valid]],
  ])('rejects a payload that is not an object: %s', (_name, raw) => {
    expect(validateCredentialInput(raw)).toBeUndefined();
  });

  it.each([
    ['service', 'service'],
    ['identifier', 'identifier'],
    ['password', 'password'],
  ] as const)('requires a non-blank %s', (_label, field) => {
    expect(validateCredentialInput(withField(field, ''))).toBeUndefined();
    expect(validateCredentialInput(withField(field, '   '))).toBeUndefined();
    expect(validateCredentialInput(withField(field, undefined))).toBeUndefined();
    expect(validateCredentialInput(withField(field, 42))).toBeUndefined();
  });

  it.each([
    ['service', CREDENTIAL_FIELD_LIMITS.service],
    ['identifier', CREDENTIAL_FIELD_LIMITS.identifier],
    ['password', CREDENTIAL_FIELD_LIMITS.password],
    ['notes', CREDENTIAL_FIELD_LIMITS.notes],
  ] as const)('rejects a %s longer than its limit', (field, limit) => {
    expect(validateCredentialInput(withField(field, 'x'.repeat(limit + 1)))).toBeUndefined();
    expect(validateCredentialInput(withField(field, 'x'.repeat(limit)))).toBeDefined();
  });

  it('treats null notes as absent and an empty string as an empty note', () => {
    expect(validateCredentialInput(withField('notes', null))).toEqual({ ...valid, notes: null });
    expect(validateCredentialInput(withField('notes', ''))).toEqual({ ...valid, notes: '' });

    const withoutNotes: Record<string, unknown> = { ...valid };
    delete withoutNotes['notes'];
    expect(validateCredentialInput(withoutNotes)).toBeUndefined();
  });

  it.each([
    ['a number', 1],
    ['a string', 'true'],
    ['undefined', undefined],
    ['null', null],
  ])('requires favorite to be a real boolean, not %s', (_name, value) => {
    expect(validateCredentialInput(withField('favorite', value))).toBeUndefined();
  });

  it('rejects a non-text notes value', () => {
    expect(validateCredentialInput(withField('notes', 42))).toBeUndefined();
    expect(validateCredentialInput(withField('notes', { secret: 'x' }))).toBeUndefined();
  });
});

describe('validateCredentialId', () => {
  it('accepts a bounded, non-blank id', () => {
    const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    expect(validateCredentialId(id)).toBe(id);
    expect(validateCredentialId('x'.repeat(CREDENTIAL_FIELD_LIMITS.id))).toBeDefined();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['a blank string', '  '],
    ['a number', 12],
    ['an over-long string', 'x'.repeat(CREDENTIAL_FIELD_LIMITS.id + 1)],
  ])('rejects %s', (_name, raw) => {
    expect(validateCredentialId(raw)).toBeUndefined();
  });
});

describe('validateCredentialUpdate', () => {
  it('splits a flat update payload into an id and its input', () => {
    const payload = { id: 'row-1', ...valid };

    expect(validateCredentialUpdate(payload)).toEqual({ id: 'row-1', input: valid });
  });

  it('rejects a payload without a usable id', () => {
    expect(validateCredentialUpdate({ ...valid })).toBeUndefined();
    expect(validateCredentialUpdate({ id: '   ', ...valid })).toBeUndefined();
    expect(validateCredentialUpdate({ id: 5, ...valid })).toBeUndefined();
  });

  it('rejects an update whose fields are invalid', () => {
    expect(validateCredentialUpdate({ id: 'row-1', ...valid, password: '' })).toBeUndefined();
  });
});

describe('validateFavoriteUpdate', () => {
  it('accepts an id with a real boolean and drops every other property', () => {
    expect(validateFavoriteUpdate({ id: 'row-1', favorite: true })).toEqual({
      id: 'row-1',
      favorite: true,
    });

    const narrowed = validateFavoriteUpdate({
      id: 'row-1',
      favorite: false,
      service: 'Injected',
      password: 'injected-password',
    });
    expect(narrowed).toEqual({ id: 'row-1', favorite: false });
    expect(Object.keys(narrowed ?? {})).toEqual(['id', 'favorite']);
  });

  it('rejects a favorite that is not a boolean instead of guessing', () => {
    for (const favorite of [undefined, null, 'true', 1, 0, '']) {
      expect(validateFavoriteUpdate({ id: 'row-1', favorite })).toBeUndefined();
    }
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'row-1'],
    ['an array', ['row-1', true]],
    ['no id', { favorite: true }],
    ['a blank id', { id: '   ', favorite: true }],
    ['a numeric id', { id: 7, favorite: true }],
    ['an over-long id', { id: 'x'.repeat(CREDENTIAL_FIELD_LIMITS.id + 1), favorite: true }],
  ])('rejects a payload that is %s', (_name, raw) => {
    expect(validateFavoriteUpdate(raw)).toBeUndefined();
  });
});
