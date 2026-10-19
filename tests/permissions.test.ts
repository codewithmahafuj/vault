import { describe, expect, it } from 'vitest';
import { denyAllPermissions } from '../src/main/permissions';
import type { PermissionGuardTarget } from '../src/main/permissions';

// Nothing in Vault's own feature set needs a web permission, so the ones a
// hostile or mistyped page could ask for are exactly the ones worth proving are
// refused.
const askedFor = [
  'geolocation',
  'notifications',
  'media',
  'audioCapture',
  'videoCapture',
  'clipboard-read',
  'clipboard-sanitized-write',
  'display-capture',
  'wake-lock',
  'fullscreen',
  'external-protocol',
  '',
];

function guardWithRecordingTarget(): {
  check?: (permission: string) => boolean;
  request?: (permission: string, respond: (granted: boolean) => void) => void;
} {
  const handlers: {
    check?: (permission: string) => boolean;
    request?: (permission: string, respond: (granted: boolean) => void) => void;
  } = {};
  const target: PermissionGuardTarget = {
    setPermissionCheckHandler: (handler) => {
      handlers.check = handler;
    },
    setPermissionRequestHandler: (handler) => {
      handlers.request = handler;
    },
  };

  denyAllPermissions(target);
  return handlers;
}

describe('denyAllPermissions', () => {
  it('registers both the synchronous check and the asynchronous request handler', () => {
    const handlers = guardWithRecordingTarget();

    expect(handlers.check).toBeTypeOf('function');
    expect(handlers.request).toBeTypeOf('function');
  });

  it('refuses every permission the synchronous check can be asked about', () => {
    const handlers = guardWithRecordingTarget();

    for (const permission of askedFor) {
      expect(handlers.check?.(permission)).toBe(false);
    }
  });

  it('answers every asynchronous request with a refusal, including one it never expects', () => {
    const handlers = guardWithRecordingTarget();
    const granted: boolean[] = [];

    for (const permission of askedFor) {
      handlers.request?.(permission, (answer) => granted.push(answer));
    }

    expect(granted).toEqual(askedFor.map(() => false));
    expect(granted).not.toContain(true);
  });

  it('grants nothing when the same request is repeated', () => {
    const handlers = guardWithRecordingTarget();
    const answers: boolean[] = [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      handlers.request?.('clipboard-read', (answer) => answers.push(answer));
    }

    expect(answers).toEqual([false, false, false]);
  });
});
