import { contextBridge, ipcRenderer } from 'electron';
import type { CredentialCopyField, CredentialInput } from '../shared/credential';
import { VAULT_CHANNELS } from '../shared/ipc-channels';
import type { VaultApi } from '../shared/vault-api';

// The allowlisted renderer API. Only these named channels are reachable: no raw
// `ipcRenderer`, no channel chosen by the renderer, and no Node.js access.
// `readSecret` is the single method that returns a password, and only for one id
// the renderer already holds. `copy` sends an id and a field name and takes back
// an outcome, so the value the clipboard receives is never chosen here. Every
// payload is re-validated in the main process, so nothing here needs to be
// trusted.
const vaultApi: VaultApi = Object.freeze({
  list: () => ipcRenderer.invoke(VAULT_CHANNELS.credentialsList),
  create: (input: CredentialInput) => ipcRenderer.invoke(VAULT_CHANNELS.credentialsCreate, input),
  update: (id: string, input: CredentialInput) =>
    ipcRenderer.invoke(VAULT_CHANNELS.credentialsUpdate, { id, ...input }),
  remove: (id: string) => ipcRenderer.invoke(VAULT_CHANNELS.credentialsDelete, id),
  readSecret: (id: string) => ipcRenderer.invoke(VAULT_CHANNELS.credentialsReadSecret, id),
  setFavorite: (id: string, favorite: boolean) =>
    ipcRenderer.invoke(VAULT_CHANNELS.credentialsSetFavorite, { id, favorite }),
  copy: (id: string, field: CredentialCopyField) =>
    ipcRenderer.invoke(VAULT_CHANNELS.credentialsCopy, { id, field }),
});

contextBridge.exposeInMainWorld('vault', vaultApi);
