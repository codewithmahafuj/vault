import { describe, expect, it } from 'vitest';
import {
  dataSourceDecision,
  listFailureCopy,
  writeUnavailableCopy,
} from '../src/renderer/src/lib/data-source';
import type { VaultErrorCode } from '../src/shared/vault-result';

const vaultErrors: readonly VaultErrorCode[] = [
  'invalid-credential',
  'duplicate-credential',
  'not-found',
  'storage-error',
];

describe('dataSourceDecision', () => {
  it('reads from the vault whenever the bridge is there', () => {
    expect(dataSourceDecision(true, true)).toBe('vault');
    expect(dataSourceDecision(true, false)).toBe('vault');
  });

  it('labels fictional fixtures as a development preview only', () => {
    expect(dataSourceDecision(false, true)).toBe('sample');
  });

  it('treats a packaged renderer without a bridge as a broken install', () => {
    expect(dataSourceDecision(false, false)).toBe('missing-bridge');
  });

  it('never chooses fixtures when it is not a development run', () => {
    const decisions = [true, false].flatMap((bridgePresent) =>
      [true, false].map((development) => dataSourceDecision(bridgePresent, development)),
    );

    expect(decisions.filter((decision) => decision === 'sample')).toEqual(['sample']);
  });
});

describe('listFailureCopy', () => {
  it('gives every failure a title and a description', () => {
    for (const failure of [...vaultErrors, 'missing-bridge' as const]) {
      const copy = listFailureCopy(failure);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.description.length).toBeGreaterThan(0);
    }
  });

  it('says something different when there is no bridge to read from', () => {
    const bridge = listFailureCopy('missing-bridge');
    const storage = listFailureCopy('storage-error');

    expect(bridge.title).not.toBe(storage.title);
    expect(bridge.description).not.toBe(storage.description);
  });

  it('tells the user nothing of theirs was read or changed', () => {
    expect(listFailureCopy('missing-bridge').description).toContain('nothing was read or changed');
  });

  it('names no file path, record, or database detail', () => {
    for (const failure of [...vaultErrors, 'missing-bridge' as const]) {
      const copy = JSON.stringify(listFailureCopy(failure));
      expect(copy).not.toContain('Users');
      expect(copy).not.toContain('AppData');
      expect(copy).not.toContain('vault.db');
      expect(copy).not.toContain('SQLite');
      expect(copy).not.toContain('credentials');
    }
  });
});

// A built app whose bridge never attached is a broken install, and ui-context.md
// forbids describing it as a demonstration. The disabled write affordance is the
// one place the shell says so outside the failure screen, so its wording is pinned.
describe('writeUnavailableCopy', () => {
  const everyWording = Object.values(writeUnavailableCopy);

  it('says something for both the label and the reason', () => {
    for (const wording of everyWording) {
      expect(wording.length).toBeGreaterThan(0);
    }
  });

  it('never calls a broken install a preview, a demo, or sample data', () => {
    for (const wording of everyWording) {
      expect(wording.toLowerCase()).not.toContain('preview');
      expect(wording.toLowerCase()).not.toContain('demo');
      expect(wording.toLowerCase()).not.toContain('sample');
      expect(wording.toLowerCase()).not.toContain('fixture');
    }
  });

  it('names the missing connection rather than a file, record, or path', () => {
    expect(writeUnavailableCopy.reason).toContain('not connected to your data');
    for (const wording of everyWording) {
      expect(wording).not.toContain('vault.db');
      expect(wording).not.toContain('AppData');
      expect(wording).not.toContain('IPC');
    }
  });
});
