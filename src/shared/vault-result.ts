export type VaultErrorCode =
  'invalid-credential' | 'duplicate-credential' | 'not-found' | 'storage-error';

// One shape for every credential operation. The error branch carries a fixed
// code rather than a message, stack, SQL, or file path: the renderer decides
// what to say, and nothing privileged can leak through this boundary.
export type VaultResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: VaultErrorCode };

export function succeeded<T>(value: T): VaultResult<T> {
  return { ok: true, value };
}

export function failed<T>(code: VaultErrorCode): VaultResult<T> {
  return { ok: false, code };
}
