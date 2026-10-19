import { describe, expect, it } from 'vitest';
import { failed, succeeded } from '../src/shared/vault-result';
import type { VaultResult } from '../src/shared/vault-result';
import type { CredentialSecret } from '../src/shared/credential';
import {
  answerSecret,
  hideSecret,
  ownsCard,
  releaseSecret,
  requestSecret,
  type SecretBearing,
} from '../src/renderer/src/lib/secret-lifecycle';

const ALPHA = 'row-alpha';
const BETA = 'row-beta';
const ALPHA_PASSWORD = 'fictional-alpha-password';
const BETA_PASSWORD = 'fictional-beta-password';

function idle(): SecretBearing {
  return { secret: null, secretPendingId: null, secretFailure: null };
}

function revealedFor(id: string, password: string): SecretBearing {
  return { secret: { id, password }, secretPendingId: null, secretFailure: null };
}

function pendingFor(id: string): SecretBearing {
  return { secret: null, secretPendingId: id, secretFailure: null };
}

const secret = (id: string, password: string): VaultResult<CredentialSecret> =>
  succeeded({ id, password });

describe('requestSecret', () => {
  it('drops the value shown for another record before starting a read', () => {
    const next = requestSecret(revealedFor(ALPHA, ALPHA_PASSWORD), BETA);

    expect(next.secret).toBeNull();
    expect(next.secretPendingId).toBe(BETA);
    expect(next.secretFailure).toBeNull();
  });

  it('keeps exactly one password in state, so two reads cannot overlap', () => {
    let state = requestSecret(idle(), ALPHA);
    state = answerSecret(state, ALPHA, secret(ALPHA, ALPHA_PASSWORD));
    state = requestSecret(state, BETA);

    expect(state.secret).toBeNull();
    expect(state.secretPendingId).toBe(BETA);
  });
});

describe('answerSecret', () => {
  it('applies the answer for the read that is still outstanding', () => {
    const next = answerSecret(pendingFor(ALPHA), ALPHA, secret(ALPHA, ALPHA_PASSWORD));

    expect(next.secret).toEqual({ id: ALPHA, password: ALPHA_PASSWORD });
    expect(next.secretPendingId).toBeNull();
    expect(next.secretFailure).toBeNull();
  });

  it('discards a delayed answer for a record the user has moved away from', () => {
    // The read for ALPHA is still in flight when the user selects BETA and the
    // panel resets; ALPHA's password must not arrive onto BETA's card.
    const movedOn = idle();

    expect(answerSecret(movedOn, ALPHA, secret(ALPHA, ALPHA_PASSWORD))).toBe(movedOn);
  });

  it('discards a delayed answer when a newer read has taken its place', () => {
    let state = requestSecret(idle(), ALPHA);
    state = requestSecret(state, BETA);

    const afterLateAlpha = answerSecret(state, ALPHA, secret(ALPHA, ALPHA_PASSWORD));
    expect(afterLateAlpha).toBe(state);

    const afterBeta = answerSecret(afterLateAlpha, BETA, secret(BETA, BETA_PASSWORD));
    expect(afterBeta.secret).toEqual({ id: BETA, password: BETA_PASSWORD });
  });

  it('reports a record that was deleted mid-read without holding anything', () => {
    const next = answerSecret(pendingFor(ALPHA), ALPHA, failed('not-found'));

    expect(next.secret).toBeNull();
    expect(next.secretFailure).toBe('not-found');
    expect(next.secretPendingId).toBeNull();
  });

  it('folds an unexpected IPC rejection the same way, because the renderer sees one code', () => {
    // `callVault()` turns a rejected `readSecret` into this exact result, so this
    // is the state a torn-down window leaves the card in.
    const next = answerSecret(pendingFor(ALPHA), ALPHA, failed('storage-error'));

    expect(next.secret).toBeNull();
    expect(next.secretFailure).toBe('storage-error');
    expect(next.secretPendingId).toBeNull();
  });

  it('clears an earlier failure once a read does answer', () => {
    const failedBefore: SecretBearing = {
      secret: null,
      secretPendingId: ALPHA,
      secretFailure: 'storage-error',
    };

    expect(
      answerSecret(failedBefore, ALPHA, secret(ALPHA, ALPHA_PASSWORD)).secretFailure,
    ).toBeNull();
  });
});

