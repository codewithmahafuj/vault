import { failed } from '../../../shared/vault-result';
import type { VaultResult } from '../../../shared/vault-result';

// The bridge contract is a `VaultResult`, but `ipcRenderer.invoke` can still
// reject: the window can be torn down mid-call, the reply can fail to
// serialize, and main can go away while a request is queued. A rejection thrown
// at a mutation's `await` would strand that mutation's pending state and leak
// the driver's message into an unhandled rejection, so every call goes through
// here and lands in the failure path the UI already knows how to show.
export async function callVault<T>(
  request: () => Promise<VaultResult<T>>,
): Promise<VaultResult<T>> {
  try {
    return await request();
  } catch {
    return failed('storage-error');
  }
}
