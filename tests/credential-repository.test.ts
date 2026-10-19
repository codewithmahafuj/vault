import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createCredentialRepository } from '../src/main/database/credential-repository';
import type { CredentialInput } from '../src/shared/credential';
import { applyMigrations } from '../src/main/database/migrations';
import { generateDataKey } from '../src/main/security/data-key';
import { ENCRYPTED_FIELD_HEADER_BYTE_LENGTH } from '../src/main/security/field-crypto';

const MAIL_PASSWORD = 'fictional-mail-password';
const NOTES = 'Recovery codes are printed on a card in the drawer.';

const mailAccount: CredentialInput = {
  service: 'Fictional Mail',
  identifier: 'ada@example.com',
  password: MAIL_PASSWORD,
  notes: NOTES,
  favorite: false,
};

const databases: Database.Database[] = [];

function repository() {
  const db = new Database(':memory:');
  databases.push(db);
  applyMigrations(db);
  const dataKey = generateDataKey();
  return { db, dataKey, credentials: createCredentialRepository(db, dataKey) };
}

afterEach(() => {
  for (const db of databases.splice(0)) {
    if (db.open) {
      db.close();
    }
  }
});

describe('credential repository create and read', () => {
  it('returns the values it stored, with timestamps', () => {
    const { credentials } = repository();

    const created = credentials.create(mailAccount);

    expect(created.identifier).toBe('ada@example.com');
    expect(created.service).toBe('Fictional Mail');
    expect(created.notes).toBe(NOTES);
    expect(created.favorite).toBe(false);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(created.createdAt)).not.toBeNaN();
    expect(created.updatedAt).toBe(created.createdAt);
  });

  it('reads the record back from the database', () => {
    const { credentials } = repository();
    const created = credentials.create(mailAccount);

    expect(credentials.findById(created.id)).toEqual(created);
    expect(credentials.list()).toEqual([created]);
  });

  it('keeps absent notes as null and an empty note as an empty string', () => {
    const { credentials } = repository();

    const withoutNotes = credentials.create({ ...mailAccount, notes: null });
    const withEmptyNotes = credentials.create({ ...mailAccount, notes: '' });

    expect(credentials.findById(withoutNotes.id)?.notes).toBeNull();
    expect(credentials.findById(withEmptyNotes.id)?.notes).toBe('');
  });

  it('round-trips unicode service names, identifiers, and notes', () => {
    const { credentials } = repository();
    const input: CredentialInput = {
      service: ' fictional ☕ Café 名前 ',
      identifier: '用户名的例子',
      password: 'fictional-pass-🔐-口令',
      notes: 'にほんご 📝 note',
      favorite: true,
    };

    const created = credentials.create(input);
    const stored = credentials.findById(created.id);

    expect(stored?.service).toBe(input.service);
    expect(stored?.identifier).toBe(input.identifier);
    expect(stored?.notes).toBe(input.notes);
    expect(stored?.favorite).toBe(true);
    expect(credentials.findSecretById(created.id)?.password).toBe(input.password);
  });

  it('lists every stored credential in insertion order', () => {
    const { credentials } = repository();
    credentials.create(mailAccount);
    credentials.create({
      ...mailAccount,
      service: 'Other Fictional Service',
      identifier: 'zoe@example.com',
    });

    expect(credentials.list().map((record) => record.service)).toEqual([
      'Fictional Mail',
      'Other Fictional Service',
    ]);
  });

  it('returns undefined for an id that is not stored', () => {
    const { credentials } = repository();

    expect(credentials.findById('missing-id')).toBeUndefined();
    expect(credentials.findSecretById('missing-id')).toBeUndefined();
  });
});

