import { describe, expect, it } from 'vitest';
import {
  decryptField,
  encryptField,
  ENCRYPTED_FIELD_HEADER_BYTE_LENGTH,
} from '../src/main/security/field-crypto';
import { generateDataKey } from '../src/main/security/data-key';
import { FieldIntegrityError, KeyIntegrityError } from '../src/main/security/errors';

const SECRET = 'fictional-hunter2-token';

describe('encryptField', () => {
  it('uses a fresh nonce so equal values never share a ciphertext', () => {
    const key = generateDataKey();
    const first = encryptField(SECRET, key);
    const second = encryptField(SECRET, key);

    expect(first.equals(second)).toBe(false);
    expect(decryptField(first, key)).toBe(SECRET);
    expect(decryptField(second, key)).toBe(SECRET);
  });

  it('never contains the plaintext value', () => {
    const encrypted = encryptField(SECRET, generateDataKey());
    expect(encrypted.includes(Buffer.from(SECRET, 'utf8'))).toBe(false);
    expect(encrypted.includes(Buffer.from(SECRET.slice(0, 8), 'utf8'))).toBe(false);
  });

  it('stores only the header plus the ciphertext length', () => {
    const encrypted = encryptField(SECRET, generateDataKey());
    expect(encrypted).toHaveLength(
      ENCRYPTED_FIELD_HEADER_BYTE_LENGTH + Buffer.byteLength(SECRET, 'utf8'),
    );
  });
});

describe('decryptField', () => {
  it('round-trips unicode and empty values', () => {
    const key = generateDataKey();
    for (const value of ['pässwörd 🔐 中文', '', 'a']) {
      expect(decryptField(encryptField(value, key), key)).toBe(value);
    }
  });

  it('rejects a modified ciphertext', () => {
    const key = generateDataKey();
    const encrypted = encryptField(SECRET, key);
    encrypted[ENCRYPTED_FIELD_HEADER_BYTE_LENGTH] =
      (encrypted[ENCRYPTED_FIELD_HEADER_BYTE_LENGTH] ?? 0) ^ 0xff;

    expect(() => decryptField(encrypted, key)).toThrow(FieldIntegrityError);
  });

  it('rejects a modified auth tag', () => {
    const key = generateDataKey();
    const encrypted = encryptField(SECRET, key);
    encrypted[ENCRYPTED_FIELD_HEADER_BYTE_LENGTH - 1] =
      (encrypted[ENCRYPTED_FIELD_HEADER_BYTE_LENGTH - 1] ?? 0) ^ 0xff;

    expect(() => decryptField(encrypted, key)).toThrow(FieldIntegrityError);
  });

  it('rejects a truncated or extended payload', () => {
    const key = generateDataKey();
    const encrypted = encryptField(SECRET, key);

    expect(() => decryptField(encrypted.subarray(0, 4), key)).toThrow(FieldIntegrityError);
    expect(() => decryptField(Buffer.concat([encrypted, Buffer.from([9])]), key)).toThrow(
      FieldIntegrityError,
    );
  });

  it('rejects an unknown format version', () => {
    const key = generateDataKey();
    const encrypted = encryptField(SECRET, key);
    encrypted[0] = 7;

    expect(() => decryptField(encrypted, key)).toThrow(FieldIntegrityError);
  });

  it('rejects the right ciphertext under the wrong key', () => {
    const encrypted = encryptField(SECRET, generateDataKey());
    expect(() => decryptField(encrypted, generateDataKey())).toThrow(FieldIntegrityError);
  });

  it('does not put the plaintext in the failure', () => {
    const encrypted = encryptField(SECRET, generateDataKey());
    let failure: unknown;
    try {
      decryptField(encrypted, generateDataKey());
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(FieldIntegrityError);
    if (failure instanceof FieldIntegrityError) {
      expect(failure.message).not.toContain(SECRET);
    }
  });

  it('rejects key material of the wrong length', () => {
    const shortKey = Buffer.alloc(31, 3);
    const validBlob = encryptField(SECRET, generateDataKey());

    expect(() => encryptField(SECRET, shortKey)).toThrow(KeyIntegrityError);
    expect(() => decryptField(validBlob, shortKey)).toThrow(KeyIntegrityError);
  });
});
