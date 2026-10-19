// What the main process needs from the system clipboard, declared structurally so
// the cleanup rule is testable without Electron. Electron 44 models these calls on
// the W3C clipboard: writing and reading back are promises, clearing is not.
// Reading needs no focused window in this process, which is the whole reason the
// timer lives here instead of in the renderer.
export interface ClipboardPort {
  readText(): Promise<string>;
  writeText(value: string): Promise<void>;
  clear(): void;
}

export type ClipboardTimerHandle = { cancel(): void };

// A scheduled cleanup reads the clipboard back, so the callback it runs can be
// asynchronous. A scheduler that awaits it can be tested for what the clipboard
// looks like afterwards.
export type ClipboardScheduler = (
  run: () => void | Promise<void>,
  delayMs: number,
) => ClipboardTimerHandle;

const scheduleAfterDelay: ClipboardScheduler = (run, delayMs) => {
  const id = setTimeout(() => {
    void run();
  }, delayMs);
  return { cancel: () => clearTimeout(id) };
};

// Approved on 2026-10-12 as the v1 default. Long enough to paste into another
// application, short enough that a forgotten copy does not sit out the session.
// It is a constructor argument rather than a setting because `Settings` is not
// part of v1.
export const DEFAULT_CLIPBOARD_TIMEOUT_MS = 45_000;

export interface ClipboardCleanup {
  readonly timeoutMs: number;
  // Writes the value and re-arms the cleanup for it. A rejected write leaves
  // nothing pending, so nothing can be cleared that this copy did not put there.
  copy(value: string): Promise<void>;
  // Drops the pending timer without touching the clipboard: the app is going away,
  // and a clear at the wrong moment would take a value the user may still be
  // pasting elsewhere.
  cancelPending(): void;
}

// One pending value at a time, which is what a clipboard can hold. A second copy
// replaces the first request, so the timer always aims at the value Vault put
// there last.
//
// The value is kept as a string, so it cannot be zeroed; it is held for at most one
// timeout, and only for the field the user just copied (architecture.md,
// Clipboard). The generation counter is what makes "the value Vault put there
// last" mean something across an awaited read: a cleanup that comes back to find
// itself superseded does nothing at all.
export function createClipboardCleanup(
  clipboard: ClipboardPort,
  timeoutMs: number = DEFAULT_CLIPBOARD_TIMEOUT_MS,
  schedule: ClipboardScheduler = scheduleAfterDelay,
): ClipboardCleanup {
  let pending: string | undefined;
  let timer: ClipboardTimerHandle | undefined;
  let generation = 0;

  async function clearIfStillOurs(owned: number, value: string): Promise<void> {
    if (owned !== generation || pending !== value) {
      return;
    }
    pending = undefined;

    let current: string;
    try {
      current = await clipboard.readText();
    } catch {
      // A clipboard that cannot be read is a clipboard whose contents are unknown,
      // and unknown contents are not ours to erase.
      return;
    }
    if (owned !== generation) {
      return;
    }
    // The comparison is exact: a clipboard holding anything else --- a value from
    // another application, or no text at all --- is left as the user left it.
    if (current !== value) {
      return;
    }
    try {
      clipboard.clear();
    } catch {
      // Best effort: a clipboard that refuses the clear keeps the value, and the
      // user has been told cleanup cannot be promised.
    }
  }

  return {
    timeoutMs,
    async copy(value: string): Promise<void> {
      await clipboard.writeText(value);
      timer?.cancel();
      pending = value;
      const owned = (generation += 1);
      timer = schedule(() => clearIfStillOurs(owned, value), timeoutMs);
    },
    cancelPending(): void {
      generation += 1;
      timer?.cancel();
      timer = undefined;
      pending = undefined;
    },
  };
}