describe('credential repository password handling', () => {
  it('never puts the password in a summary', () => {
    const { credentials } = repository();
    const created = credentials.create(mailAccount);

    expect('password' in created).toBe(false);
    expect(JSON.stringify(credentials.list())).not.toContain(MAIL_PASSWORD);
    expect(credentials.findById(created.id)).not.toHaveProperty('password');
  });

  it('returns only the id and password through the secret lookup', () => {
    const { credentials } = repository();
    const created = credentials.create(mailAccount);

    expect(credentials.findSecretById(created.id)).toEqual({
      id: created.id,
      password: MAIL_PASSWORD,
    });
  });

  it('stores every sensitive field as an authenticated blob that hides its value', () => {
    const { db, credentials } = repository();
    credentials.create(mailAccount);

    const row = db
      .prepare<
        [],
        {
          service_encrypted: Buffer;
          identifier_encrypted: Buffer;
          password_encrypted: Buffer;
          notes_encrypted: Buffer;
        }
      >(
        `select service_encrypted, identifier_encrypted, password_encrypted, notes_encrypted
           from credentials`,
      )
      .get();
    if (row === undefined) {
      throw new Error('the credential row was never written');
    }

    const secrets = [mailAccount.service, mailAccount.identifier, MAIL_PASSWORD, NOTES];
    for (const blob of [
      row.service_encrypted,
      row.identifier_encrypted,
      row.password_encrypted,
      row.notes_encrypted,
    ]) {
      expect(blob.byteLength).toBeGreaterThanOrEqual(ENCRYPTED_FIELD_HEADER_BYTE_LENGTH);
      for (const secret of secrets) {
        expect(blob.includes(Buffer.from(secret, 'utf8'))).toBe(false);
      }
    }
  });

  it('encrypts each field separately, so no two blobs repeat a value', () => {
    const { credentials } = repository();
    const first = credentials.create(mailAccount);
    const second = credentials.create(mailAccount);

    expect(first.id).not.toBe(second.id);
    expect(credentials.list()).toHaveLength(2);
  });
});

describe('credential repository update and delete', () => {
  it('replaces the stored fields and keeps the creation timestamp', () => {
    const { credentials } = repository();
    const created = credentials.create(mailAccount);

    const updated = credentials.update(created.id, {
      service: 'Fictional Mail',
      identifier: 'ada@example.com',
      password: 'fictional-rotated-password',
      notes: null,
      favorite: true,
    });

    expect(updated).toBeDefined();
    expect(updated?.createdAt).toBe(created.createdAt);
    expect(updated?.notes).toBeNull();
    expect(updated?.favorite).toBe(true);
    expect(credentials.findById(created.id)).toEqual(updated);
    expect(credentials.findSecretById(created.id)?.password).toBe('fictional-rotated-password');
  });

  it('returns undefined and changes nothing when the id is unknown', () => {
    const { credentials } = repository();
    credentials.create(mailAccount);

    const updated = credentials.update('missing-id', { ...mailAccount, service: 'Renamed' });

    expect(updated).toBeUndefined();
    expect(credentials.list()[0]?.service).toBe('Fictional Mail');
  });

  it('reports whether a delete removed a row', () => {
    const { credentials } = repository();
    const created = credentials.create(mailAccount);

    expect(credentials.delete(created.id)).toBe(true);
    expect(credentials.delete(created.id)).toBe(false);
    expect(credentials.list()).toEqual([]);
  });
});

describe('credential repository favorite toggle', () => {
  it('flips the flag and leaves every encrypted column byte-identical', () => {
    const { db, credentials } = repository();
    const created = credentials.create(mailAccount);

    // A favorite write must not re-encrypt anything: the star is the only value
    // it changes, and rewriting a secret to store a non-secret would be a
    // gratuitous nonce and a needless chance to lose the record.
    const ciphertext = (): (string | null)[] =>
      Object.values(
        db
          .prepare<[string], Record<string, Buffer | null>>(
            `select service_encrypted, identifier_encrypted, password_encrypted, notes_encrypted
               from credentials where id = ?`,
          )
          .get(created.id) ?? {},
      ).map((blob) => (blob instanceof Buffer ? blob.toString('hex') : null));

    const before = ciphertext();

    const updated = credentials.setFavorite(created.id, true);

    expect(updated?.id).toBe(created.id);
    expect(updated?.favorite).toBe(true);
    expect(updated?.service).toBe(mailAccount.service);
    expect(updated?.identifier).toBe(mailAccount.identifier);
    expect(updated?.notes).toBe(NOTES);
    expect(updated?.createdAt).toBe(created.createdAt);
    expect(ciphertext()).toEqual(before);
    expect(credentials.findById(created.id)?.favorite).toBe(true);
    expect(credentials.findSecretById(created.id)?.password).toBe(MAIL_PASSWORD);
  });

  it('writes the flag back to false', () => {
    const { credentials } = repository();
    const created = credentials.create({ ...mailAccount, favorite: true });

    const updated = credentials.setFavorite(created.id, false);

    expect(updated?.favorite).toBe(false);
    expect(credentials.findById(created.id)?.favorite).toBe(false);
  });

  it('returns undefined and changes nothing when the favorite id is unknown', () => {
    const { credentials } = repository();
    credentials.create(mailAccount);

    expect(credentials.setFavorite('missing-id', true)).toBeUndefined();
    expect(credentials.list()[0]?.favorite).toBe(false);
  });
});
