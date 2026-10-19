import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLIPBOARD_TIMEOUT_MS,
  createClipboardCleanup,
} from '../src/main/clipboard/clipboard-cleanup';
import type { ClipboardPort, ClipboardTimerHandle } from '../src/main/clipboard/clipboard-cleanup';

interface FakeClipboard extends ClipboardPort {
  text: string;
  readonly writes: string[];
  clears: number;
  refuseWrite: boolean;
  refuseRead: boolean;
  refuseClear: boolean;
}

// A clipboard whose contents the test sets by hand, so a replacement can be
// staged exactly when the cleanup looks.
function createFakeClipboard(text = ''): FakeClipboard {
  const fake: FakeClipboard = {
    text,
    writes: [],
    clears: 0,
    refuseWrite: false,
    refuseRead: false,
    refuseClear: false,
    async readText(): Promise<string> {
      if (fake.refuseRead) {
        throw new Error('the clipboard could not be read');
      }
      return fake.text;
    },
    async writeText(value: string): Promise<void> {
      if (fake.refuseWrite) {
        throw new Error('the clipboard refused the write');
      }
      fake.writes.push(value);
      fake.text = value;
    },
    clear(): void {
      if (fake.refuseClear) {
        throw new Error('the clipboard refused the clear');
      }
      fake.clears += 1;
      fake.text = '';
    },
  };
  return fake;
}

interface ArmedRun {
  readonly run: () => void | Promise<void>;
  readonly delayMs: number;
  cancelled: boolean;
}

interface FakeScheduler {
  readonly armed: ArmedRun[];
  schedule(run: () => void | Promise<void>, delayMs: number): ClipboardTimerHandle;
  // Fires every live timer in the order they were armed, which is how one test
  // can show a superseded cleanup doing nothing.
  fireAll(): Promise<void>;
}

function createFakeScheduler(): FakeScheduler {
  const armed: ArmedRun[] = [];
  return {
    armed,
    schedule(run: () => void | Promise<void>, delayMs: number): ClipboardTimerHandle {
      const entry: ArmedRun = { run, delayMs, cancelled: false };
      armed.push(entry);
      return {
        cancel(): void {
          entry.cancelled = true;
        },
      };
    },
    async fireAll(): Promise<void> {
      for (const entry of armed.filter((candidate) => !candidate.cancelled)) {
        await entry.run();
      }
    },
  };
}

