import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CredentialInput, CredentialSummary } from '../src/shared/credential';
import { applyMigrations } from '../src/main/database/migrations';
import { createCredentialRepository } from '../src/main/database/credential-repository';
import type { CredentialRepository } from '../src/main/database/credential-repository';
import { generateDataKey } from '../src/main/security/data-key';
import { FieldIntegrityError } from '../src/main/security/errors';
import { createCredentialService } from '../src/main/credential-service';
import type { CredentialService } from '../src/main/credential-service';

interface StoredRecord {
  readonly id: string;
  readonly input: CredentialInput;
  readonly createdAt: string;
}

const fictionalBank: CredentialInput = {
  service: 'Fictional Bank',
  identifier: 'ada@example.com',
  password: 'first-password',
  notes: null,
  favorite: false,
};

const zebraMail: CredentialInput = {
  service: 'Zebra Mail',
  identifier: 'ada@example.com',
  password: 'second-password',
  notes: 'old notes',
  favorite: true,
};

const candidate: CredentialInput = {
  service: 'New Service',
  identifier: 'grace@example.com',
  password: 'new-password',
  notes: '',
  favorite: false,
};

function summary(record: StoredRecord): CredentialSummary {
  return {
    id: record.id,
    service: record.input.service,
    identifier: record.input.identifier,
    notes: record.input.notes,
    favorite: record.input.favorite,
    createdAt: record.createdAt,
    updatedAt: record.createdAt,
  };
}

// A stand-in repository with just enough behavior for the rules that live in
// the service: identity collision, ordering, and unknown ids. The caller's
// array is stored by reference so a test can inspect what was written.
function createFakeRepository(records: StoredRecord[] = []): CredentialRepository {
  let nextRow = 1;

  return {
    list(): CredentialSummary[] {
      return records.map(summary);
    },
    findById(id: string): CredentialSummary | undefined {
      const found = records.find((record) => record.id === id);
      return found === undefined ? undefined : summary(found);
    },
    findSecretById(id: string) {
      const found = records.find((record) => record.id === id);
      return found === undefined ? undefined : { id, password: found.input.password };
    },
    create(input: CredentialInput): CredentialSummary {
      const record: StoredRecord = {
        id: `row-${nextRow}`,
        input,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      nextRow += 1;
      records.push(record);
      return summary(record);
    },
    update(id: string, input: CredentialInput): CredentialSummary | undefined {
      const index = records.findIndex((record) => record.id === id);
      const existing = records[index];
      if (existing === undefined) {
        return undefined;
      }
      const updated: StoredRecord = { ...existing, input };
      records[index] = updated;
      return summary(updated);
    },
    setFavorite(id: string, favorite: boolean): CredentialSummary | undefined {
      const index = records.findIndex((record) => record.id === id);
      const existing = records[index];
      if (existing === undefined) {
        return undefined;
      }
      const updated: StoredRecord = { ...existing, input: { ...existing.input, favorite } };
      records[index] = updated;
      return summary(updated);
    },
    delete(id: string): boolean {
      const index = records.findIndex((record) => record.id === id);
      if (index === -1) {
        return false;
      }
      records.splice(index, 1);
      return true;
    },
  };
}

function createFakeStore(): CredentialRepository & {
  records: StoredRecord[];
} {
  const records: StoredRecord[] = [
    { id: 'row-1', input: fictionalBank, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'row-2', input: zebraMail, createdAt: '2026-01-02T00:00:00.000Z' },
  ];
  return Object.assign(createFakeRepository(records), { records });
}

function storedInput(records: readonly StoredRecord[], id: string): CredentialInput | undefined {
  return records.find((record) => record.id === id)?.input;
}

const openDatabases: Database.Database[] = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) {
    if (db.open) {
      db.close();
    }
  }
  vi.restoreAllMocks();
});

