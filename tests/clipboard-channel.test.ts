import { readdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Architecture.md invariant 17 and the clipboard rules in code-standards.md both
// say the same thing: a copy happens in the main process, because only that
// process can read the clipboard back and clear the value again. A renderer that
// writes the clipboard itself is invisible to every other test in this suite ---
// the copy would appear to work, the UI would say `Copied`, and nothing would ever
// clean it up. So this file checks the source of the rule rather than its
// behaviour: it fails if a clipboard write ever appears on the wrong side of the
// bridge again.

const projectRoot = path.resolve(fileURLToPath(import.meta.url), '../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const rendererSources = sourceFiles(path.join(projectRoot, 'src', 'renderer'));
const mainSources = sourceFiles(path.join(projectRoot, 'src', 'main'));

describe('clipboard write ownership', () => {
  it('finds renderer source to check at all', () => {
    expect(rendererSources.length).toBeGreaterThan(10);
    expect(mainSources.length).toBeGreaterThan(10);
  });

  it.each(rendererSources.map((file) => [path.relative(projectRoot, file)]))(
    'never touches a clipboard from the renderer (%s)',
    (relative) => {
      const source = readFileSync(path.join(projectRoot, relative), 'utf8');

      expect(source).not.toContain('navigator.clipboard');
      expect(source).not.toContain('document.execCommand');
      expect(source).not.toContain('electron.clipboard');
    },
  );

  it('writes the system clipboard nowhere but the main process clipboard module', () => {
    const writers = mainSources
      .filter((file) => readFileSync(file, 'utf8').includes('.writeText('))
      .map((file) => path.relative(projectRoot, file).replace(/\\/g, '/'))
      .sort();

    // `clipboard-cleanup.ts` writes through the port it is given; `index.ts` is the
    // adapter that hands it Electron's clipboard. Nothing else may hold that call.
    expect(writers).toEqual(
      ['src/main/clipboard/clipboard-cleanup.ts', 'src/main/index.ts'].sort(),
    );
  });

  it('imports Electron clipboard in the main process only', () => {
    const rendererClipboardImports = rendererSources.filter((file) =>
      /from 'electron'/.test(readFileSync(file, 'utf8')),
    );

    expect(rendererClipboardImports).toEqual([]);
  });

  it('hands the form a copy callback instead of letting it reach the clipboard', () => {
    const modal = readFileSync(
      path.join(projectRoot, 'src/renderer/src/components/CredentialFormModal.tsx'),
      'utf8',
    );

    expect(modal).toContain('onCopyPassword');
    expect(modal).not.toContain('navigator.clipboard');
  });
});
