import { describe, expect, it } from 'vitest';
import { generateDataKey, protectDataKey, unprotectDataKey } from '../src/main/security/data-key';
import { DATA_KEY_BYTE_LENGTH } from '../src/main/security/field-crypto';
import { KeyIntegrityError, KeyProtectionUnavailableError } from '../src/main/security/errors';
import type { KeyProtection } from '../src/main/security/key-protection';

const MARKER = 'FAKE_OS_PROTECTION|';

function createFakeProtection(available: boolean, protectedStrings: string[] = []): KeyProtection {
  return {
    isAvailable: () => available,
    protectString: (plainText) => {
      protectedStrings.push(plainText);
      return Buffer.from(MARKER + plainText, 'utf8');
    },
    unprotectString: (encrypted) => {
      const text = encrypted.toString('utf8');
      if (!text.startsWith(MARKER)) {
        throw new Error('payload was not produced by this protector');
      }
      return text.slice(MARKER.length);
    },
  };
}

describe('generateDataKey', () => {
  it('produces a full-length key that differs between calls', () => {
    const first = generateDataKey();
    const second = generateDataKey();

    expect(first).toHaveLength(DATA_KEY_BYTE_LENGTH);
    expect(second).toHaveLength(DATA_KEY_BYTE_LENGTH);
    expect(first.equals(second)).toBe(false);
  });
});

describe('protectDataKey', () => {
  it('round-trips the key through the protector', () => {
    const protection = createFakeProtection(true);
    const key = generateDataKey();

    expect(unprotectDataKey(protectDataKey(key, protection), protection)).toEqual(key);
  });

  it('hands the protector an encoded key rather than raw key bytes', () => {
    const protectedStrings: string[] = [];
    const key = generateDataKey();
    const protectedKey = protectDataKey(key, createFakeProtection(true, protectedStrings));

    expect(protectedStrings).toHaveLength(1);
    const encodedKey = protectedStrings[0];
    if (encodedKey === undefined) {
      throw new Error('the protector was never called');
    }
    expect(Buffer.from(encodedKey, 'base64')).toEqual(key);
    expect(protectedKey.equals(key)).toBe(false);
    expect(protectedKey.includes(key)).toBe(false);
  });

  it('refuses to protect when OS-backed protection is unavailable', () => {
    const protectedStrings: string[] = [];
    expect(() =>
      protectDataKey(generateDataKey(), createFakeProtection(false, protectedStrings)),
    ).toThrow(KeyProtectionUnavailableError);
    expect(protectedStrings).toHaveLength(0);
  });

  it('refuses key material of the wrong length', () => {
    expect(() => protectDataKey(Buffer.alloc(16, 1), createFakeProtection(true))).toThrow(
      KeyIntegrityError,
    );
  });
});

describe('unprotectDataKey', () => {
  it('refuses to restore when OS-backed protection is unavailable', () => {
    const protection = createFakeProtection(true);
    const protectedKey = protectDataKey(generateDataKey(), protection);

    expect(() => unprotectDataKey(protectedKey, createFakeProtection(false))).toThrow(
      KeyProtectionUnavailableError,
    );
  });

  it('rejects a payload the protector did not produce', () => {
    expect(() => unprotectDataKey(Buffer.from('random bytes'), createFakeProtection(true))).toThrow(
      KeyIntegrityError,
    );
  });

  it('rejects restored content that is not a full-length key', () => {
    const protection = createFakeProtection(true);
    const malformed = Buffer.from(MARKER + 'not-a-key', 'utf8');

    expect(() => unprotectDataKey(malformed, protection)).toThrow(KeyIntegrityError);
  });
});
