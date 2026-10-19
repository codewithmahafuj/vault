import { ChevronRight, Star } from 'lucide-react';
import type { JSX } from 'react';
import type { CredentialSummary } from '../../../shared/credential';
import ServiceGlyph from './ServiceGlyph';

interface CredentialRowProps {
  readonly credential: CredentialSummary;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
}

export default function CredentialRow({
  credential,
  selected,
  onSelect,
}: CredentialRowProps): JSX.Element {
  return (
    <button
      type="button"
      className={selected ? 'credential-row credential-row--selected' : 'credential-row'}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(credential.id)}
    >
      <ServiceGlyph service={credential.service} />
      <span className="row-body">
        <span className="row-title">
          <span>{credential.service}</span>
          {credential.favorite && (
            <Star className="favorite-mark" fill="currentColor" aria-label="Favorite" />
          )}
        </span>
        <span className="row-subtitle">{credential.identifier}</span>
      </span>
      <ChevronRight className="row-chevron" aria-hidden="true" />
    </button>
  );
}
