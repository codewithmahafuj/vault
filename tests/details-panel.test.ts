import { describe, expect, it } from 'vitest';
import {
  favoriteFailureMessage,
  revealFailureMessage,
} from '../src/renderer/src/lib/details-panel';

describe('details panel failure copy', () => {
  it.each(['invalid-credential', 'duplicate-credential', 'not-found', 'storage-error'] as const)(
    'has something to say about a %s favorite write',
    (code) => {
      expect(favoriteFailureMessage(code)).not.toBe('');
    },
  );

  it.each(['invalid-credential', 'duplicate-credential', 'not-found', 'storage-error'] as const)(
    'has something to say about a %s password read',
    (code) => {
      expect(revealFailureMessage(code)).not.toBe('');
    },
  );

  it('distinguishes a record that went missing from a storage failure', () => {
    expect(favoriteFailureMessage('not-found')).toContain('no longer in your vault');
    expect(favoriteFailureMessage('storage-error')).toContain('could not update this account');
    expect(revealFailureMessage('not-found')).toContain('no longer in your vault');
    expect(revealFailureMessage('storage-error')).toContain('could not read this password');
  });

  it('offers a retry for the failure the user can repeat', () => {
    expect(favoriteFailureMessage('storage-error')).toContain('Try again');
    expect(revealFailureMessage('storage-error')).toContain('Try again');
  });
});
