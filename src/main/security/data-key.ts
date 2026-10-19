import { randomBytes } from 'node:crypto';
import { DATA_KEY_BYTE_LENGTH } from './field-crypto';
import { KeyIntegrityError, KeyProtectionUnavailableError } from './errors';
import type { KeyProtection } from './key-protection';

export function generateDataKey(): Buffer {
  return randomBytes(DATA_KEY_BYTE_LENGTH);
}

export function protectDataKey(key: Buffer, protection: KeyProtection): Buffer {
  if (!protection.isAvailable()) {
    throw new KeyProtectionUnavailableError();
  }
  if (key.length !== DATA_KEY_BYTE_LENGTH) {
    throw new KeyIntegrityError();
  }
  return protection.protectString(key.toString('base64'));
}

export function unprotectDataKey(protectedKey: Buffer, protection: KeyProtection): Buffer {
  if (!protection.isAvailable()) {
    throw new KeyProtectionUnavailableError();
  }

  let encodedKey: string;
  try {
    encodedKey = protection.unprotectString(protectedKey);
  } catch {
    throw new KeyIntegrityError();
  }

  // Base64 decoding is lenient and never throws, so the restored key is
  // validated by length instead.
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== DATA_KEY_BYTE_LENGTH) {
    throw new KeyIntegrityError();
  }

  return key;
}
