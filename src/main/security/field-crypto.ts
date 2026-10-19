import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { FieldIntegrityError, KeyIntegrityError } from './errors';

export const DATA_KEY_BYTE_LENGTH = 32;

const VERSION = 1;
const NONCE_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;

export const ENCRYPTED_FIELD_HEADER_BYTE_LENGTH = 1 + NONCE_BYTE_LENGTH + AUTH_TAG_BYTE_LENGTH;

// Layout: [version][nonce][auth tag][ciphertext]. Everything after the first
// byte is what AES-256-GCM needs to authenticate and decrypt the value.
function assertDataKey(key: Buffer): void {
  if (key.length !== DATA_KEY_BYTE_LENGTH) {
    throw new KeyIntegrityError();
  }
}

export function encryptField(plaintext: string, key: Buffer): Buffer {
  assertDataKey(key);
  const nonce = randomBytes(NONCE_BYTE_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), nonce, cipher.getAuthTag(), ciphertext]);
}

export function decryptField(encrypted: Buffer, key: Buffer): string {
  assertDataKey(key);
  if (encrypted.length < ENCRYPTED_FIELD_HEADER_BYTE_LENGTH) {
    throw new FieldIntegrityError();
  }
  if (encrypted[0] !== VERSION) {
    throw new FieldIntegrityError();
  }

  const nonce = encrypted.subarray(1, 1 + NONCE_BYTE_LENGTH);
  const authTag = encrypted.subarray(1 + NONCE_BYTE_LENGTH, ENCRYPTED_FIELD_HEADER_BYTE_LENGTH);
  const ciphertext = encrypted.subarray(ENCRYPTED_FIELD_HEADER_BYTE_LENGTH);

  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(authTag);

  // final() is what verifies the tag, so partial output is buffered and only
  // converted to text after authentication succeeds.
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new FieldIntegrityError();
  }

  return plaintext.toString('utf8');
}
