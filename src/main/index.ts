import path from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  session,
} from 'electron';
import { contentSecurityPolicy } from './browser-policy';
import { createClipboardCleanup } from './clipboard/clipboard-cleanup';
import type { ClipboardCleanup, ClipboardPort } from './clipboard/clipboard-cleanup';
import { createCredentialCopies } from './clipboard/credential-copies';
import { createCredentialService } from './credential-service';
import { registerCredentialIpc } from './ipc/credential-ipc';
import { denyAllPermissions } from './permissions';
import { createSafeStorageProtection } from './security/key-protection';
import {
  RENDERER_LOAD_FAILURE_MESSAGE,
  STARTUP_FAILURE_TITLE,
  UNEXPECTED_STARTUP_FAILURE_MESSAGE,
  startupFailureMessage,
} from './startup-failure';
import { openVault } from './vault';
import type { VaultHandle } from './vault';

app.setName('Vault');

const isDev = !app.isPackaged;

// The three clipboard calls Vault makes, in the shape the cleanup logic asks for.
// Electron answers these in the main process without a focused window, which is
// why the copy and its timed clear live here rather than in the renderer.
const systemClipboard: ClipboardPort = {
  readText: () => clipboard.readText(),
  writeText: (value: string) => clipboard.writeText(value),
  clear: () => {
    clipboard.clear();
  },
};

let mainWindow: BrowserWindow | undefined;
let vault: VaultHandle | undefined;
let clipboardCleanup: ClipboardCleanup | undefined;

function isSameOrigin(currentUrl: string, targetUrl: string): boolean {
  try {
    return new URL(currentUrl).origin === new URL(targetUrl).origin;
  } catch {
    return false;
  }
}

function applyContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy(isDev)],
      },
    });
  });
}

// The single window runs on the default session, so one pair of handlers covers
// every document it can load. This is the Electron session adapted to the policy
// in `permissions.ts`; the policy itself holds no Electron types.
function denyWebPermissions(): void {
  const { defaultSession } = session;
  denyAllPermissions({
    setPermissionCheckHandler: (handler) => {
      defaultSession.setPermissionCheckHandler((_webContents, permission) => handler(permission));
    },
    setPermissionRequestHandler: (handler) => {
      defaultSession.setPermissionRequestHandler((_webContents, permission, respond) => {
        handler(permission, respond);
      });
    },
  });
}

// A failure that leaves nothing safe to show is closed with one blocking
// message and an exit, so the user never has to guess whether the app is still
// starting. `showErrorBox` blocks on Windows, so the exit follows the message.
function failClosed(message: string): void {
  dialog.showErrorBox(STARTUP_FAILURE_TITLE, message);
  app.exit(1);
}

// The vault is opened before any window exists, so a key or storage failure is
// fatal and closed: no window, no credential channel, and nothing written.
function openVaultOrExit(): boolean {
  try {
    vault = openVault(app.getPath('userData'), createSafeStorageProtection(safeStorage));
  } catch (error) {
    failClosed(startupFailureMessage(error));
    return false;
  }

  clipboardCleanup = createClipboardCleanup(systemClipboard);
  registerCredentialIpc(
    ipcMain,
    createCredentialService(vault.credentials),
    createCredentialCopies(vault.credentials, clipboardCleanup),
  );
  return true;
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    // The frame floor behind a ~700px page, which is where the renderer drops to
    // one work pane. Above 900 the three columns each still have room; between
    // these two the compact layout is the only one that keeps the card readable.
    minWidth: 720,
    minHeight: 560,
    title: 'Vault',
    // Mirrors --bg-base; the native window color paints before the DOM does.
    backgroundColor: '#F7F7F8',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  mainWindow = win;
  win.once('closed', () => {
    mainWindow = undefined;
  });

  win.on('ready-to-show', () => {
    // Maximised before the window is on screen, so there is no visible resize
    // from the `1200x760` default. Those dimensions stay the restored size when
    // the user un-maximises.
    win.maximize();
    win.show();
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isSameOrigin(win.webContents.getURL(), targetUrl)) {
      event.preventDefault();
    }
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  // A load that cannot finish leaves the window hidden (it only shows on
  // `ready-to-show`), so the failure is said out loud instead of leaving the user
  // with a blank frame or no frame at all. The message is fixed: the URL it
  // failed on is a local path.
  const load =
    isDev && devServerUrl !== undefined
      ? win.loadURL(devServerUrl)
      : win.loadFile(path.join(__dirname, '../renderer/index.html'));
  load.catch(() => {
    failClosed(RENDERER_LOAD_FAILURE_MESSAGE);
  });
}

// Taken before app ready, so a second launch never reaches the database: one
// file must have exactly one writer (architecture.md invariant 15).
if (!app.requestSingleInstanceLock()) {
  // `exit` rather than `quit`: this process owns nothing to clean up, and it
  // must not emit the window or vault shutdown paths.
  app.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  // Startup has no window to report into yet, so anything that throws here ---
  // the CSP hook, the vault open, or the window itself --- closes the app on one
  // fixed message rather than leaving a process running with nothing to look at.
  void app
    .whenReady()
    .then(() => {
      denyWebPermissions();
      applyContentSecurityPolicy();
      // Vault adds no menu items, so Electron's default File/Edit/View/Window menu
      // is a bar of shortcuts the app never intended to offer. `null` removes it
      // from every window; text-field cut/copy/paste keeps working because those
      // come from Chromium, not from the menu.
      Menu.setApplicationMenu(null);
      if (openVaultOrExit()) {
        createWindow();
      }
    })
    .catch(() => {
      failClosed(UNEXPECTED_STARTUP_FAILURE_MESSAGE);
    });

  app.on('window-all-closed', () => {
    // Going away drops the scheduled clear rather than running it: a user who
    // closes Vault mid-paste would otherwise find the value they were typing into
    // another application gone. The copied value stays where the user left it.
    clipboardCleanup?.cancelPending();
    clipboardCleanup = undefined;
    vault?.close();
    vault = undefined;
    app.quit();
  });
}
