import { CREDENTIAL_FIELD_LIMITS } from './credential-validation';
import type { CredentialInput } from './credential';

// The rules the Add/Edit form enforces as the user types. They are shared rather
// than renderer-local so the form and the main-process gate in
// `credential-validation.ts` cannot drift: `validateCredentialInput` stays the
// authority that decides what reaches storage, and this module only explains
// *which* field failed and why so the form can say so.

export type CredentialFormField = 'service' | 'identifier' | 'password' | 'notes';

export type CredentialFieldProblem = 'required' | 'too-long';

export type CredentialFormErrors = Partial<Record<CredentialFormField, CredentialFieldProblem>>;

// Every field is a plain string while the form is open; an empty note is still a
// string here and becomes `null` only in `toCredentialInput`.
export interface CredentialFormValues {
  readonly service: string;
  readonly identifier: string;
  readonly password: string;
  readonly notes: string;
}

const formFields: readonly CredentialFormField[] = ['service', 'identifier', 'password', 'notes'];

function fieldProblem(field: CredentialFormField, value: string): CredentialFieldProblem | null {
  // Emptiness is checked first so a field holding only spaces reads as blank
  // rather than as over-long, which is also how `isRequiredText` rejects it.
  if (field !== 'notes' && value.trim().length === 0) {
    return 'required';
  }
  if (value.length > CREDENTIAL_FIELD_LIMITS[field]) {
    return 'too-long';
  }
  return null;
}

export function validateCredentialForm(values: CredentialFormValues): CredentialFormErrors {
  const errors: CredentialFormErrors = {};
  for (const field of formFields) {
    const problem = fieldProblem(field, values[field]);
    if (problem !== null) {
      errors[field] = problem;
    }
  }
  return errors;
}

export function credentialFormIsValid(values: CredentialFormValues): boolean {
  return Object.keys(validateCredentialForm(values)).length === 0;
}

// Blank notes are stored as `null`, not as an empty string, so the details card
// can tell "no notes" from a note the user actually wrote. A note that holds
// only spaces carries nothing to show, so it counts as blank. Every other field
// is stored exactly as typed: normalization is for comparison only and never
// rewrites what the user entered (architecture.md invariant 13).
export function toCredentialInput(
  values: CredentialFormValues,
  favorite: boolean,
): CredentialInput {
  return {
    service: values.service,
    identifier: values.identifier,
    password: values.password,
    notes: values.notes.trim().length === 0 ? null : values.notes,
    favorite,
  };
}
