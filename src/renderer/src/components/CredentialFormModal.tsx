import { Copy, Eye, EyeOff, Loader } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { JSX, ChangeEvent } from 'react';
import type { CredentialInput, CredentialSummary } from '../../../shared/credential';
import {
  credentialFormIsValid,
  toCredentialInput,
  validateCredentialForm,
} from '../../../shared/credential-form';
import type { CredentialFormField, CredentialFormValues } from '../../../shared/credential-form';
import { normalizeService } from '../../../shared/normalize';
import type { VaultErrorCode } from '../../../shared/vault-result';
import {
  fieldProblemMessage,
  submitFailureMessage,
  unsavedPasswordCopyProblem,
} from '../lib/credential-form';
import type { CopyOutcome } from '../lib/details-panel';
import DuplicateWarning from './DuplicateWarning';
import Modal from './Modal';
import { knownServiceNames } from './service-marks';

// The Add and Edit form inside the card the frames specify. Two things shape it:
// the rules it enforces are the shared ones the main process gates on, and the
// password it edits arrives through the read-secret channel rather than a list
// payload, which is why an edit has a loading state and a failure state of its
// own.

const labels: Record<CredentialFormField, string> = {
  service: 'Service',
  identifier: 'Username / email',
  password: 'Password',
  notes: 'Notes',
};

export interface CredentialFormModalProps {
  readonly mode: 'add' | 'edit';
  readonly initialValues: CredentialFormValues;
  readonly favorite: boolean;
  readonly secretLoading: boolean;
  readonly secretFailure: VaultErrorCode | null;
  readonly submitFailure: VaultErrorCode | null;
  readonly duplicate: CredentialSummary | null;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (input: CredentialInput) => void;
  // Copies the password the main process holds for the record this card is
  // editing. Required, not optional: the card only opens for a record the vault
  // answered for, and an Add card shows no copy affordance at all.
  readonly onCopyPassword: () => Promise<CopyOutcome>;
  readonly onViewExisting: (id: string) => void;
  readonly onDismissDuplicate: () => void;
}

