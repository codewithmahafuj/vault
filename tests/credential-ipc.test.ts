import { describe, expect, it } from 'vitest';
import type {
  CredentialCopyRequest,
  CredentialInput,
  CredentialSecret,
  CredentialSummary,
} from '../src/shared/credential';
import { VAULT_CHANNELS } from '../src/shared/ipc-channels';
import { succeeded } from '../src/shared/vault-result';
import type { VaultResult } from '../src/shared/vault-result';
import type { CredentialCopies } from '../src/main/clipboard/credential-copies';
import { createCredentialService } from '../src/main/credential-service';
import type { CredentialService } from '../src/main/credential-service';
import { registerCredentialIpc } from '../src/main/ipc/credential-ipc';
import type { IpcRegistrar } from '../src/main/ipc/credential-ipc';

type Listener = (event: unknown, payload: unknown) => unknown;

const input: CredentialInput = {
  service: 'Fictional Bank',
  identifier: 'ada@example.com',
  password: 'fictional-bank-password',
  notes: null,
  favorite: false,
};

function summaryFor(id: string, values: CredentialInput): CredentialSummary {
  return {
    id,
    service: values.service,
    identifier: values.identifier,
    notes: values.notes,
    favorite: values.favorite,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

interface FakeRegistrar extends IpcRegistrar {
  readonly listeners: Map<string, Listener>;
  invoke(channel: string, payload?: unknown): unknown;
}

function createFakeRegistrar(): FakeRegistrar {
  const listeners = new Map<string, Listener>();
  return {
    listeners,
    handle(channel, listener) {
      listeners.set(channel, listener);
    },
    invoke(channel, payload) {
      return listeners.get(channel)?.({}, payload);
    },
  };
}

interface FakeCredentialService extends CredentialService {
  readonly calls: string[];
}

function createFakeService(
  responses: Partial<
    Record<
      'list' | 'create' | 'update' | 'remove' | 'readSecret' | 'setFavorite',
      VaultResult<never>
    >
  > = {},
): FakeCredentialService {
  const calls: string[] = [];

  return {
    calls,
    list(): VaultResult<CredentialSummary[]> {
      calls.push('list');
      return responses.list ?? succeeded([]);
    },
    create(values: CredentialInput): VaultResult<CredentialSummary> {
      calls.push(`create:${values.service}`);
      return responses.create ?? succeeded(summaryFor('row-1', values));
    },
    update(id: string, values: CredentialInput): VaultResult<CredentialSummary> {
      calls.push(`update:${id}`);
      return responses.update ?? succeeded(summaryFor(id, values));
    },
    remove(id: string): VaultResult<null> {
      calls.push(`remove:${id}`);
      return responses.remove ?? succeeded(null);
    },
    readSecret(id: string): VaultResult<CredentialSecret> {
      calls.push(`readSecret:${id}`);
      return responses.readSecret ?? succeeded({ id, password: 'fictional-bank-password' });
    },
    setFavorite(id: string, favorite: boolean): VaultResult<CredentialSummary> {
      calls.push(`setFavorite:${id}:${String(favorite)}`);
      return responses.setFavorite ?? succeeded(summaryFor(id, { ...input, favorite }));
    },
  };
}

interface FakeCredentialCopies extends CredentialCopies {
  readonly requests: string[];
  response: VaultResult<null>;
}

function createFakeCopies(): FakeCredentialCopies {
  const requests: string[] = [];
  return {
    requests,
    response: succeeded(null),
    copy(request: CredentialCopyRequest): Promise<VaultResult<null>> {
      requests.push(`${request.id}:${request.field}`);
      return Promise.resolve(this.response);
    },
  };
}

describe('registerCredentialIpc', () => {
  it('registers exactly the seven approved channels', () => {
    const registrar = createFakeRegistrar();

    registerCredentialIpc(registrar, createFakeService(), createFakeCopies());

    expect([...registrar.listeners.keys()].sort()).toEqual(Object.values(VAULT_CHANNELS).sort());
    expect(Object.values(VAULT_CHANNELS)).toEqual([
      'credentials:list',
      'credentials:create',
      'credentials:update',
      'credentials:delete',
      'credentials:read-secret',
      'credentials:set-favorite',
      'credentials:copy',
    ]);
  });

  it('answers the list channel from the service', () => {
    const registrar = createFakeRegistrar();
    const service = createFakeService();
    registerCredentialIpc(registrar, service, createFakeCopies());

    expect(registrar.invoke(VAULT_CHANNELS.credentialsList)).toEqual({ ok: true, value: [] });
    expect(service.calls).toEqual(['list']);
  });

  it('passes a valid create payload to the service', () => {
    const registrar = createFakeRegistrar();
    const service = createFakeService();
    registerCredentialIpc(registrar, service, createFakeCopies());

    const result = registrar.invoke(VAULT_CHANNELS.credentialsCreate, input);

    expect(result).toEqual({ ok: true, value: summaryFor('row-1', input) });
    expect(service.calls).toEqual(['create:Fictional Bank']);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'Fictional Bank'],
    ['an array', [input]],
    [
      'a missing password',
      { service: input.service, identifier: input.identifier, notes: null, favorite: false },
    ],
    ['a blank identifier', { ...input, identifier: '  ' }],
    ['a non-boolean favorite', { ...input, favorite: 'false' }],
    ['a notes object', { ...input, notes: { secret: 1 } }],
  ])('rejects a create payload that is %s without calling the service', (_name, payload) => {
    const registrar = createFakeRegistrar();
    const service = createFakeService();
    registerCredentialIpc(registrar, service, createFakeCopies());

    expect(registrar.invoke(VAULT_CHANNELS.credentialsCreate, payload)).toEqual({
      ok: false,
      code: 'invalid-credential',
    });
    expect(service.calls).toEqual([]);
  });

  it('splits a flat update payload into the id and its replacement values', () => {
    const registrar = createFakeRegistrar();
    const service = createFakeService();
    registerCredentialIpc(registrar, service, createFakeCopies());

    const result = registrar.invoke(VAULT_CHANNELS.credentialsUpdate, { id: 'row-7', ...input });

    expect(result).toEqual({ ok: true, value: summaryFor('row-7', input) });
    expect(service.calls).toEqual(['update:row-7']);
  });

  it.each([
    ['no id at all', { ...input }],
    ['a blank id', { id: '   ', ...input }],
    ['a numeric id', { id: 7, ...input }],
    ['an over-long id', { id: 'x'.repeat(65), ...input }],
    ['an invalid password', { id: 'row-7', ...input, password: '' }],
  ])('rejects an update payload with %s without calling the service', (_name, payload) => {
    const registrar = createFakeRegistrar();
    const service = createFakeService();
    registerCredentialIpc(registrar, service, createFakeCopies());

    expect(registrar.invoke(VAULT_CHANNELS.credentialsUpdate, payload)).toEqual({
      ok: false,
      code: 'invalid-credential',
    });
    expect(service.calls).toEqual([]);
  });

  it('accepts a bare id on the delete channel', () => {
    const registrar = createFakeRegistrar();
    const service = createFakeService();
    registerCredentialIpc(registrar, service, createFakeCopies());

    expect(registrar.invoke(VAULT_CHANNELS.credentialsDelete, 'row-7')).toEqual({
      ok: true,
      value: null,
    });
    expect(service.calls).toEqual(['remove:row-7']);
  });

  it.each([
    ['null', null],
    ['an empty string', ''],
    ['an object shaped like an id', { id: 'row-7' }],
    ['a number', 7],
  ])('rejects a delete payload of %s without calling the service', (_name, payload) => {
    const registrar = createFakeRegistrar();
    const service = createFakeService();
    registerCredentialIpc(registrar, service, createFakeCopies());

    expect(registrar.invoke(VAULT_CHANNELS.credentialsDelete, payload)).toEqual({
      ok: false,
      code: 'invalid-credential',
    });
    expect(service.calls).toEqual([]);
  });

  it('accepts a bare id on the read-secret channel and returns only id + password', () => {
    const registrar = createFakeRegistrar();
    const service = createFakeService();
    registerCredentialIpc(registrar, service, createFakeCopies());

    expect(registrar.invoke(VAULT_CHANNELS.credentialsReadSecret, 'row-7')).toEqual({
      ok: true,
      value: { id: 'row-7', password: 'fictional-bank-password' },
    });
    expect(service.calls).toEqual(['readSecret:row-7']);
  });

  it.each([
    ['null', null],
    ['an empty string', ''],
    ['a blank string', '  '],
    ['an object shaped like an id', { id: 'row-7' }],
    ['a number', 7],
    ['an over-long id', 'x'.repeat(65)],
  ])('rejects a read-secret payload of %s without calling the service', (_name, payload) => {
    const registrar = createFakeRegistrar();
    const service = createFakeService();
    registerCredentialIpc(registrar, service, createFakeCopies());

    expect(registrar.invoke(VAULT_CHANNELS.credentialsReadSecret, payload)).toEqual({
      ok: false,
      code: 'invalid-credential',
    });
    expect(service.calls).toEqual([]);
  });

  it('marks and unmarks a favorite on the set-favorite channel', () => {
    const registrar = createFakeRegistrar();
    const service = createFakeService();
    registerCredentialIpc(registrar, service, createFakeCopies());

    expect(
      registrar.invoke(VAULT_CHANNELS.credentialsSetFavorite, { id: 'row-7', favorite: true }),
    ).toEqual({ ok: true, value: summaryFor('row-7', { ...input, favorite: true }) });

    const unmarked = registrar.invoke(VAULT_CHANNELS.credentialsSetFavorite, {
      id: 'row-7',
      favorite: false,
    });
    expect(unmarked).toEqual({
      ok: true,
      value: summaryFor('row-7', { ...input, favorite: false }),
    });
    // The answer is a summary, so the star press cannot pull a password along
    // with it even though the same record is one channel away from one.
    expect(JSON.stringify(unmarked)).not.toContain(input.password);

    expect(service.calls).toEqual(['setFavorite:row-7:true', 'setFavorite:row-7:false']);
  });

  it('drops any field change attached to a favorite payload instead of writing it', () => {
    const registrar = createFakeRegistrar();
    const service = createFakeService();
    registerCredentialIpc(registrar, service, createFakeCopies());

    expect(
      registrar.invoke(VAULT_CHANNELS.credentialsSetFavorite, {
        id: 'row-7',
        favorite: true,
        service: 'Rewritten',
        password: 'injected-password',
      }),
    ).toEqual({ ok: true, value: summaryFor('row-7', { ...input, favorite: true }) });
    expect(service.calls).toEqual(['setFavorite:row-7:true']);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['the bare id', 'row-7'],
    ['an array', ['row-7', true]],
    ['no favorite', { id: 'row-7' }],
    ['a string favorite', { id: 'row-7', favorite: 'true' }],
    ['a numeric favorite', { id: 'row-7', favorite: 1 }],
    ['a null favorite', { id: 'row-7', favorite: null }],
    ['no id', { favorite: true }],
    ['a blank id', { id: '   ', favorite: true }],
    ['a numeric id', { id: 7, favorite: true }],
    ['an over-long id', { id: 'x'.repeat(65), favorite: true }],
  ])('rejects a set-favorite payload of %s without calling the service', (_name, payload) => {
    const registrar = createFakeRegistrar();
    const service = createFakeService();
    registerCredentialIpc(registrar, service, createFakeCopies());

    expect(registrar.invoke(VAULT_CHANNELS.credentialsSetFavorite, payload)).toEqual({
      ok: false,
      code: 'invalid-credential',
    });
    expect(service.calls).toEqual([]);
  });

  it('forwards a service failure unchanged', () => {
    const registrar = createFakeRegistrar();
    const service = createFakeService({ create: { ok: false, code: 'duplicate-credential' } });
    registerCredentialIpc(registrar, service, createFakeCopies());

    expect(registrar.invoke(VAULT_CHANNELS.credentialsCreate, input)).toEqual({
      ok: false,
      code: 'duplicate-credential',
    });
  });

  it('forwards a favorite failure unchanged', () => {
    const registrar = createFakeRegistrar();
    const service = createFakeService({ setFavorite: { ok: false, code: 'storage-error' } });
    registerCredentialIpc(registrar, service, createFakeCopies());

    expect(
      registrar.invoke(VAULT_CHANNELS.credentialsSetFavorite, { id: 'row-7', favorite: true }),
    ).toEqual({ ok: false, code: 'storage-error' });
    expect(service.calls).toEqual(['setFavorite:row-7:true']);
  });

  it('answers with a plain value, never a rejected promise or a thrown error', () => {
    const registrar = createFakeRegistrar();
    registerCredentialIpc(registrar, createFakeService(), createFakeCopies());

    const result = registrar.invoke(VAULT_CHANNELS.credentialsList);

    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toEqual({ ok: true, value: [] });
  });

  it('drives the real service, so its rules are the ones the renderer sees', () => {
    const registrar = createFakeRegistrar();
    registerCredentialIpc(
      registrar,
      createCredentialService({
        list: () => [],
        findById: () => undefined,
        findSecretById: () => undefined,
        create: (values) => summaryFor('row-1', values),
        update: () => undefined,
        setFavorite: () => undefined,
        delete: () => false,
      }),
      createFakeCopies(),
    );

    expect(registrar.invoke(VAULT_CHANNELS.credentialsCreate, input)).toEqual({
      ok: true,
      value: summaryFor('row-1', input),
    });
    expect(registrar.invoke(VAULT_CHANNELS.credentialsUpdate, { id: 'row-9', ...input })).toEqual({
      ok: false,
      code: 'not-found',
    });
    expect(registrar.invoke(VAULT_CHANNELS.credentialsDelete, 'row-9')).toEqual({
      ok: false,
      code: 'not-found',
    });
    expect(registrar.invoke(VAULT_CHANNELS.credentialsReadSecret, 'row-9')).toEqual({
      ok: false,
      code: 'not-found',
    });
    expect(
      registrar.invoke(VAULT_CHANNELS.credentialsSetFavorite, { id: 'row-9', favorite: true }),
    ).toEqual({
      ok: false,
      code: 'not-found',
    });
  });

  it('answers the copy channel from the clipboard collaborator and nothing else', async () => {
    const registrar = createFakeRegistrar();
    const service = createFakeService();
    const copies = createFakeCopies();
    registerCredentialIpc(registrar, service, copies);

    const answer = await registrar.invoke(VAULT_CHANNELS.credentialsCopy, {
      id: 'row-1',
      field: 'password',
    });

    expect(answer).toEqual({ ok: true, value: null });
    expect(copies.requests).toEqual(['row-1:password']);
    // A copy reads the record in the main process, so it is not a storage service
    // call and cannot reach the secret channel on the way.
    expect(service.calls).toEqual([]);
  });

  it('hands the copy collaborator the outcome it reported', async () => {
    const registrar = createFakeRegistrar();
    const copies = createFakeCopies();
    copies.response = { ok: false, code: 'storage-error' };
    registerCredentialIpc(registrar, createFakeService(), copies);

    await expect(
      registrar.invoke(VAULT_CHANNELS.credentialsCopy, { id: 'row-1', field: 'identifier' }),
    ).resolves.toEqual({ ok: false, code: 'storage-error' });
  });

  it('refuses a copy whose field is not one of the two copyable names', async () => {
    const registrar = createFakeRegistrar();
    const copies = createFakeCopies();
    registerCredentialIpc(registrar, createFakeService(), copies);

    for (const field of [
      undefined,
      null,
      '',
      'notes',
      'service',
      'password ',
      'PASSWORD',
      0,
      ['password'],
      { field: 'password' },
    ]) {
      await expect(
        registrar.invoke(VAULT_CHANNELS.credentialsCopy, { id: 'row-1', field }),
      ).resolves.toEqual({ ok: false, code: 'invalid-credential' });
    }
    expect(copies.requests).toEqual([]);
  });

  it('refuses a copy payload that is not a record carrying both fields', async () => {
    const registrar = createFakeRegistrar();
    const copies = createFakeCopies();
    registerCredentialIpc(registrar, createFakeService(), copies);

    for (const payload of [
      undefined,
      null,
      'row-1',
      ['row-1', 'password'],
      { field: 'password' },
      { id: '', field: 'password' },
      { id: 'x'.repeat(65), field: 'password' },
      { id: '   ', field: 'password' },
    ]) {
      await expect(registrar.invoke(VAULT_CHANNELS.credentialsCopy, payload)).resolves.toEqual({
        ok: false,
        code: 'invalid-credential',
      });
    }
    expect(copies.requests).toEqual([]);
  });
});
