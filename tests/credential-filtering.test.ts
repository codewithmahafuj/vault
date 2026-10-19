import { describe, expect, it } from 'vitest';
import type { CredentialSummary } from '../src/shared/credential';
import {
  filterCredentials,
  groupServices,
  matchesQuery,
  selectedRecord,
  toggleSelection,
} from '../src/renderer/src/lib/credential-filtering';

interface Fixture {
  readonly service: string;
  readonly identifier: string;
  readonly notes?: string | null;
  readonly favorite?: boolean;
}

let sequence = 0;

function credential(overrides: Fixture): CredentialSummary {
  sequence += 1;
  const stamp = `2026-03-0${sequence}T09:00:00.000Z`;
  return {
    id: `id-${sequence}`,
    service: overrides.service,
    identifier: overrides.identifier,
    notes: overrides.notes ?? null,
    favorite: overrides.favorite ?? false,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

const google = credential({ service: 'Google', identifier: 'maya@example.com', favorite: true });
const drive = credential({ service: 'Google Drive', identifier: 'maya@work.example.com' });
const github = credential({
  service: 'github',
  identifier: 'maya-raines',
  notes: 'Recovery code printed.',
});
const linkedin = credential({
  service: 'LinkedIn',
  identifier: 'maya@example.com',
  notes: 'Trial ends in April',
});

const records: CredentialSummary[] = [google, drive, github, linkedin];

const all = { query: '', view: 'all' as const, service: null };

describe('matchesQuery', () => {
  it('matches every credential on an empty or whitespace-only query', () => {
    expect(records.every((record) => matchesQuery(record, '   '))).toBe(true);
  });

  it('matches service, identifier, and notes case-insensitively', () => {
    expect(matchesQuery(google, 'GOOGLE')).toBe(true);
    expect(matchesQuery(linkedin, 'linked')).toBe(true);
    expect(matchesQuery(github, 'recovery code')).toBe(true);
  });

  it('ignores query padding', () => {
    expect(matchesQuery(github, '  Git  ')).toBe(true);
  });

  it('does not match a password, because no summary carries one', () => {
    expect(records.every((record) => !('password' in record))).toBe(true);
  });
});

describe('filterCredentials', () => {
  it('returns every credential in list order for the default view', () => {
    expect(filterCredentials(records, all).map((c) => c.id)).toEqual([
      github.id,
      google.id,
      drive.id,
      linkedin.id,
    ]);
  });

  it('keeps only favorites in the favorites view', () => {
    expect(filterCredentials(records, { ...all, view: 'favorites' }).map((c) => c.id)).toEqual([
      google.id,
    ]);
  });

  it('matches a service filter regardless of how either side is spelled', () => {
    expect(filterCredentials(records, { ...all, service: ' GitHub ' }).map((c) => c.id)).toEqual([
      github.id,
    ]);
  });

  it('does not let a shorter service name match a longer one', () => {
    expect(filterCredentials(records, { ...all, service: 'Google' })).toHaveLength(1);
  });

  it('combines view, service, and query', () => {
    expect(
      filterCredentials(records, { query: 'example', view: 'favorites', service: 'Google' }).map(
        (c) => c.id,
      ),
    ).toEqual([google.id]);
    expect(
      filterCredentials(records, { query: 'april', view: 'favorites', service: null }),
    ).toEqual([]);
  });
});

describe('groupServices', () => {
  it('counts one group per normalized service and keeps the first spelling', () => {
    const grouped = groupServices([
      ...records,
      credential({ service: 'GitHub', identifier: 'maya@work.example.com' }),
    ]);
    expect(grouped).toEqual([
      { service: 'github', count: 2 },
      { service: 'Google', count: 1 },
      { service: 'Google Drive', count: 1 },
      { service: 'LinkedIn', count: 1 },
    ]);
  });

  it('returns nothing for an empty vault', () => {
    expect(groupServices([])).toEqual([]);
  });
});

describe('toggleSelection', () => {
  it('selects a row that is not already lit, from nothing or from another row', () => {
    expect(toggleSelection(null, google.id)).toBe(google.id);
    expect(toggleSelection(github.id, google.id)).toBe(google.id);
  });

  it('lets go of the row that is already lit', () => {
    expect(toggleSelection(google.id, google.id)).toBeNull();
  });
});

describe('selectedRecord', () => {
  const favorites = filterCredentials(records, { query: '', view: 'favorites', service: null });

  it('answers for the record the list is showing', () => {
    expect(selectedRecord(records, google.id)).toEqual(google);
  });

  it('answers nothing while no row is selected', () => {
    expect(selectedRecord(records, null)).toBeNull();
  });

  it('answers nothing for a record the active filter has hidden', () => {
    // Google is a favorite and GitHub is not, so the Favorites list has no row
    // for the selected record and the panel must not show one either.
    expect(selectedRecord(favorites, github.id)).toBeNull();
  });

  it('brings the same record back when the filter is lifted', () => {
    expect(selectedRecord(favorites, github.id)).toBeNull();
    expect(selectedRecord(records, github.id)).toEqual(github);
  });

  it('answers nothing for a record that is no longer in the vault', () => {
    expect(selectedRecord(records, 'id-never-saved')).toBeNull();
  });
});
