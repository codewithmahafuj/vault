import { TriangleAlert } from 'lucide-react';
import type { JSX } from 'react';
import type { CredentialSummary } from '../../../shared/credential';

// The amber panel the form shows when the main process answers
// `duplicate-credential`. The code is the authority on the rejection; this only
// explains it and offers the way to the record that already exists.
export interface DuplicateWarningProps {
  readonly existing: CredentialSummary | null;
  readonly onViewExisting: () => void;
  readonly onDismiss: () => void;
}

export default function DuplicateWarning({
  existing,
  onViewExisting,
  onDismiss,
}: DuplicateWarningProps): JSX.Element {
  return (
    <figure className="duplicate-warning" role="alert">
      <TriangleAlert aria-hidden="true" />
      <div className="duplicate-warning-body">
        <p className="duplicate-warning-text">
          {existing === null
            ? 'An account for this service and username is already saved.'
            : `${existing.service} · ${existing.identifier} is already saved, so this would create a duplicate.`}
        </p>
        <div className="duplicate-warning-actions">
          {existing !== null && (
            <button
              type="button"
              className="button button--compact button--secondary"
              onClick={onViewExisting}
            >
              View existing
            </button>
          )}
          <button
            type="button"
            className="button button--compact button--quiet"
            onClick={onDismiss}
          >
            Cancel
          </button>
        </div>
      </div>
    </figure>
  );
}
