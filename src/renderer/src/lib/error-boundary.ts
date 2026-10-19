// The rules a React error boundary has to get right, kept out of the component
// so they can be read and tested on their own: what the screen may say when a
// render throws, and what the log may carry.

export interface BoundaryCopy {
  readonly title: string;
  readonly description: string;
}

// A view that failed to draw tells the user nothing about their data, so the
// copy says what is true instead: nothing was written, the vault is still on
// disk, and the way back is the button under this sentence. It names no value,
// no file and no exception --- a React render error quotes the thing it choked
// on, and in a credential app that thing can be a password.
export const BOUNDARY_COPY: BoundaryCopy = {
  title: 'Vault could not show this screen',
  description:
    'Nothing was saved or changed. Your accounts are still on this computer. ' +
    'Reload Vault, and if it fails the same way again, close it and open it once more.',
};

// The one control the fallback offers. Reloading re-draws the window from the
// vault the main process already holds open; it cannot write, and if the failure
// was in the data rather than in a one-off draw, the boundary simply catches it
// again.
export const BOUNDARY_ACTION_LABEL = 'Reload Vault';

// What a single crash may reach the log. The failure's *kind* is always safe:
// `TypeError`, `RangeError`, and so on say how the draw failed without saying
// what was on screen. The message is kept only for a development run, where the
// values a render can quote are fictional fixtures rather than the user's
// secrets. This is the whole reason the boundary exists as a component with a
// rule it can delegate to, instead of a `console.error(error)`.
export function safeFailureLogLine(error: unknown, developmentRun: boolean): string {
  const kind = error instanceof Error ? error.name : 'Unknown';
  if (!developmentRun) {
    return `vault: a view failed to render (${kind})`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `vault: a view failed to render (${kind}: ${message})`;
}
