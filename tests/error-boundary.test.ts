import { describe, expect, it } from 'vitest';
import {
  BOUNDARY_ACTION_LABEL,
  BOUNDARY_COPY,
  safeFailureLogLine,
} from '../src/renderer/src/lib/error-boundary';

// A render error quotes what it choked on, so every fixture here carries a token
// that must never leave the console line: in a credential app, the thing on
// screen can be a password.
const SECRET_ON_SCREEN = 'fictional-bank-password';

function crashOnAValue(): Error {
  const error = new TypeError(
    `Objects are not valid as a React child (found: object with keys {${SECRET_ON_SCREEN}}).`,
  );
  return error;
}

describe('BOUNDARY_COPY', () => {
  it('says what is true about the data, in fixed sentences', () => {
    expect(BOUNDARY_COPY.title).toBe('Vault could not show this screen');
    expect(BOUNDARY_COPY.description).toContain('Nothing was saved or changed');
    expect(BOUNDARY_COPY.description).toContain('still on this computer');
  });

  it('names no value, no file, and no exception', () => {
    const shown = `${BOUNDARY_COPY.title} ${BOUNDARY_COPY.description}`;
    for (const forbidden of [
      SECRET_ON_SCREEN,
      'password',
      'vault.db',
      'AppData',
      'Error',
      'at ',
      '{',
    ]) {
      expect(shown.includes(forbidden), `fallback copy leaked ${forbidden}`).toBe(false);
    }
  });

  it('points at the reload it offers and at restarting the app', () => {
    expect(BOUNDARY_COPY.description).toContain(BOUNDARY_ACTION_LABEL);
    expect(BOUNDARY_COPY.description).toContain('close it and open it once more');
  });
});

describe('safeFailureLogLine', () => {
  it('keeps a production line to the kind of failure', () => {
    expect(safeFailureLogLine(crashOnAValue(), false)).toBe(
      'vault: a view failed to render (TypeError)',
    );
  });

  it('never lets the value on screen reach the production line', () => {
    const line = safeFailureLogLine(crashOnAValue(), false);
    expect(line.includes(SECRET_ON_SCREEN)).toBe(false);
    expect(line.includes('React child')).toBe(false);
  });

  it('keeps the message for a development run, where the values are fixtures', () => {
    const line = safeFailureLogLine(crashOnAValue(), true);
    expect(line).toContain('(TypeError:');
    expect(line).toContain(SECRET_ON_SCREEN);
  });

  it('carries the subclass name, not just Error', () => {
    expect(safeFailureLogLine(new RangeError('out of memory'), false)).toBe(
      'vault: a view failed to render (RangeError)',
    );
  });

  it('holds the shape even when the thrown value is not an Error', () => {
    for (const value of ['a bare string', undefined, null, { code: SECRET_ON_SCREEN }]) {
      expect(safeFailureLogLine(value, false)).toBe('vault: a view failed to render (Unknown)');
    }
  });

  it('describes a non-Error throw in a development run without losing it', () => {
    expect(safeFailureLogLine('a bare string', true)).toBe(
      'vault: a view failed to render (Unknown: a bare string)',
    );
  });
});

describe('BOUNDARY_ACTION_LABEL', () => {
  it('promises only a reload', () => {
    expect(BOUNDARY_ACTION_LABEL).toBe('Reload Vault');
    expect(BOUNDARY_ACTION_LABEL.toLowerCase()).toContain('reload');
  });
});
