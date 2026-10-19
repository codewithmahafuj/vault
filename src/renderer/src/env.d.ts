import type { VaultApi } from '../../shared/vault-api';

declare global {
  interface Window {
    // Optional: the bridge is absent whenever the renderer runs without the
    // preload script, which is how the static shell is previewed.
    readonly vault?: VaultApi;
  }
}

export {};
