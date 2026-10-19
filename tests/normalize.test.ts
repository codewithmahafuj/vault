import { describe, expect, it } from 'vitest';
import { normalizeIdentifier, normalizeService } from '../src/shared/normalize';

describe('normalizeService', () => {
  it('trims and case-folds', () => {
    expect(normalizeService('  GitHUB ')).toBe('github');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeService('Google    Drive')).toBe('google drive');
    expect(normalizeService('Adobe\tAcrobat\nReader')).toBe('adobe acrobat reader');
  });

  it('leaves an all-whitespace value empty', () => {
    expect(normalizeService('   ')).toBe('');
  });
});

describe('normalizeIdentifier', () => {
  it('trims and case-folds', () => {
    expect(normalizeIdentifier('  User@Example.COM ')).toBe('user@example.com');
  });

  it('preserves internal spacing so formatted values still compare equal', () => {
    expect(normalizeIdentifier('+1 555 0100')).toBe('+1 555 0100');
    expect(normalizeIdentifier(' Ada Lovelace ')).toBe('ada lovelace');
  });

  it('does not rewrite characters inside the value', () => {
    expect(normalizeIdentifier('ada  lovelace')).toBe('ada  lovelace');
  });
});
