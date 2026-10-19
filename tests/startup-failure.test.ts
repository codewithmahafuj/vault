import { describe, expect, it } from 'vitest';
import {
  RENDERER_LOAD_FAILURE_MESSAGE,
  STARTUP_FAILURE_TITLE,
  UNEXPECTED_STARTUP_FAILURE_MESSAGE,
  startupFailureMessage,
} from '../src/main/startup-failure';
import {
  FieldIntegrityError,
  KeyIntegrityError,
  KeyProtectionUnavailableError,
  MissingDataKeyError,
} from '../src/main/security/errors';

const securityErrors = [
  new KeyProtectionUnavailableError(),
  new MissingDataKeyError(),
  new KeyIntegrityError(),
  new FieldIntegrityError(),
];

describe('startupFailureMessage', () => {
  it('gives each distinct failure its own message', () => {
    const protection = startupFailureMessage(new KeyProtectionUnavailableError());
    const missingKey = startupFailureMessage(new MissingDataKeyError());
    const unreadableKey = startupFailureMessage(new KeyIntegrityError());
    const unknown = startupFailureMessage(new Error('anything else'));

    // A lost key row and an unreadable one are the same outcome for the user,
    // so they deliberately share one message.
    expect(missingKey).toBe(unreadableKey);
    expect(new Set([protection, missingKey, unknown]).size).toBe(3);
  });

  it('names no file path, record, or underlying error detail', () => {
    // The generic branch must not interpolate what it was handed.
    const leaked = 'E:\\Users\\ada\\AppData\\Roaming\\Vault\\vault.db row-7 credentials';
    const messages = [...securityErrors.map(startupFailureMessage), startupFailureMessage(leaked)];

    for (const message of messages) {
      expect(message).not.toContain('Users');
      expect(message).not.toContain('AppData');
      expect(message).not.toContain('vault.db');
      expect(message).not.toContain('row-7');
      expect(message).not.toContain('credentials');
    }
  });

  it('reassures the user without describing a record', () => {
    expect(startupFailureMessage(new KeyProtectionUnavailableError())).toContain('secure storage');
    expect(startupFailureMessage(new MissingDataKeyError())).toContain('did not create a new key');
    expect(startupFailureMessage(new KeyIntegrityError())).toContain('did not create a new key');
    expect(startupFailureMessage(new FieldIntegrityError())).toContain('local database');
  });

  it('treats any unrecognized error as the same closed outcome', () => {
    for (const error of ['vault.key', undefined, 42, new RangeError('stack')]) {
      expect(startupFailureMessage(error)).toBe(startupFailureMessage(new Error('unknown')));
    }
  });

  it('keeps a title that states the outcome', () => {
    expect(STARTUP_FAILURE_TITLE).toBe('Vault cannot start');
  });
});

// These two cover the paths that fail before the renderer can show a state of
// its own: the window content could not load, and anything else that throws on
// the way up.
describe('pre-window failure copy', () => {
  const messages = [RENDERER_LOAD_FAILURE_MESSAGE, UNEXPECTED_STARTUP_FAILURE_MESSAGE];

  it('says the app did not start and that nothing was touched', () => {
    for (const message of messages) {
      expect(message).toContain('Vault could not');
      expect(message).toContain('No data was read or changed');
      expect(message).toContain('Close Vault and open it again');
    }
  });

  it('separates a window that cannot load from a start that cannot finish', () => {
    expect(RENDERER_LOAD_FAILURE_MESSAGE).not.toBe(UNEXPECTED_STARTUP_FAILURE_MESSAGE);
    expect(RENDERER_LOAD_FAILURE_MESSAGE).toContain('window');
  });

  it('names no file path, record, or underlying error detail', () => {
    const leaked = 'E:\\Users\\ada\\AppData\\Roaming\\Vault\\vault.db row-7 credentials';

    for (const message of messages) {
      expect(message).not.toContain('Users');
      expect(message).not.toContain('AppData');
      expect(message).not.toContain('vault.db');
      expect(message).not.toContain('row-7');
      expect(message).not.toContain('credentials');
      expect(message).not.toContain(leaked);
    }
  });
});