export default function CredentialFormModal({
  mode,
  initialValues,
  favorite,
  secretLoading,
  secretFailure,
  submitFailure,
  duplicate,
  busy,
  onClose,
  onSubmit,
  onCopyPassword,
  onViewExisting,
  onDismissDuplicate,
}: CredentialFormModalProps): JSX.Element {
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState<Partial<Record<CredentialFormField, boolean>>>({});
  const [revealed, setRevealed] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const serviceRef = useRef<HTMLInputElement>(null);
  const baseId = useId();

  // App hands over a new `initialValues` object once per edit, when the stored
  // password arrives, and the fields are locked until it does — so this reset can
  // never discard anything the user typed.
  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    if (copyState === 'idle') {
      return;
    }
    const timer = setTimeout(() => setCopyState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  const locked = busy || secretLoading || secretFailure !== null;
  const errors = validateCredentialForm(values);
  // The copy channel answers for the record, so it can only copy what the vault
  // holds. An Add card has no record and shows no copy pill at all.
  const passwordCopyProblem =
    mode === 'edit' ? unsavedPasswordCopyProblem(values.password, initialValues.password) : null;

  function setValue(field: CredentialFormField, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function onChange(field: CredentialFormField) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      setValue(field, event.target.value);
    };
  }

  function touch(field: CredentialFormField) {
    return (): void => {
      setTouched((current) => ({ ...current, [field]: true }));
    };
  }

  // An over-long field is reported as it happens, because the Save pill sits
  // disabled without explaining itself; a blank field waits until the user has
  // left it, so a form being filled in is not nagged.
  function problem(field: CredentialFormField): string | null {
    const issue = errors[field];
    if (issue === undefined) {
      return null;
    }
    return issue === 'too-long' || touched[field] === true
      ? fieldProblemMessage(field, issue)
      : null;
  }

  function idOf(field: CredentialFormField): string {
    return `${baseId}-${field}`;
  }

  function invalid(field: CredentialFormField): boolean {
    return problem(field) !== null;
  }

  const chipQuery = normalizeService(values.service);
  // "Other" never filters away: it is the frame's escape hatch, and the chip that
  // stays lit when the field holds a name the mark set does not know.
  const chips = knownServiceNames.filter((name) => {
    if (name === 'Other') {
      return true;
    }
    const key = normalizeService(name);
    return chipQuery.length === 0 || key.includes(chipQuery) || chipQuery.includes(key);
  });
  // "Other" stands for any name the mark set does not know, including a half-typed
  // one, so it reads as selected whenever the field holds a name that is not a brand.
  const otherSelected =
    chipQuery.length > 0 && !knownServiceNames.some((name) => normalizeService(name) === chipQuery);

  function chooseService(name: string): void {
    if (name === 'Other') {
      setValue('service', '');
      serviceRef.current?.focus();
      return;
    }
    setValue('service', name);
  }

  // The window never writes the clipboard itself: it names this record and this
  // field, and the main process reads the value and writes it. That is the copy
  // the timed cleanup covers, and the value never comes back through here --- only
  // whether the channel answered.
  function copyPassword(): void {
    void onCopyPassword().then(setCopyState);
  }

  const saveDisabled = !credentialFormIsValid(values) || locked;

  return (
    <Modal
      title={mode === 'add' ? 'Add Password' : 'Edit Password'}
      onClose={onClose}
      dismissible={!busy}
    >
      <div className="modal-body">
        {secretLoading && (
          <p className="status-line modal-note" role="status">
            <Loader aria-hidden="true" />
            Reading the saved password…
          </p>
        )}
        {secretFailure !== null && (
          <p className="form-failure" role="alert">
            Vault could not read this password, so this account cannot be edited. Close this form
            and try again.
          </p>
        )}
        {submitFailure !== null &&
          (submitFailure === 'duplicate-credential' ? (
            <DuplicateWarning
              existing={duplicate}
              onViewExisting={() => {
                if (duplicate !== null) {
                  onViewExisting(duplicate.id);
                }
              }}
              onDismiss={onDismissDuplicate}
            />
          ) : (
            <p className="form-failure" role="alert">
              {submitFailureMessage(submitFailure)}
            </p>
          ))}

        <div className="form-field">
          <label className="form-label" htmlFor={idOf('service')}>
            {labels.service}
          </label>
          <input
            id={idOf('service')}
            ref={serviceRef}
            className={`form-input${invalid('service') ? ' form-input--invalid' : ''}`}
            value={values.service}
            onChange={onChange('service')}
            onBlur={touch('service')}
            disabled={locked}
            aria-invalid={invalid('service')}
            aria-describedby={
              problem('service') === null ? undefined : `${idOf('service')}-problem`
            }
            autoComplete="off"
            spellCheck={false}
            data-autofocus=""
          />
          {problem('service') !== null && (
            <p className="field-problem" id={`${idOf('service')}-problem`}>
              {problem('service')}
            </p>
          )}
          <div className="chip-row" role="group" aria-label="Suggested services">
            {chips.map((name) => {
              const selected =
                name === 'Other' ? otherSelected : normalizeService(name) === chipQuery;
              return (
                <button
                  key={name}
                  type="button"
                  className={`chip${selected ? ' chip--selected' : ''}`}
                  aria-pressed={selected}
                  disabled={locked}
                  onClick={() => chooseService(name)}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor={idOf('identifier')}>
            {labels.identifier}
          </label>
          <input
            id={idOf('identifier')}
            className={`form-input${invalid('identifier') ? ' form-input--invalid' : ''}`}
            value={values.identifier}
            onChange={onChange('identifier')}
            onBlur={touch('identifier')}
            disabled={locked}
            aria-invalid={invalid('identifier')}
            aria-describedby={
              problem('identifier') === null ? undefined : `${idOf('identifier')}-problem`
            }
            autoComplete="off"
            spellCheck={false}
          />
          {problem('identifier') !== null && (
            <p className="field-problem" id={`${idOf('identifier')}-problem`}>
              {problem('identifier')}
            </p>
          )}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor={idOf('password')}>
            {labels.password}
          </label>
          <div className={`field-control${invalid('password') ? ' field-control--invalid' : ''}`}>
            <input
              id={idOf('password')}
              className="field-control-input"
              type={revealed ? 'text' : 'password'}
              value={values.password}
              onChange={onChange('password')}
              onBlur={touch('password')}
              disabled={locked}
              aria-invalid={invalid('password')}
              aria-describedby={
                problem('password') === null ? undefined : `${idOf('password')}-problem`
              }
              autoComplete={mode === 'add' ? 'new-password' : 'off'}
              spellCheck={false}
            />
            <div className="value-actions">
              <button
                type="button"
                className="icon-button"
                onClick={() => setRevealed((current) => !current)}
                disabled={locked}
                aria-pressed={revealed}
                aria-label={revealed ? 'Hide password' : 'Reveal password'}
              >
                {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
              {mode === 'edit' &&
                (copyState === 'idle' ? (
                  <button
                    type="button"
                    className="field-action"
                    onClick={copyPassword}
                    disabled={locked || passwordCopyProblem !== null}
                    aria-label={
                      passwordCopyProblem === null
                        ? 'Copy password'
                        : 'Copy password (save these changes first)'
                    }
                    title={passwordCopyProblem ?? undefined}
                  >
                    <Copy aria-hidden="true" />
                    copy
                  </button>
                ) : (
                  <span
                    className={copyState === 'copied' ? 'copied-feedback' : 'copy-problem'}
                    role="status"
                  >
                    {copyState === 'copied' ? 'Copied' : 'Copy failed'}
                  </span>
                ))}
            </div>
          </div>
          {problem('password') !== null && (
            <p className="field-problem" id={`${idOf('password')}-problem`}>
              {problem('password')}
            </p>
          )}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor={idOf('notes')}>
            {labels.notes}
          </label>
          <textarea
            id={idOf('notes')}
            className={`form-textarea${invalid('notes') ? ' form-textarea--invalid' : ''}`}
            value={values.notes}
            onChange={onChange('notes')}
            onBlur={touch('notes')}
            disabled={locked}
            aria-invalid={invalid('notes')}
            aria-describedby={problem('notes') === null ? undefined : `${idOf('notes')}-problem`}
            rows={2}
            spellCheck={false}
          />
          {problem('notes') !== null && (
            <p className="field-problem" id={`${idOf('notes')}-problem`}>
              {problem('notes')}
            </p>
          )}
        </div>
      </div>

      <footer className="modal-foot">
        <button
          type="button"
          className="button button--secondary"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => onSubmit(toCredentialInput(values, favorite))}
          disabled={saveDisabled}
        >
          {busy && <Loader aria-hidden="true" />}
          {mode === 'add' ? 'Save Password' : 'Save Changes'}
        </button>
      </footer>
    </Modal>
  );
}
