import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { CredentialInput, CredentialSecret, CredentialSummary } from '../../shared/credential';
import { decryptField, encryptField } from '../security/field-crypto';

export interface CredentialRepository {
  list(): CredentialSummary[];
  findById(id: string): CredentialSummary | undefined;
  findSecretById(id: string): CredentialSecret | undefined;
  create(input: CredentialInput): CredentialSummary;
  update(id: string, input: CredentialInput): CredentialSummary | undefined;
  setFavorite(id: string, favorite: boolean): CredentialSummary | undefined;
  delete(id: string): boolean;
}

interface CredentialRow {
  readonly id: string;
  readonly service_encrypted: Buffer;
  readonly identifier_encrypted: Buffer;
  readonly password_encrypted: Buffer;
  readonly notes_encrypted: Buffer | null;
  readonly favorite: number;
  readonly created_at: string;
  readonly updated_at: string;
}

// Listed explicitly rather than `select *` so a column added by a later
// migration cannot silently change the row shape this module maps.
const COLUMNS = `id, service_encrypted, identifier_encrypted, password_encrypted,
  notes_encrypted, favorite, created_at, updated_at`;

type InsertBinding = [
  id: string,
  service: Buffer,
  identifier: Buffer,
  password: Buffer,
  notes: Buffer | null,
  favorite: number,
  createdAt: string,
  updatedAt: string,
];

type UpdateBinding = [
  service: Buffer,
  identifier: Buffer,
  password: Buffer,
  notes: Buffer | null,
  favorite: number,
  updatedAt: string,
  id: string,
];

interface StorableFields {
  readonly service: Buffer;
  readonly identifier: Buffer;
  readonly password: Buffer;
  readonly notes: Buffer | null;
  readonly favorite: number;
}

function encryptInput(input: CredentialInput, dataKey: Buffer): StorableFields {
  return {
    service: encryptField(input.service, dataKey),
    identifier: encryptField(input.identifier, dataKey),
    password: encryptField(input.password, dataKey),
    notes: input.notes === null ? null : encryptField(input.notes, dataKey),
    favorite: input.favorite ? 1 : 0,
  };
}

// Summaries are built from the caller's own values instead of being re-read
// from the database: that keeps the password inside this module, and since the
// statement runs first, returning a summary already means the write succeeded.
function summarize(
  id: string,
  input: CredentialInput,
  createdAt: string,
  updatedAt: string,
): CredentialSummary {
  return {
    id,
    service: input.service,
    identifier: input.identifier,
    notes: input.notes,
    favorite: input.favorite,
    createdAt,
    updatedAt,
  };
}

export function createCredentialRepository(
  db: Database.Database,
  dataKey: Buffer,
): CredentialRepository {
  const selectAll = db.prepare<[], CredentialRow>(
    `select ${COLUMNS} from credentials order by rowid`,
  );
  const selectById = db.prepare<[string], CredentialRow>(
    `select ${COLUMNS} from credentials where id = ?`,
  );
  const selectSecretById = db.prepare<[string], { password_encrypted: Buffer }>(
    'select password_encrypted from credentials where id = ?',
  );
  const insertStatement = db.prepare<InsertBinding>(
    `insert into credentials (
        id, service_encrypted, identifier_encrypted, password_encrypted,
        notes_encrypted, favorite, created_at, updated_at
      )
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateStatement = db.prepare<UpdateBinding>(
    `update credentials
        set service_encrypted = ?, identifier_encrypted = ?, password_encrypted = ?,
            notes_encrypted = ?, favorite = ?, updated_at = ?
      where id = ?`,
  );
  const deleteStatement = db.prepare<[string]>('delete from credentials where id = ?');
  // The favorite channel writes the readable flag and the timestamp only.
  const setFavoriteStatement = db.prepare<[number, string, string]>(
    `update credentials
        set favorite = ?, updated_at = ?
      where id = ?`,
  );

  function toSummary(row: CredentialRow): CredentialSummary {
    return {
      id: row.id,
      service: decryptField(row.service_encrypted, dataKey),
      identifier: decryptField(row.identifier_encrypted, dataKey),
      notes: row.notes_encrypted === null ? null : decryptField(row.notes_encrypted, dataKey),
      favorite: row.favorite === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  return {
    list(): CredentialSummary[] {
      return selectAll.all().map(toSummary);
    },

    findById(id: string): CredentialSummary | undefined {
      const row = selectById.get(id);
      return row === undefined ? undefined : toSummary(row);
    },

    findSecretById(id: string): CredentialSecret | undefined {
      const row = selectSecretById.get(id);
      if (row === undefined) {
        return undefined;
      }
      return { id, password: decryptField(row.password_encrypted, dataKey) };
    },

    create(input: CredentialInput): CredentialSummary {
      const id = randomUUID();
      const timestamp = new Date().toISOString();
      const fields = encryptInput(input, dataKey);

      insertStatement.run(
        id,
        fields.service,
        fields.identifier,
        fields.password,
        fields.notes,
        fields.favorite,
        timestamp,
        timestamp,
      );

      return summarize(id, input, timestamp, timestamp);
    },

    update(id: string, input: CredentialInput): CredentialSummary | undefined {
      const existing = selectById.get(id);
      if (existing === undefined) {
        return undefined;
      }

      const updatedAt = new Date().toISOString();
      const fields = encryptInput(input, dataKey);

      updateStatement.run(
        fields.service,
        fields.identifier,
        fields.password,
        fields.notes,
        fields.favorite,
        updatedAt,
        id,
      );

      return summarize(id, input, existing.created_at, updatedAt);
    },

    // Built from the row already read, with the new flag and timestamp applied:
    // the four encrypted columns are untouched, so toggling a favorite cannot
    // rewrite a secret to store a value that is not one.
    setFavorite(id: string, favorite: boolean): CredentialSummary | undefined {
      const existing = selectById.get(id);
      if (existing === undefined) {
        return undefined;
      }

      const updatedAt = new Date().toISOString();
      setFavoriteStatement.run(favorite ? 1 : 0, updatedAt, id);

      return { ...toSummary(existing), favorite, updatedAt };
    },

    delete(id: string): boolean {
      return deleteStatement.run(id).changes > 0;
    },
  };
}
