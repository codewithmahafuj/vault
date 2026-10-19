import { Loader, Trash2 } from 'lucide-react';
import type { JSX } from 'react';
import type { CredentialSummary } from '../../../shared/credential';
import type { VaultErrorCode } from '../../../shared/vault-result';
import { deleteFailureMessage } from '../lib/credential-form';
import Modal from './Modal';

// The frames draw the Add/Edit card but no confirmation step, so this reuses
// that card exactly and only changes its content. The wording below is
// provisional, the same way the startup-failure text is recorded as provisional
// in progress-tracker.md.
export interface DeleteConfirmModalProps {
  readonly credential: CredentialSummary;
  readonly busy: boolean;
  readonly failure: VaultErrorCode | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export default function DeleteConfirmModal({
  credential,
  busy,
  failure,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps): JSX.Element {
  return (
    <Modal title="Delete Password" onClose={onCancel} dismissible={!busy}>
      <div className="modal-body">
        {failure !== null && (
          <p className="form-failure" role="alert">
            {deleteFailureMessage(failure)}
          </p>
        )}
        <p className="modal-text">
          {credential.service} · {credential.identifier} will be permanently removed from this
          device. This cannot be undone.
        </p>
      </div>
      <footer className="modal-foot">
        <button
          type="button"
          className="button button--secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button type="button" className="button button--danger" onClick={onConfirm} disabled={busy}>
          {busy ? <Loader aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
          Delete
        </button>
      </footer>
    </Modal>
  );
}
