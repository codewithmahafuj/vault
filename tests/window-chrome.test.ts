import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Electron builds a default File/Edit/View/Window menu for a Windows window when
// the app never says otherwise, and nothing in the test suite can see that bar ---
// the renderer, the storage and the IPC contracts all pass with it present. So
// this file checks the entry point's own source: the menu has to be removed, and
// it has to be removed before the first window is built, or the bar is drawn and
// then taken away again.

const projectRoot = path.resolve(fileURLToPath(import.meta.url), '../..');
const entry = readFileSync(path.join(projectRoot, 'src', 'main', 'index.ts'), 'utf8').replace(
  /\r\n/g,
  '\n',
);

describe('native application menu', () => {
  it("removes Electron's default menu outright", () => {
    expect(entry).toMatch(/Menu\.setApplicationMenu\(null\);/);
  });

  it('does it before the first window exists', () => {
    expect(entry.indexOf('Menu.setApplicationMenu(null)')).toBeLessThan(
      entry.indexOf('createWindow();'),
    );
  });

  it('builds no menu template anywhere in the main process', () => {
    expect(entry).not.toMatch(/Menu\.buildFromTemplate|new Menu\(/);
    expect(entry).not.toMatch(/setMenuBarVisibility|autoHideMenuBar/);
  });
});
