import type { KeyProtection } from '../src/main/security/key-protection';

export const FAKE_PROTECTION_MARKER = 'FAKE_OS_PROTECTION|';

// A stand-in for Electron's safeStorage: reversible, but obviously not the real
// thing. Used only to exercise the stored-key lifecycle and vault wiring outside
// an Electron runtime; the real Windows path was verified separately.
export function createFakeProtection(available: boolean = true): KeyProtection {
  return {
    isAvailable: () => available,
    protectString: (plainText) => Buffer.from(FAKE_PROTECTION_MARKER + plainText, 'utf8'),
    unprotectString: (encrypted) => {
      const text = encrypted.toString('utf8');
      if (!text.startsWith(FAKE_PROTECTION_MARKER)) {
        throw new Error('payload was not produced by this protector');
      }
      return text.slice(FAKE_PROTECTION_MARKER.length);
    },
  };
}
