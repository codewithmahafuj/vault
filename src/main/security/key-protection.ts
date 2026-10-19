export interface StringProtector {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface KeyProtection {
  isAvailable(): boolean;
  protectString(plainText: string): Buffer;
  unprotectString(encrypted: Buffer): string;
}

// Build this after app ready: Electron reports availability only once the OS
// key store is reachable. Availability is re-checked on every call so a vault
// left open cannot use a protection state that changed since startup.
// Keeping Electron out of this module lets the key lifecycle be tested without
// an Electron runtime.
export function createSafeStorageProtection(safeStorage: StringProtector): KeyProtection {
  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    protectString: (plainText) => safeStorage.encryptString(plainText),
    unprotectString: (encrypted) => safeStorage.decryptString(encrypted),
  };
}
