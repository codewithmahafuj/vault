import { describe, expect, it } from 'vitest';
import type {
  CredentialCopyRequest,
  CredentialSecret,
  CredentialSummary,
} from '../src/shared/credential';
import { createCredentialCopies } from '../src/main/clipboard/credential-copies';
import type { CredentialCopySource } from '../src/main/clipboard/credential-copies';
import type { ClipboardCleanup } from '../src/main/clipboard/clipboard-cleanup';

const FICTIONAL_IDENTIFIER = 'ada@example.test';
const FICTIONAL_PASSWORD = 'fictional-bank-password';

function summaryFor(id: string): CredentialSummary {
  return {
    id,
    service: 'Fictional Bank',
    identifier: FICTIONAL_IDENTIFIER,
    notes: null,
    favorite: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

interface FakeSource extends CredentialCopySource {
  readonly reads: string[];
}

function createFakeSource(known = true): FakeSource {
  return {
    reads: [],
    findById(id: string): CredentialSummary | undefined {
      this.reads.push(`findById:${id}`);
      return known ? summaryFor(id) : undefined;
    },
    findSecretById(id: string): CredentialSecret | undefined {
      this.reads.push(`findSecretById:${id}`);
      return known ? { id, password: FICTIONAL_PASSWORD } : undefined;
    },
  };
}

interface FakeCleanup extends ClipboardCleanup {
  readonly copied: string[];
  cancelled: number;
  refuse: boolean;
}

function createFakeCleanup(): FakeCleanup {
  const copied: string[] = [];
  return {
    timeoutMs: 45_000,
    copied,
    cancelled: 0,
    refuse: false,
    async copy(value: string): Promise<void> {
      if (this.refuse) {
        throw new Error('the clipboard refused the write');
      }
      copied.push(value);
    },
    cancelPending(): void {
      this.cancelled += 1;
    },
  };
}

const request = (field: CredentialCopyRequest['field']): CredentialCopyRequest => ({
  id: 'row-1',
  field,
});

describe('createCredentialCopies', () => {
  it('copies the stored identifier and arms its cleanup', async () => {
    const source = createFakeSource();
    const cleanup = createFakeCleanup();

    await expect(
      createCredentialCopies(source, cleanup).copy(request('identifier')),
    ).resolves.toEqual({
      ok: true,
      value: null,
    });

    expect(source.reads).toEqual(['findById:row-1']);
    expect(cleanup.copied).toEqual([FICTIONAL_IDENTIFIER]);
  });

  it('copies the stored password from the secret read, not the summary', async () => {
    const source = createFakeSource();
    const cleanup = createFakeCleanup();

    const result = await createCredentialCopies(source, cleanup).copy(request('password'));

    expect(result.ok).toBe(true);
    expect(source.reads).toEqual(['findSecretById:row-1']);
    expect(cleanup.copied).toEqual([FICTIONAL_PASSWORD]);
  });

  it('answers not-found for a record that is no longer in the vault', async () => {
    const source = createFakeSource(false);
    const cleanup = createFakeCleanup();

    for (const field of ['identifier', 'password'] as const) {
      await expect(createCredentialCopies(source, cleanup).copy(request(field))).resolves.toEqual({
        ok: false,
        code: 'not-found',
      });
    }
    expect(cleanup.copied).toEqual([]);
  });

  it('folds a clipboard that refuses the write into a storage failure', async () => {
    const source = createFakeSource();
    const cleanup = createFakeCleanup();
    cleanup.refuse = true;

    await expect(
      createCredentialCopies(source, cleanup).copy(request('password')),
    ).resolves.toEqual({ ok: false, code: 'storage-error' });
  });

  it('folds a read that throws into a storage failure', async () => {
    const source: CredentialCopySource = {
      findById: () => {
        throw new Error('the database is busy');
      },
      findSecretById: () => {
        throw new Error('the database is busy');
      },
    };
    const cleanup = createFakeCleanup();

    await expect(
      createCredentialCopies(source, cleanup).copy(request('identifier')),
    ).resolves.toEqual({ ok: false, code: 'storage-error' });
    expect(cleanup.copied).toEqual([]);
  });

  it('answers with the outcome alone, never the copied value', async () => {
    const source = createFakeSource();
    const cleanup = createFakeCleanup();
    cleanup.refuse = true;

    const failure = await createCredentialCopies(source, cleanup).copy(request('password'));
    const success = await createCredentialCopies(createFakeSource(), createFakeCleanup()).copy(
      request('password'),
    );

    expect(Object.keys(failure)).toEqual(['ok', 'code']);
    expect(JSON.stringify(failure)).not.toContain(FICTIONAL_PASSWORD);
    expect(JSON.stringify(success)).not.toContain(FICTIONAL_PASSWORD);
  });

  it('takes the field from the validated request rather than the record', async () => {
    const source: CredentialCopySource = {
      findById: (id: string) => summaryFor(id),
      findSecretById: (id: string) => ({ id, password: FICTIONAL_PASSWORD }),
    };
    const cleanup = createFakeCleanup();
    const copies = createCredentialCopies(source, cleanup);

    await copies.copy({ id: 'row-1', field: 'identifier' });
    await copies.copy({ id: 'row-1', field: 'password' });

    expect(cleanup.copied).toEqual([FICTIONAL_IDENTIFIER, FICTIONAL_PASSWORD]);
  });
});