describe('createCredentialService', () => {
  it('lists credentials sorted by service then identifier', () => {
    const service = createCredentialService(createFakeStore());

    const result = service.list();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.map((record) => record.service)).toEqual(['Fictional Bank', 'Zebra Mail']);
  });

  it('never puts a password in a list or create result', () => {
    const service = createCredentialService(createFakeStore());

    for (const result of [service.list(), service.create(candidate)]) {
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      const serialized = JSON.stringify(
        Array.isArray(result.value) ? result.value : [result.value],
      );
      for (const password of [
        fictionalBank.password,
        zebraMail.password,
        candidate.password,
        'rotated-password',
      ]) {
        expect(serialized.includes(password)).toBe(false);
      }
    }
  });

  it('rejects a duplicate identity using the shared normalization rules', () => {
    const repository = createFakeStore();
    const service = createCredentialService(repository);

    const result = service.create({
      ...candidate,
      service: '  fictional   BANK ',
      identifier: 'ADA@example.com ',
    });

    expect(result).toEqual({ ok: false, code: 'duplicate-credential' });
    expect(repository.records).toHaveLength(2);
  });

  it('lets one identifier exist under two services', () => {
    const repository = createFakeStore();
    const service = createCredentialService(repository);

    const result = service.create({ ...candidate, identifier: zebraMail.identifier });

    expect(result.ok).toBe(true);
    expect(repository.records).toHaveLength(3);
  });

  it('reports not-found when an edit targets an unknown id', () => {
    const repository = createFakeStore();
    const service = createCredentialService(repository);

    expect(service.update('row-9', candidate)).toEqual({ ok: false, code: 'not-found' });
    expect(repository.records).toHaveLength(2);
  });

  it('does not treat the record being edited as its own duplicate', () => {
    const repository = createFakeStore();
    const service = createCredentialService(repository);

    const result = service.update('row-1', { ...fictionalBank, password: 'rotated-password' });

    expect(result.ok).toBe(true);
    expect(storedInput(repository.records, 'row-1')?.password).toBe('rotated-password');
  });

  it('rejects an edit that collides with a different record', () => {
    const repository = createFakeStore();
    const service = createCredentialService(repository);

    const result = service.update('row-1', {
      ...candidate,
      service: zebraMail.service,
      identifier: zebraMail.identifier,
    });

    expect(result).toEqual({ ok: false, code: 'duplicate-credential' });
    expect(storedInput(repository.records, 'row-1')).toEqual(fictionalBank);
  });

  it('reports not-found when a row disappears between the check and the write', () => {
    const repository = createFakeStore();
    repository.update = () => undefined;
    const service = createCredentialService(repository);

    expect(service.update('row-1', candidate)).toEqual({ ok: false, code: 'not-found' });
  });

  it('reports not-found for an unknown delete and succeeds only once', () => {
    const repository = createFakeStore();
    const service = createCredentialService(repository);

    expect(service.remove('row-9')).toEqual({ ok: false, code: 'not-found' });
    expect(service.remove('row-1')).toEqual({ ok: true, value: null });
    expect(service.remove('row-1')).toEqual({ ok: false, code: 'not-found' });
  });

  it('reads one secret by id, and only by id', () => {
    const service = createCredentialService(createFakeStore());

    expect(service.readSecret('row-1')).toEqual({
      ok: true,
      value: { id: 'row-1', password: 'first-password' },
    });
    expect(service.readSecret('row-9')).toEqual({ ok: false, code: 'not-found' });
  });

  it('flips a favorite and answers with the updated summary, password-free', () => {
    const repository = createFakeStore();
    const service = createCredentialService(repository);

    const result = service.setFavorite('row-1', true);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.id).toBe('row-1');
    expect(result.value.favorite).toBe(true);
    expect('password' in result.value).toBe(false);
    expect(JSON.stringify(result)).not.toContain('first-password');
    expect(storedInput(repository.records, 'row-1')).toEqual({ ...fictionalBank, favorite: true });
    const listed = service.list();
    expect(listed.ok && listed.value.find((r) => r.id === 'row-1')?.favorite).toBe(true);
  });

  it('reports not-found for a favorite write on an unknown id', () => {
    const repository = createFakeStore();
    const service = createCredentialService(repository);

    expect(service.setFavorite('row-9', true)).toEqual({ ok: false, code: 'not-found' });
    expect(storedInput(repository.records, 'row-1')).toEqual(fictionalBank);
  });

  it('skips the duplicate re-check on a favorite toggle, which cannot change identity', () => {
    const repository = createFakeStore();
    // The duplicate rule reads the whole list; a toggle that never touches
    // service or identifier has no reason to walk it.
    repository.list = () => {
      throw new Error('a favorite write must not run a duplicate check');
    };
    const service = createCredentialService(repository);

    expect(service.setFavorite('row-1', true).ok).toBe(true);
  });

  it.each([
    ['list', (service: CredentialService) => service.list()],
    ['create', (service: CredentialService) => service.create(candidate)],
    ['update', (service: CredentialService) => service.update('row-1', candidate)],
    ['delete', (service: CredentialService) => service.remove('row-1')],
    ['read-secret', (service: CredentialService) => service.readSecret('row-1')],
    ['set-favorite', (service: CredentialService) => service.setFavorite('row-1', true)],
  ])('maps a %s failure to a fixed code without leaking details', (_name, run) => {
    const failure = new Error('E:\\user-data\\vault.db SQLITE_CONSTRAINT credentials.foo=bar');
    failure.name = 'SqliteError';
    const repository = createFakeStore();
    repository.list = () => {
      throw failure;
    };
    repository.findById = () => {
      throw failure;
    };
    repository.delete = () => {
      throw failure;
    };
    repository.findSecretById = () => {
      throw failure;
    };
    repository.setFavorite = () => {
      throw failure;
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createCredentialService(repository);

    expect(run(service)).toEqual({ ok: false, code: 'storage-error' });

    expect(logged).toHaveBeenCalledTimes(1);
    const message = logged.mock.calls[0]?.join(' ') ?? '';
    expect(message).not.toContain('vault.db');
    expect(message).not.toContain('SQLITE_CONSTRAINT');
    expect(message).toContain('SqliteError');
  });

  it('maps an authenticated-field failure to the same fixed code', () => {
    const repository = createFakeStore();
    repository.list = () => {
      throw new FieldIntegrityError();
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = createCredentialService(repository);

    expect(service.list()).toEqual({ ok: false, code: 'storage-error' });
  });
});

