import type { CredentialSecret } from '../../../shared/credential';
import type { VaultErrorCode, VaultResult } from '../../../shared/vault-result';

// Every transition a decrypted password takes through renderer state, in one
// place. They were written inline in `App.tsx` first, which made each of them
// unreadable as a rule and untestable as one --- and the interesting cases are
// all timing cases: an answer that arrives after the user moved on, after the
// record was deleted, or as a rejection instead of a result.
//
// The shape is generic over whatever carries the three fields, so the details
// card and the Edit form keep their own state objects and only share the rules.

export interface SecretBearing {
  readonly secretPendingId: string | null;
  readonly secret: { readonly id: string; readonly password: string } | null;
  readonly secretFailure: VaultErrorCode | null;
}

// Pressing `Reveal` on a record: whatever value was showing goes first, because
// one read at a time is the rule the card is built on.
export function requestSecret<T extends SecretBearing>(state: T, id: string): T {
  return {
    ...state,
    secret: null,
    secretFailure: null,
    secretPendingId: id,
  };
}

// Pressing it again while the value is showing covers it and drops it. The
// pending id goes with it, so an answer still on its way is discarded by
// `answerSecret` rather than undoing what the user just asked for.
export function hideSecret<T extends SecretBearing>(state: T, id: string): T {
  return state.secret?.id !== id
    ? state
    : { ...state, secret: null, secretPendingId: null, secretFailure: null };
}

// The answer, in whatever form it came --- a code, a folded rejection, or a
// password. It is applied only while the read it belongs to is still the one
// outstanding, which is what keeps a late answer from painting one record's
// password onto another's card.
export function answerSecret<T extends SecretBearing>(
  state: T,
  id: string,
  result: VaultResult<CredentialSecret>,
): T {
  if (state.secretPendingId !== id) {
    return state;
  }
  return result.ok
    ? {
        ...state,
        secretPendingId: null,
        secret: { id, password: result.value.password },
        secretFailure: null,
      }
    : { ...state, secretPendingId: null, secret: null, secretFailure: result.code };
}

// The `finally` of the same call. A read that cannot answer must stop claiming
// to work and must not leave a half-read value behind --- but a value this
// transition already stored stays, or the release would hide what the user is
// looking at.
export function releaseSecret<T extends SecretBearing>(state: T, id: string): T {
  return state.secretPendingId !== id
    ? state
    : { ...state, secretPendingId: null, secret: null, secretFailure: null };
}

// The Edit form's read has the same staleness problem in different words: the
// card may be closed, or be about another record, by the time the password
// arrives. This is the gate both of its transitions run through. What the card
// does once it owns the answer --- fill the form, show a code, stop spinning ---
// belongs to the form, not to a rule about whose password this is.
export interface CardOwner {
  readonly credentialId: string | null;
}

// A predicate rather than a boolean, because the callers need what it proves: a
// card that is open, and open for this record.
export function ownsCard<T extends CardOwner>(
  state: T | null,
  id: string,
): state is T & { readonly credentialId: string } {
  return state !== null && state.credentialId === id;
}
