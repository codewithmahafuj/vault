import {
  validateCredentialCopy,
  validateCredentialId,
  validateCredentialInput,
  validateCredentialUpdate,
  validateFavoriteUpdate,
} from '../../shared/credential-validation';
import { VAULT_CHANNELS } from '../../shared/ipc-channels';
import { failed } from '../../shared/vault-result';
import type { CredentialCopies } from '../clipboard/credential-copies';
import type { CredentialService } from '../credential-service';

// The part of `ipcMain` these handlers need, declared structurally so the
// boundary logic is testable without an Electron runtime.
export interface IpcRegistrar {
  handle(channel: string, listener: (event: unknown, payload: unknown) => unknown): void;
}

// Every payload arrives as `unknown` and is re-validated here even when the
// renderer already checked it: the renderer is bundled, but still untrusted.
// An invalid payload never reaches the service.
//
// `copies` is a separate collaborator because putting a value on the system
// clipboard is not a storage operation: it writes nothing the vault keeps, and it
// owns the timer that clears the value again.
export function registerCredentialIpc(
  registrar: IpcRegistrar,
  service: CredentialService,
  copies: CredentialCopies,
): void {
  registrar.handle(VAULT_CHANNELS.credentialsList, () => service.list());

  registrar.handle(VAULT_CHANNELS.credentialsCreate, (_event, payload) => {
    const input = validateCredentialInput(payload);
    return input === undefined ? failed('invalid-credential') : service.create(input);
  });

  registrar.handle(VAULT_CHANNELS.credentialsUpdate, (_event, payload) => {
    const update = validateCredentialUpdate(payload);
    return update === undefined
      ? failed('invalid-credential')
      : service.update(update.id, update.input);
  });

  registrar.handle(VAULT_CHANNELS.credentialsDelete, (_event, payload) => {
    const id = validateCredentialId(payload);
    return id === undefined ? failed('invalid-credential') : service.remove(id);
  });

  // Same shape as delete: a bare id in, a `CredentialSecret` or a code out. The
  // id is re-validated here because this is the channel that returns a password.
  registrar.handle(VAULT_CHANNELS.credentialsReadSecret, (_event, payload) => {
    const id = validateCredentialId(payload);
    return id === undefined ? failed('invalid-credential') : service.readSecret(id);
  });

  // `{ id, favorite }` in, the updated summary or a code out. The flag is
  // checked as a real boolean, so an absent or stringy one is refused at the
  // boundary instead of being guessed at and silently rewriting the row.
  registrar.handle(VAULT_CHANNELS.credentialsSetFavorite, (_event, payload) => {
    const update = validateFavoriteUpdate(payload);
    return update === undefined
      ? failed('invalid-credential')
      : service.setFavorite(update.id, update.favorite);
  });

  // `{ id, field }` in, an outcome and no value out. The field is checked against
  // the two copyable names so a payload cannot name something else and have main
  // read it. This is the one handler that is async, because Electron's clipboard
  // write is a promise.
  registrar.handle(VAULT_CHANNELS.credentialsCopy, async (_event, payload) => {
    const request = validateCredentialCopy(payload);
    return request === undefined ? failed('invalid-credential') : copies.copy(request);
  });
}
