import type { VaultErrorCode } from '../../../shared/vault-result';

// Whether a renderer without `window.vault` is a preview or a broken install.
// Fictional fixtures exist so the shell can be looked at without a vault, which
// is a development affordance; in a built app the same state means the preload
// bridge never attached, and presenting fixtures there would pass them off as
// the user's own accounts (architecture.md invariant 14).
export type DataSourceDecision = 'vault' | 'sample' | 'missing-bridge';

export function dataSourceDecision(
  bridgePresent: boolean,
  developmentRun: boolean,
): DataSourceDecision {
  if (bridgePresent) {
    return 'vault';
  }
  return developmentRun ? 'sample' : 'missing-bridge';
}

export interface FailureCopy {
  readonly title: string;
  readonly description: string;
}

// A withheld write action is the same fact as the failure screen above it: this
// window has no vault behind it. In a built app that is a broken install, not a
// demonstration, so the wording names the missing connection and never calls the
// window a preview or a holder of sample data.
export const writeUnavailableCopy = {
  actionLabel: 'Add Password (no vault attached)',
  reason: 'Vault is not connected to your data, so nothing can be saved.',
} as const;

// Failure copy never quotes the underlying error: a driver message can name a
// file path or a record.
export function listFailureCopy(failure: VaultErrorCode | 'missing-bridge'): FailureCopy {
  if (failure === 'missing-bridge') {
    return {
      title: 'Vault could not connect to your data',
      description:
        'Vault could not reach its credential service, so nothing was read or changed. ' +
        'Close Vault and open it again.',
    };
  }
  if (failure === 'storage-error') {
    return {
      title: 'Could not open your vault',
      description:
        'The local database could not be read. Close any other copy of Vault and try again.',
    };
  }
  return {
    title: 'Could not open your vault',
    description: 'Vault could not read your saved accounts. Try again.',
  };
}