describe('releaseSecret', () => {
  it('stops a read that never answered and leaves no value behind', () => {
    const next = releaseSecret(pendingFor(ALPHA), ALPHA);

    expect(next.secretPendingId).toBeNull();
    expect(next.secret).toBeNull();
    expect(next.secretFailure).toBeNull();
  });

  it('does not wipe the value the answer it follows just stored', () => {
    // The `finally` runs after the answer, so it has to recognise its own work as
    // finished rather than undo it --- that would hide the password on screen.
    const revealed = answerSecret(pendingFor(ALPHA), ALPHA, secret(ALPHA, ALPHA_PASSWORD));

    expect(releaseSecret(revealed, ALPHA)).toBe(revealed);
  });

  it('ignores a release for a record the user has moved away from', () => {
    const state = pendingFor(BETA);

    expect(releaseSecret(state, ALPHA)).toBe(state);
  });
});

describe('hideSecret', () => {
  it('covers the value it is showing and drops it from state', () => {
    const next = hideSecret(revealedFor(ALPHA, ALPHA_PASSWORD), ALPHA);

    expect(next.secret).toBeNull();
    expect(next.secretPendingId).toBeNull();
    expect(next.secretFailure).toBeNull();
  });

  it('leaves another record alone, including one whose read is in flight', () => {
    const state = pendingFor(BETA);

    expect(hideSecret(state, ALPHA)).toBe(state);
  });

  it('makes a late answer that follows a hide land nowhere', () => {
    let state = requestSecret(idle(), ALPHA);
    state = hideSecret(answerSecret(state, ALPHA, secret(ALPHA, ALPHA_PASSWORD)), ALPHA);

    // The read had already answered before the hide; a second, later answer for
    // the same record has no pending read to attach to.
    expect(answerSecret(state, ALPHA, secret(ALPHA, ALPHA_PASSWORD))).toBe(state);
  });
});

describe('the whole sequence a user can actually cause', () => {
  it('holds no password after a reveal whose answer arrives past a selection change', () => {
    // The user presses reveal on ALPHA, then selects BETA before the read
    // answers. `App.tsx` resets the card through its selection effect, so the
    // state ALPHA's late answer lands on belongs to no record and has nothing
    // outstanding for ALPHA.
    const revealed = answerSecret(
      requestSecret(idle(), ALPHA),
      ALPHA,
      secret(ALPHA, ALPHA_PASSWORD),
    );
    expect(revealed.secret).toEqual({ id: ALPHA, password: ALPHA_PASSWORD });

    const movedOn = idle();
    expect(answerSecret(movedOn, ALPHA, secret(ALPHA, ALPHA_PASSWORD))).toBe(movedOn);
    expect(releaseSecret(movedOn, ALPHA)).toBe(movedOn);
    expect(movedOn.secret).toBeNull();
  });

  it('shows a password only for the record its read was made for', () => {
    let state = requestSecret(idle(), ALPHA);
    state = requestSecret(state, BETA);
    state = answerSecret(state, ALPHA, secret(ALPHA, ALPHA_PASSWORD));
    state = releaseSecret(state, ALPHA);
    state = answerSecret(state, BETA, secret(BETA, BETA_PASSWORD));
    state = releaseSecret(state, BETA);

    expect(state.secret).toEqual({ id: BETA, password: BETA_PASSWORD });
  });
});

describe('ownsCard', () => {
  it('refuses a card that is closed', () => {
    expect(ownsCard(null, ALPHA)).toBe(false);
  });

  it('refuses a card about another record', () => {
    expect(ownsCard({ credentialId: BETA }, ALPHA)).toBe(false);
  });

  it('accepts the card open for this record', () => {
    const card = ownsCard({ credentialId: ALPHA }, ALPHA) ? 'open' : 'closed';
    expect(card).toBe('open');
  });
});
