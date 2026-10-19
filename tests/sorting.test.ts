import { describe, expect, it } from 'vitest';
import type { IdentifiedCredential } from '../src/shared/credential';
import { compareByServiceThenIdentifier, sortByServiceThenIdentifier } from '../src/shared/sorting';

const records: IdentifiedCredential[] = [
  { id: 'c', service: 'zebra', identifier: 'zoe' },
  { id: 'a', service: 'Google Drive', identifier: 'grace@example.com' },
  { id: 'b', service: 'apple', identifier: 'Ada Lovelace' },
  { id: 'd', service: 'Google', identifier: 'zoe@example.com' },
  { id: 'e', service: 'Google', identifier: 'ADA@example.com' },
  { id: 'f', service: '  Adobe    Acrobat  ', identifier: 'grace' },
];

// Every service name here is one a code-unit comparison would put last: the
// accents are what the collator exists for.
const accented: IdentifiedCredential[] = [
  { id: 'zoho', service: 'Zoho', identifier: 'ada@example.com' },
  { id: 'electric', service: 'Électric', identifier: 'ada@example.com' },
  { id: 'amazon', service: 'Amazon', identifier: 'ada@example.com' },
  { id: 'angstrom', service: 'Ångström Labs', identifier: 'ada@example.com' },
  { id: 'eltern', service: 'Eltern', identifier: 'ada@example.com' },
  { id: 'nu', service: 'Ñu', identifier: 'ada@example.com' },
  { id: 'obb', service: 'ÖBB', identifier: 'ada@example.com' },
  { id: 'naive', service: 'naïve Bank', identifier: 'ada@example.com' },
];

function orderedIds(): string[] {
  return sortByServiceThenIdentifier(records).map((record) => record.id);
}

function orderedServices(): string[] {
  return sortByServiceThenIdentifier(accented).map((record) => record.service);
}

describe('sortByServiceThenIdentifier', () => {
  it('orders by service name alphabetically, ignoring case', () => {
    expect(orderedIds()).toEqual(['f', 'b', 'e', 'd', 'a', 'c']);
  });

  it('orders identifiers alphabetically within one service', () => {
    const google = sortByServiceThenIdentifier(
      records.filter((record) => record.id === 'd' || record.id === 'e'),
    );
    expect(google.map((record) => record.identifier)).toEqual([
      'ADA@example.com',
      'zoe@example.com',
    ]);
  });

  it('keeps the shorter service name ahead of its prefixed longer name', () => {
    expect(orderedIds().indexOf('d')).toBeLessThan(orderedIds().indexOf('a'));
  });

  it('preserves the original display values', () => {
    const sorted = sortByServiceThenIdentifier(records);
    expect(sorted.map((record) => record.service)).toContain('  Adobe    Acrobat  ');
  });

  it('returns a new array without reordering the input', () => {
    const input = [...records];
    const sorted = sortByServiceThenIdentifier(input);
    expect(sorted).not.toBe(input);
    expect(input).toEqual(records);
  });

  it('sorts an accented service name by its base letter', () => {
    expect(orderedServices()).toEqual([
      'Amazon',
      'Ångström Labs',
      'Électric',
      'Eltern',
      'naïve Bank',
      'Ñu',
      'ÖBB',
      'Zoho',
    ]);
  });

  it('keeps a non-ASCII service name ahead of one that starts with z', () => {
    const ids = sortByServiceThenIdentifier(accented).map((record) => record.id);
    expect(ids.indexOf('electric')).toBeLessThan(ids.indexOf('zoho'));
    expect(ids.indexOf('angstrom')).toBeLessThan(ids.indexOf('zoho'));
    expect(ids.at(-1)).toBe('zoho');
  });

  it('sorts an accented identifier the same way within one service', () => {
    const sameService = [
      { id: 'z', service: 'Google', identifier: 'zoë@example.com' },
      { id: 'e', service: 'Google', identifier: 'émile@example.com' },
      { id: 'a', service: 'Google', identifier: 'Áda@example.com' },
    ];

    expect(sortByServiceThenIdentifier(sameService).map((record) => record.identifier)).toEqual([
      'Áda@example.com',
      'émile@example.com',
      'zoë@example.com',
    ]);
  });
});

describe('compareByServiceThenIdentifier', () => {
  it('reports equal ordering for the same identity', () => {
    const a: IdentifiedCredential = { id: '1', service: 'Google', identifier: 'ada@example.com' };
    const b: IdentifiedCredential = { id: '2', service: ' google ', identifier: 'ADA@example.com' };
    expect(compareByServiceThenIdentifier(a, b)).toBe(0);
  });

  it('reports equal ordering for a service name that differs only by accent', () => {
    const a: IdentifiedCredential = { id: '1', service: 'Eclair', identifier: 'ada' };
    const b: IdentifiedCredential = { id: '2', service: 'Éclair', identifier: 'ada' };
    expect(compareByServiceThenIdentifier(a, b)).toBe(0);
  });

  it('places an accented name among its base-letter neighbours', () => {
    const amazon: IdentifiedCredential = { id: '1', service: 'Amazon', identifier: 'ada' };
    const angstrom: IdentifiedCredential = { id: '2', service: 'Ångström', identifier: 'ada' };
    const electric: IdentifiedCredential = { id: '3', service: 'Électric', identifier: 'ada' };
    const eltern: IdentifiedCredential = { id: '4', service: 'Eltern', identifier: 'ada' };

    expect(compareByServiceThenIdentifier(amazon, angstrom)).toBeLessThan(0);
    expect(compareByServiceThenIdentifier(electric, eltern)).toBeLessThan(0);
    expect(compareByServiceThenIdentifier(eltern, electric)).toBeGreaterThan(0);
  });
});
