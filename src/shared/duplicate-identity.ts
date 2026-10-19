import type { CredentialIdentity, IdentifiedCredential } from './credential';
import { normalizeIdentifier, normalizeService } from './normalize';

export function sameCredentialIdentity(a: CredentialIdentity, b: CredentialIdentity): boolean {
  return (
    normalizeService(a.service) === normalizeService(b.service) &&
    normalizeIdentifier(a.identifier) === normalizeIdentifier(b.identifier)
  );
}

export function findDuplicateCredential<T extends IdentifiedCredential>(
  candidate: CredentialIdentity,
  records: readonly T[],
  excludeId?: string,
): T | undefined {
  return records.find(
    (record) => record.id !== excludeId && sameCredentialIdentity(candidate, record),
  );
}
