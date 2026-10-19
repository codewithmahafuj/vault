import type { CredentialSummary } from '../../../shared/credential';
import { normalizeService } from '../../../shared/normalize';
import { sortByServiceThenIdentifier } from '../../../shared/sorting';

export type SidebarView = 'all' | 'favorites';

export interface ServiceGroup {
  readonly service: string;
  readonly count: number;
}

export interface CredentialFilter {
  readonly query: string;
  readonly view: SidebarView;
  readonly service: string | null;
}

// Search matches service, identifier, and notes case-insensitively, so a partial
// query has to be folded the same way its target is.
function folded(value: string): string {
  return value.toLowerCase();
}

export function matchesQuery(credential: CredentialSummary, query: string): boolean {
  const needle = folded(query.trim());
  if (needle.length === 0) {
    return true;
  }
  return (
    folded(credential.service).includes(needle) ||
    folded(credential.identifier).includes(needle) ||
    (credential.notes !== null && folded(credential.notes).includes(needle))
  );
}

export function filterCredentials(
  records: readonly CredentialSummary[],
  filter: CredentialFilter,
): CredentialSummary[] {
  const activeService = filter.service === null ? null : normalizeService(filter.service);
  return sortByServiceThenIdentifier(
    records.filter(
      (credential) =>
        (filter.view === 'all' || credential.favorite) &&
        (activeService === null || normalizeService(credential.service) === activeService) &&
        matchesQuery(credential, filter.query),
    ),
  );
}

// One group per normalized service name, counted from saved credentials, in the
// same alphabetical order the list uses. The display name is the first original
// spelling of that group so the sidebar matches the rows.
export function groupServices(records: readonly CredentialSummary[]): ServiceGroup[] {
  const groups = new Map<string, ServiceGroup>();
  for (const credential of sortByServiceThenIdentifier(records)) {
    const key = normalizeService(credential.service);
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { service: credential.service, count: 1 });
    } else {
      groups.set(key, { service: existing.service, count: existing.count + 1 });
    }
  }
  return [...groups.values()];
}

// Pressing the row that is already lit lets go of it, which is the rule the
// sidebar's service filter already follows ("choose it again to clear the
// filter"). Without it a row can be selected but never deselected, so the
// details panel has no way back to its no-selection state.
export function toggleSelection(current: string | null, clicked: string): string | null {
  return current === clicked ? null : clicked;
}

// The details card answers for a row the user can see, not for the id they last
// touched. A record a search, a service pick, or the Favorites filter has hidden
// has no row on screen to click, so it could never be deselected and the panel
// would keep showing a credential the list does not contain. The id survives in
// state, so lifting the filter brings the same record back.
export function selectedRecord(
  visible: readonly CredentialSummary[],
  selectedId: string | null,
): CredentialSummary | null {
  return visible.find((credential) => credential.id === selectedId) ?? null;
}
