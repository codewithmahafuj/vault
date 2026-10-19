# Uninstall behaviour for the Vault Windows installer.
#
# electron-builder compiles this file into both the installer and the
# uninstaller pass, and templates/nsis/uninstaller.nsh inserts customUnInstall
# at the start of the uninstall section --- after the "is Vault still running"
# check and before a single installed file is removed.
#
# The vault is not inside the program directory. It is the Electron user-data
# directory, $APPDATA\${APP_FILENAME} (%APPDATA%\Vault), which holds vault.db
# and the DPAPI-protected data key alongside the Chromium profile data that
# lives in the same folder. Deleting it is unrecoverable, so the rules here are:
#
#   - nsis.deleteAppDataOnUninstall is false, so electron-builder's automatic
#     cleanup is not in the build at all and nothing is deleted by default;
#   - an interactive uninstall asks, with No as the default button;
#   - a silent uninstall --- an upgrade, or Uninstall /S --- never asks and
#     never reaches the delete, so upgrading preserves the database and the
#     key that matches it;
#   - the only path removed is the Vault data directory named in the prompt.

!macro customUnInstall
  ${ifNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
      "Vault keeps your saved credentials and its local settings in this folder:$\r$\n$\r$\n  $APPDATA\${APP_FILENAME}$\r$\n$\r$\nDeleting it removes every credential and the key that decrypts them. This cannot be undone: Vault cannot recover the data afterwards, and not even a reinstall can.$\r$\n$\r$\nChoose No to uninstall Vault and keep this folder.$\r$\n$\r$\nDo you want to delete your Vault data as well?" \
      IDNO keepVaultData
    RMDir /r "$APPDATA\${APP_FILENAME}"
    keepVaultData:
  ${endif}
!macroend
