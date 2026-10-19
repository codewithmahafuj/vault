# Vault

A local, single-user credential manager for Windows. No server, no account,
no telemetry, no cloud sync. Your data and its encryption key stay on your
machine.

## Download (Windows 10/11, x64)

Get the latest installer from the
[Releases page](https://github.com/codewithmahafuj/vault/releases/latest).
It installs per-user and does not need administrator rights.

The installer is not code-signed, so Windows SmartScreen may warn on first
launch: click **More info**, then **Run anyway**. Before running it, verify the
SHA-256 shown in the release notes:

```powershell
certutil -hashfile "Vault-Setup-1.0.0-win-x64.exe" SHA256
```

## Important

- Your vault lives in `%APPDATA%\Vault`.
- There is no backup, export, import or sync in 1.0.0. If your drive fails,
  the data is lost. Copy that folder while Vault is closed to back it up. The
  backup restores only on the same Windows user account on the same machine —
  the key is bound to that account, so there is no way to move a vault to a
  different computer.
- No auto-update. Download new versions from the Releases page.
- Uninstalling keeps your data unless you explicitly confirm deletion.

## Security

- Credential fields are encrypted with AES-256-GCM.
- The data key is protected by Electron `safeStorage`, which uses the operating
  system's encryption facilities (on Windows, DPAPI). It is not stored in
  Windows Credential Manager.
- Encryption and database access run in the main process only.
- If the key is missing or unreadable, Vault exits instead of creating a
  replacement key or an empty vault.

## Development

Requires Node.js 24 or newer on Windows.

```powershell
npm ci
npm run dev
```

Checks and build:

```powershell
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run build
npm run dist    # creates release/Vault-Setup-<version>-win-x64.exe
```

## License

[MIT](LICENSE)