describe('createCredentialService over the encrypted repository', () => {
  function realService(): {
    service: CredentialService;
    repository: CredentialRepository;
    db: Database.Database;
  } {
    const db = new Database(':memory:');
    openDatabases.push(db);
    applyMigrations(db);

    const repository = createCredentialRepository(db, generateDataKey());
    return { service: createCredentialService(repository), repository, db };
  }

  it('stores, lists, edits, and removes a record through real encryption', () => {
    const { service, repository } = realService();

    const created = service.create(candidate);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.value.id).toHaveLength(36);

    const listed = service.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      return;
    }
    expect(listed.value).toEqual([created.value]);

    // The password reaches the renderer only through read-secret, and only for
    // the id asked about.
    expect(service.readSecret(created.value.id)).toEqual({
      ok: true,
      value: { id: created.value.id, password: candidate.password },
    });

    const edited = service.update(created.value.id, { ...candidate, favorite: true });
    expect(edited.ok).toBe(true);
    if (!edited.ok) {
      return;
    }
    expect(edited.value).toEqual({
      ...created.value,
      favorite: true,
      updatedAt: expect.any(String),
    });
    expect(edited.value.createdAt).toBe(created.value.createdAt);

    expect(service.create({ ...candidate, notes: 'duplicate attempt' })).toEqual({
      ok: false,
      code: 'duplicate-credential',
    });

    expect(service.remove(created.value.id)).toEqual({ ok: true, value: null });
    expect(repository.list()).toEqual([]);
    expect(service.readSecret(created.value.id)).toEqual({ ok: false, code: 'not-found' });
  });

  it('toggles a favorite through real encryption without disturbing the stored secret', () => {
    const { service } = realService();

    const created = service.create(candidate);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const toggled = service.setFavorite(created.value.id, true);
    expect(toggled.ok).toBe(true);
    if (!toggled.ok) {
      return;
    }
    expect(toggled.value).toEqual({
      ...created.value,
      favorite: true,
      updatedAt: expect.any(String),
    });
    expect(toggled.value.createdAt).toBe(created.value.createdAt);

    // The password was written once, at create. A star click must still read it
    // back exactly, which is what a narrow favorite write guarantees.
    expect(service.readSecret(created.value.id)).toEqual({
      ok: true,
      value: { id: created.value.id, password: candidate.password },
    });

    const unmarked = service.setFavorite(created.value.id, false);
    expect(unmarked.ok && unmarked.value.favorite).toBe(false);
    expect(service.setFavorite('3f2504e0-4f89-11d3-9a0c-0305e82c3301', true)).toEqual({
      ok: false,
      code: 'not-found',
    });
  });

  it('fails closed on a tampered password blob instead of returning partial text', () => {
    const { service, db } = realService();

    const created = service.create(candidate);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const id = created.value.id;

    // Corrupt one byte of the ciphertext, after the version, nonce and auth tag.
    const select = db.prepare<[string], { password_encrypted: Buffer }>(
      'select password_encrypted from credentials where id = ?',
    );
    const row = select.get(id);
    expect(row).toBeDefined();
    const blob = Buffer.from((row?.password_encrypted ?? Buffer.alloc(0)).subarray(0));
    const last = blob.length - 1;
    if (last >= 0) {
      blob[last] = (blob[last] as number) ^ 0xff;
    }
    db.prepare<[Buffer, string]>('update credentials set password_encrypted = ? where id = ?').run(
      blob,
      id,
    );

    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = service.readSecret(id);

    expect(result).toEqual({ ok: false, code: 'storage-error' });
    expect(JSON.stringify(result)).not.toContain(candidate.password);
  });
});
