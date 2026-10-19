import { useCallback, useEffect, useState } from 'react';
import type { CredentialSummary } from '../../../shared/credential';
import type { VaultErrorCode } from '../../../shared/vault-result';
import type { VaultApi } from '../../../shared/vault-api';
import { mockCredentials } from '../data/mock-credentials';
import { dataSourceDecision } from '../lib/data-source';
import { callVault } from '../lib/vault-bridge';

export type CredentialSource = 'vault' | 'sample';
export type CredentialStatus = 'loading' | 'ready' | 'failed';

// A bridge that answers with a code carries a `VaultErrorCode`. A renderer with
// no bridge to ask is a different problem and gets its own copy.
export type CredentialFailure = VaultErrorCode | 'missing-bridge';

export interface CredentialsState {
  readonly credentials: readonly CredentialSummary[];
  readonly status: CredentialStatus;
  readonly source: CredentialSource;
  readonly failure: CredentialFailure | null;
  readonly reload: () => Promise<void>;
}

// The renderer never touches SQLite or Node APIs. Whether a missing bridge means
// "preview shell" or "broken install" is decided by `dataSourceDecision`, and a
// bridge that answers with an error code is reported as a failure and never
// dressed up as an empty vault.
export function useCredentials(): CredentialsState {
  const [credentials, setCredentials] = useState<readonly CredentialSummary[]>([]);
  const [status, setStatus] = useState<CredentialStatus>('loading');
  const [source, setSource] = useState<CredentialSource>('sample');
  const [failure, setFailure] = useState<CredentialFailure | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    const api: VaultApi | undefined = window.vault;
    const decision = dataSourceDecision(api !== undefined, import.meta.env.DEV);

    if (decision === 'sample') {
      setCredentials(mockCredentials);
      setSource('sample');
      setFailure(null);
      setStatus('ready');
      return;
    }

    setStatus('loading');
    if (decision === 'missing-bridge' || api === undefined) {
      setCredentials([]);
      setFailure('missing-bridge');
      setStatus('failed');
      return;
    }

    const result = await callVault(() => api.list());
    if (result.ok) {
      setCredentials(result.value);
      setSource('vault');
      setFailure(null);
    } else {
      setCredentials([]);
      setSource('vault');
      setFailure(result.code);
    }
    setStatus(result.ok ? 'ready' : 'failed');
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { credentials, status, source, failure, reload };
}
