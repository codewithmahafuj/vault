import { describe, expect, it } from 'vitest';
import { findDuplicateCredential, sameCredentialIdentity } from '../src/shared/duplicate-identity';
import type { IdentifiedCredential } from '../src/shared/credential';

const saved: IdentifiedCredential[] = [
  { id: '1', service: 'Google', identifier: 'user@example.com' },
  { id: '2', service: 'Facebook', identifier: 'user@example.com' },
  { id: '3', service: 'Google Drive', identifier: 'Ada L' },
];

describe('sameCredentialIdentity', () => {
  it('matches ignoring case and surrounding whitespace in both fields', () => {
    expect(
      sameCredentialIdentity(
        { service: '  google ', identifier: ' USER@example.com ' },
        { service: 'Google', identifier: 'user@example.com' },
      ),
    ).toBe(true);
  });

  it('matches when only the service spacing differs', () => {
    expect(
      sameCredentialIdentity(
        { service: 'Google    Drive', identifier: 'ada l' },
        { service: 'google drive', identifier: 'Ada L' },
      ),
    ).toBe(true);
  });

  it('allows one identifier across different services', () => {
    expect(
      sameCredentialIdentity(
        { service: 'Google', identifier: 'user@example.com' },
        { service: 'Facebook', identifier: 'user@example.com' },
      ),
    ).toBe(false);
  });

  it('separates different identifiers under one service', () => {
    expect(
      sameCredentialIdentity(
        { service: 'Google', identifier: 'ada@example.com' },
        { service: 'Google', identifier: 'grace@example.com' },
      ),
    ).toBe(false);
  });
});

describe('findDuplicateCredential', () => {
  it('returns the matching saved record', () => {
    const found = findDuplicateCredential(
      { service: 'google', identifier: 'USER@example.com' },
      saved,
    );
    expect(found?.id).toBe('1');
  });

  it('returns undefined when nothing matches', () => {
    const found = findDuplicateCredential(
      { service: 'Netflix', identifier: 'ada@example.com' },
      saved,
    );
    expect(found).toBeUndefined();
  });

  it('excludes the record being edited so it is never its own duplicate', () => {
    const found = findDuplicateCredential(
      { service: 'Google', identifier: 'user@example.com' },
      saved,
      '1',
    );
    expect(found).toBeUndefined();
  });

  it('reports another record when an edit collides with it', () => {
    const edited: IdentifiedCredential = {
      id: '9',
      service: 'Adobe',
      identifier: 'grace@example.com',
    };
    const records = [...saved, edited];
    const found = findDuplicateCredential(
      { service: 'google   drive', identifier: 'ada l' },
      records,
      edited.id,
    );
    expect(found?.id).toBe('3');
  });
});
