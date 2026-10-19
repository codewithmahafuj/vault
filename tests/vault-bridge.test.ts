import { describe, expect, it } from 'vitest';
import { callVault } from '../src/renderer/src/lib/vault-bridge';
import { failed, succeeded } from '../src/shared/vault-result';
import type { VaultResult } from '../src/shared/vault-result';

interface Row {
  readonly id: string;
}

const leak = 'E:\\Users\\ada\\AppData\\Roaming\\Vault\\vault.db row-7 credentials';

describe('callVault', () => {
  it('passes a successful answer through unchanged', async () => {
    const row: Row = { id: 'row-1' };
    const result = await callVault<Row>(async () => succeeded(row));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe(row);
  });

  it('keeps the code of a refused answer instead of widening it', async () => {
    const result = await callVault<Row>(async () => failed('not-found'));

    expect(result).toEqual({ ok: false, code: 'not-found' });
  });

  it('turns a rejected promise into the storage failure the UI already reports', async () => {
    const result = await callVault<Row>(async () => {
      throw new Error('Error invoking remote method');
    });

    expect(result).toEqual({ ok: false, code: 'storage-error' });
  });

  it('folds a rejection that is not an Error', async () => {
    const result = await callVault<Row>(
      () => Promise.reject({ status: 'killed' }) as Promise<VaultResult<Row>>,
    );

    expect(result).toEqual({ ok: false, code: 'storage-error' });
  });

  it('carries nothing from the rejection across the boundary', async () => {
    const result = await callVault<Row>(async () => {
      throw new Error(leak);
    });

    expect(Object.keys(result)).toEqual(['ok', 'code']);
    expect(JSON.stringify(result)).not.toContain('vault.db');
    expect(JSON.stringify(result)).not.toContain('row-7');
  });

  it('never rejects, so a mutation can always reach its cleanup', async () => {
    await expect(
      callVault<Row>(() => Promise.reject(new Error(leak)) as Promise<VaultResult<Row>>),
    ).resolves.toMatchObject({ ok: false });
  });
});
