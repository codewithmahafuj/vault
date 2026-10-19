// The complete allowlist of IPC channels. Both sides import these constants, so
// a channel that is not declared here cannot be reached from the renderer.
export const VAULT_CHANNELS = {
  credentialsList: 'credentials:list',
  credentialsCreate: 'credentials:create',
  credentialsUpdate: 'credentials:update',
  credentialsDelete: 'credentials:delete',
  // One already-selected credential's password, so a secret never travels in a
  // list payload. Approved on 2026-10-11 for the credential-form unit.
  credentialsReadSecret: 'credentials:read-secret',
  // Flips one flag on one already-selected credential. Approved on 2026-10-11
  // for the details-panel unit: the star needs a write path, and going through
  // `credentials:update` would re-encrypt all four fields to change one of them.
  credentialsSetFavorite: 'credentials:set-favorite',
  // Puts one field of one already-selected credential on the system clipboard.
  // Approved on 2026-10-12 for the clipboard-cleanup remediation: the timer that
  // clears the value has to run where a clipboard can be *read* back, and that
  // is the main process --- Chromium only lets a focused document read its own
  // clipboard, so a renderer could not check what it copied before clearing it.
  // The reply carries no value: main reads the record itself.
  credentialsCopy: 'credentials:copy',
} as const;

export type VaultChannel = (typeof VAULT_CHANNELS)[keyof typeof VAULT_CHANNELS];
