import type { IdentifiedCredential } from './credential';
import { normalizeIdentifier, normalizeService } from './normalize';

// "Alphabetically" has to mean what a reader of the list expects, and comparing
// case-folded strings by code unit does not: every non-ASCII letter sorts after
// ASCII `z`, so Électric and Ångström land behind Zoho. A collator orders the
// way the alphabet reads, and `base` sensitivity makes it case- and
// accent-insensitive, which is the same folding the duplicate rules use.
//
// The locale is pinned rather than left to the machine, so the list comes out in
// one order on every install; the app's own wording is English everywhere.
const alphabetical = new Intl.Collator('en', { sensitivity: 'base' });

function compareNormalized(a: string, b: string): number {
  return alphabetical.compare(a, b);
}

export function compareByServiceThenIdentifier<T extends IdentifiedCredential>(a: T, b: T): number {
  const byService = compareNormalized(normalizeService(a.service), normalizeService(b.service));
  if (byService !== 0) {
    return byService;
  }
  return compareNormalized(normalizeIdentifier(a.identifier), normalizeIdentifier(b.identifier));
}

export function sortByServiceThenIdentifier<T extends IdentifiedCredential>(
  records: readonly T[],
): T[] {
  return [...records].sort(compareByServiceThenIdentifier);
}
