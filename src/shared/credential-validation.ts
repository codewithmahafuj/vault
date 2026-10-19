import type { CredentialCopyField, CredentialCopyRequest, CredentialInput } from './credential';

// Approved on 2026-10-11 as the v1 field bounds, and now enforced visibly in the
// Add/Edit form as well as here. They keep a malformed or enormous payload from
// reaching storage while staying above anything a real account is likely to
// need. Length is counted in UTF-16 code units, which is what a `string` reports
// and what the field can hold.
export const CREDENTIAL_FIELD_LIMITS = {
  id: 64,
  service: 60,
  identifier: 120,
  password: 128,
  notes: 1000,
} as const;

export interface CredentialUpdate {
  readonly id: string;
  readonly input: CredentialInput;
}

// The whole payload of the favorite channel: which record, and what its one
// readable flag becomes. Nothing else is accepted, so a favorite press cannot
// smuggle a field change past the update rules.
export interface FavoriteUpdate {
  readonly id: string;
  readonly favorite: boolean;
}

function asRecord(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  // Every field is checked by the guards below, so this only says "indexable".
  return raw as Record<string, unknown>;
}

// A required value must hold something a user can read back. Trimming decides
// emptiness only; the entered text is preserved for display.
function isRequiredText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isNullableText(value: unknown, maxLength: number): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= maxLength);
}

// Only these two names can be asked for on the copy channel. Written as a guard
// rather than a set lookup so the compiler keeps `CredentialCopyField` on the
// narrowed value.
function isCopyableField(value: unknown): value is CredentialCopyField {
  return value === 'identifier' || value === 'password';
}

export function validateCredentialId(raw: unknown): string | undefined {
  return isRequiredText(raw, CREDENTIAL_FIELD_LIMITS.id) ? raw : undefined;
}

export function validateCredentialInput(raw: unknown): CredentialInput | undefined {
  const record = asRecord(raw);
  if (record === undefined) {
    return undefined;
  }

  const { service, identifier, password, notes, favorite } = record;
  if (!isRequiredText(service, CREDENTIAL_FIELD_LIMITS.service)) {
    return undefined;
  }
  if (!isRequiredText(identifier, CREDENTIAL_FIELD_LIMITS.identifier)) {
    return undefined;
  }
  if (!isRequiredText(password, CREDENTIAL_FIELD_LIMITS.password)) {
    return undefined;
  }
  if (!isNullableText(notes, CREDENTIAL_FIELD_LIMITS.notes)) {
    return undefined;
  }
  if (typeof favorite !== 'boolean') {
    return undefined;
  }

  return { service, identifier, password, notes, favorite };
}

export function validateCredentialUpdate(raw: unknown): CredentialUpdate | undefined {
  const record = asRecord(raw);
  if (record === undefined) {
    return undefined;
  }

  const id = validateCredentialId(record['id']);
  const input = validateCredentialInput(record);
  if (id === undefined || input === undefined) {
    return undefined;
  }

  return { id, input };
}

// Shaped like the update gate, but the only field it carries besides the id is
// the flag itself. A missing or non-boolean `favorite` is refused rather than
// guessed at, so a malformed payload cannot silently un-favorite a record.
export function validateFavoriteUpdate(raw: unknown): FavoriteUpdate | undefined {
  const record = asRecord(raw);
  if (record === undefined) {
    return undefined;
  }

  const id = validateCredentialId(record['id']);
  const { favorite } = record;
  if (id === undefined || typeof favorite !== 'boolean') {
    return undefined;
  }

  return { id, favorite };
}

// The copy channel's whole payload. The field is checked against the two names
// that can be copied rather than against `typeof string`, so a payload cannot ask
// the main process for a password under the name of some other column.
export function validateCredentialCopy(raw: unknown): CredentialCopyRequest | undefined {
  const record = asRecord(raw);
  if (record === undefined) {
    return undefined;
  }

  const id = validateCredentialId(record['id']);
  const { field } = record;
  if (id === undefined || !isCopyableField(field)) {
    return undefined;
  }

  return { id, field };
}