describe('createClipboardCleanup', () => {
  it('writes the value and arms one cleanup at the approved default', async () => {
    const clipboard = createFakeClipboard();
    const scheduler = createFakeScheduler();
    const cleanup = createClipboardCleanup(clipboard, undefined, scheduler.schedule);

    await cleanup.copy('fictional-bank-password');

    expect(clipboard.writes).toEqual(['fictional-bank-password']);
    expect(scheduler.armed.map((entry) => entry.delayMs)).toEqual([DEFAULT_CLIPBOARD_TIMEOUT_MS]);
    expect(DEFAULT_CLIPBOARD_TIMEOUT_MS).toBe(45_000);
    expect(cleanup.timeoutMs).toBe(45_000);
  });

  it('takes a configured timeout instead of the default', async () => {
    const clipboard = createFakeClipboard();
    const scheduler = createFakeScheduler();
    const cleanup = createClipboardCleanup(clipboard, 30_000, scheduler.schedule);

    await cleanup.copy('fictional-bank-password');

    expect(scheduler.armed.map((entry) => entry.delayMs)).toEqual([30_000]);
  });

  it('clears the clipboard when it still holds the value Vault copied', async () => {
    const clipboard = createFakeClipboard();
    const scheduler = createFakeScheduler();
    const cleanup = createClipboardCleanup(clipboard, undefined, scheduler.schedule);

    await cleanup.copy('fictional-bank-password');
    await scheduler.fireAll();

    expect(clipboard.clears).toBe(1);
    expect(clipboard.text).toBe('');
  });

  it('leaves a value the user copied from somewhere else', async () => {
    const clipboard = createFakeClipboard();
    const scheduler = createFakeScheduler();
    const cleanup = createClipboardCleanup(clipboard, undefined, scheduler.schedule);

    await cleanup.copy('fictional-bank-password');
    // The user has alt-tabbed and copied something else before the timer comes.
    clipboard.text = 'a value from another application';
    await scheduler.fireAll();

    expect(clipboard.clears).toBe(0);
    expect(clipboard.text).toBe('a value from another application');
  });

  it('leaves a clipboard holding no text', async () => {
    const clipboard = createFakeClipboard();
    const scheduler = createFakeScheduler();
    const cleanup = createClipboardCleanup(clipboard, undefined, scheduler.schedule);

    await cleanup.copy('fictional-bank-password');
    clipboard.text = '';
    await scheduler.fireAll();

    expect(clipboard.clears).toBe(0);
  });

  it('aims only at the newest copy when two are made', async () => {
    const clipboard = createFakeClipboard();
    const scheduler = createFakeScheduler();
    const cleanup = createClipboardCleanup(clipboard, undefined, scheduler.schedule);

    await cleanup.copy('first-fictional-password');
    await cleanup.copy('second-fictional-password');

    // The first request is cancelled rather than left to clear the newer value,
    // and the survivor clears only the second one.
    expect(scheduler.armed.filter((entry) => entry.cancelled)).toHaveLength(1);
    await scheduler.fireAll();

    expect(clipboard.clears).toBe(1);
    expect(clipboard.text).toBe('');
  });

  it('does nothing when a cleanup is superseded while its read is in flight', async () => {
    const clipboard = createFakeClipboard();
    const scheduler = createFakeScheduler();
    const cleanup = createClipboardCleanup(clipboard, undefined, scheduler.schedule);

    await cleanup.copy('fictional-bank-password');
    const stale = scheduler.armed[0];
    expect(stale).toBeDefined();

    // Re-arm by hand so a new copy can be made *during* the stale timer's awaited
    // read, which is the one interleaving the generation check exists for.
    let markReadStarted: () => void = () => undefined;
    let releaseRead: () => void = () => undefined;
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve;
    });
    const readReleased = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    clipboard.readText = async (): Promise<string> => {
      markReadStarted();
      await readReleased;
      return 'fictional-bank-password';
    };

    const firing = stale?.run();
    await readStarted;
    await cleanup.copy('fictional-bank-password');
    releaseRead();
    await firing;

    // The stale run found itself superseded, so it cleared nothing; the newer
    // timer is still live and is the only one that may clear.
    expect(clipboard.clears).toBe(0);
    expect(scheduler.armed.filter((entry) => !entry.cancelled)).toHaveLength(1);
  });

  it('arms nothing when the clipboard refuses the write', async () => {
    const clipboard = createFakeClipboard();
    clipboard.refuseWrite = true;
    const scheduler = createFakeScheduler();
    const cleanup = createClipboardCleanup(clipboard, undefined, scheduler.schedule);

    await expect(cleanup.copy('fictional-bank-password')).rejects.toThrow(/refused the write/);
    expect(scheduler.armed).toHaveLength(0);

    await scheduler.fireAll();
    expect(clipboard.clears).toBe(0);
  });

  it('keeps an earlier cleanup when a later write fails', async () => {
    const clipboard = createFakeClipboard();
    const scheduler = createFakeScheduler();
    const cleanup = createClipboardCleanup(clipboard, undefined, scheduler.schedule);

    await cleanup.copy('first-fictional-password');
    clipboard.refuseWrite = true;
    await expect(cleanup.copy('second-fictional-password')).rejects.toThrow();

    // The value still on the clipboard is the first one, so its cleanup still runs.
    clipboard.refuseWrite = false;
    await scheduler.fireAll();
    expect(clipboard.clears).toBe(1);
  });

  it('leaves contents it cannot read alone', async () => {
    const clipboard = createFakeClipboard('fictional-bank-password');
    clipboard.refuseRead = true;
    const scheduler = createFakeScheduler();
    const cleanup = createClipboardCleanup(clipboard, undefined, scheduler.schedule);

    await cleanup.copy('fictional-bank-password');
    await expect(scheduler.fireAll()).resolves.toBeUndefined();

    expect(clipboard.clears).toBe(0);
    expect(clipboard.text).toBe('fictional-bank-password');
  });

  it('swallows a clear the clipboard refuses', async () => {
    const clipboard = createFakeClipboard();
    const scheduler = createFakeScheduler();
    const cleanup = createClipboardCleanup(clipboard, undefined, scheduler.schedule);

    await cleanup.copy('fictional-bank-password');
    clipboard.refuseClear = true;

    await expect(scheduler.fireAll()).resolves.toBeUndefined();
    expect(clipboard.text).toBe('fictional-bank-password');
  });

  it('fires once and does not repeat on a second pass', async () => {
    const clipboard = createFakeClipboard();
    const scheduler = createFakeScheduler();
    const cleanup = createClipboardCleanup(clipboard, undefined, scheduler.schedule);

    await cleanup.copy('fictional-bank-password');
    const entry = scheduler.armed[0];
    await entry?.run();
    await entry?.run();

    expect(clipboard.clears).toBe(1);
  });

  it('drops the scheduled clear on quit without touching the clipboard', async () => {
    const clipboard = createFakeClipboard();
    const scheduler = createFakeScheduler();
    const cleanup = createClipboardCleanup(clipboard, undefined, scheduler.schedule);

    await cleanup.copy('fictional-bank-password');
    cleanup.cancelPending();
    await scheduler.fireAll();

    expect(clipboard.clears).toBe(0);
    expect(clipboard.text).toBe('fictional-bank-password');
    expect(scheduler.armed.every((entry) => entry.cancelled)).toBe(true);
  });
});
