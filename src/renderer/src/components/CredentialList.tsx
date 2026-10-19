import type { JSX } from 'react';
import type { CredentialSummary } from '../../../shared/credential';
import CredentialRow from './CredentialRow';

interface CredentialListProps {
  readonly credentials: readonly CredentialSummary[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

export default function CredentialList({
  credentials,
  selectedId,
  onSelect,
}: CredentialListProps): JSX.Element {
  return (
    <div className="card credential-list" role="list">
      {credentials.map((credential) => (
        <CredentialRow
          key={credential.id}
          credential={credential}
          selected={credential.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
