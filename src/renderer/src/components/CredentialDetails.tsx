import { Copy, Eye, EyeOff, Pencil, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { CredentialCopyField, CredentialSummary } from '../../../shared/credential';
import type { VaultErrorCode } from '../../../shared/vault-result';
import type { CopyOutcome } from '../lib/details-panel';
import { favoriteFailureMessage, revealFailureMessage } from '../lib/details-panel';
import ServiceGlyph from './ServiceGlyph';

interface CredentialDetailsProps {
  readonly credential: CredentialSummary;
  // Present only while this record's password is revealed. The card never asks
  // for one and never keeps one: the reveal and copy affordances work off what
  // the shell hands down, so no secret crosses into a presentation component
  // that the user did not just ask to see.
  readonly revealedPassword: string | null;
  readonly secretPending: boolean;
  readonly secretFailure: VaultErrorCode | null;
  readonly favoritePending: boolean;
  readonly favoriteFailure: VaultErrorCode | null;
  readonly onToggleFavorite?: () => void;
  readonly onToggleReveal?: () => void;
  readonly onCopyIdentifier?: () => Promise<CopyOutcome>;
  readonly onCopyPassword?: () => Promise<CopyOutcome>;
  readonly onEdit?: () => void;
  readonly onDelete?: () => void;
}

const dateFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
}

export default function CredentialDetails({
  credential,
  revealedPassword,
  secretPending,
  secretFailure,
  favoritePending,
  favoriteFailure,
  onToggleFavorite,
  onToggleReveal,
  onCopyIdentifier,
  onCopyPassword,
  onEdit,
  onDelete,
}: CredentialDetailsProps): JSX.Element {
  const [copyState, setCopyState] = useState<{
    readonly field: CredentialCopyField;
    readonly outcome: CopyOutcome;
  } | null>(null);

  // A copy note belongs to the value that was copied, not to whichever record
  // happens to be on screen next.
  useEffect(() => {
    setCopyState(null);
  }, [credential.id]);

  useEffect(() => {
    if (copyState === null) {
      return;
    }
    const timer = setTimeout(() => setCopyState(null), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  const revealed = revealedPassword !== null;

  function copy(field: CredentialCopyField, run: (() => Promise<CopyOutcome>) | undefined): void {
    if (run === undefined) {
      return;
    }
    void run().then((outcome) => setCopyState({ field, outcome }));
  }

  // The frames show one affordance per action, so the note takes the copy
  // button's place instead of sitting beside it and shifting the row.
  function feedback(field: CredentialCopyField): JSX.Element | null {
    if (copyState === null || copyState.field !== field) {
      return null;
    }
    return (
      <span
        className={copyState.outcome === 'copied' ? 'copied-feedback' : 'copy-problem'}
        role="status"
      >
        {copyState.outcome === 'copied' ? 'Copied' : 'Copy failed'}
      </span>
    );
  }

  return (
    <section className="card details" aria-label={`Details for ${credential.service}`}>
      <header className="details-head">
        <ServiceGlyph service={credential.service} />
        <h1 className="details-title">{credential.service}</h1>
        <button
          type="button"
          className="icon-button details-favorite"
          disabled={onToggleFavorite === undefined || favoritePending}
          aria-pressed={credential.favorite}
          aria-label={credential.favorite ? 'Remove from favorites' : 'Add to favorites'}
          title={onToggleFavorite === undefined ? 'Unavailable in this build' : undefined}
          onClick={onToggleFavorite}
        >
          <Star aria-hidden="true" fill={credential.favorite ? 'currentColor' : 'none'} />
        </button>
      </header>

      {favoriteFailure !== null && (
        <p className="form-failure" role="alert">
          {favoriteFailureMessage(favoriteFailure)}
        </p>
      )}

      <hr className="details-divider" />

      <div className="field">
        <span className="field-label" id={`${credential.id}-identifier-label`}>
          Username / Email
        </span>
        <div
          className="field-value"
          role="group"
          aria-labelledby={`${credential.id}-identifier-label`}
        >
          <span>{credential.identifier}</span>
          <div className="value-actions">
            {feedback('identifier') ?? (
              <button
                type="button"
                className="field-action"
                disabled={onCopyIdentifier === undefined}
                aria-label="Copy username"
                title={onCopyIdentifier === undefined ? 'Unavailable in this build' : undefined}
                onClick={() => copy('identifier', onCopyIdentifier)}
              >
                <Copy aria-hidden="true" />
                copy
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="field">
        <span className="field-label" id={`${credential.id}-password-label`}>
          Password
        </span>
        <div
          className="field-value"
          role="group"
          aria-labelledby={`${credential.id}-password-label`}
        >
          {revealed ? (
            // No label here on purpose: the user asked to see the value, so a
            // screen reader should read it rather than describe the field.
            <code>{revealedPassword}</code>
          ) : (
            <code aria-label="Password hidden">••••••••••••</code>
          )}
          <div className="value-actions">
            <button
              type="button"
              className="icon-button"
              disabled={onToggleReveal === undefined || secretPending}
              aria-pressed={revealed}
              aria-label={revealed ? 'Hide password' : 'Reveal password'}
              title={onToggleReveal === undefined ? 'Unavailable in this build' : undefined}
              onClick={onToggleReveal}
            >
              {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
            {feedback('password') ?? (
              <button
                type="button"
                className="field-action"
                disabled={onCopyPassword === undefined}
                aria-label="Copy password"
                title={onCopyPassword === undefined ? 'Unavailable in this build' : undefined}
                onClick={() => copy('password', onCopyPassword)}
              >
                <Copy aria-hidden="true" />
                copy
              </button>
            )}
          </div>
        </div>
        {secretFailure !== null && (
          <p className="field-problem" role="alert">
            {revealFailureMessage(secretFailure)}
          </p>
        )}
      </div>

      <div className="field">
        <span className="field-label" id={`${credential.id}-notes-label`}>
          Notes
        </span>
        <p className="field-plain" role="group" aria-labelledby={`${credential.id}-notes-label`}>
          {credential.notes ?? 'No notes yet.'}
        </p>
      </div>

      <hr className="details-divider" />

      <footer className="details-actions">
        <button
          type="button"
          className="button button--secondary"
          disabled={onEdit === undefined}
          title={onEdit === undefined ? 'Unavailable in this build' : undefined}
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          className="button button--danger"
          disabled={onDelete === undefined}
          title={onDelete === undefined ? 'Unavailable in this build' : undefined}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" />
          Delete
        </button>
      </footer>

      <p className="details-meta">
        Created {formatTimestamp(credential.createdAt)} · Updated{' '}
        {formatTimestamp(credential.updatedAt)}
      </p>
    </section>
  );
}
