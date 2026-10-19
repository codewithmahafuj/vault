import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The UI font is a local file, not a web font, for two reasons that no other test
// in this suite would catch: the packaged app has no network stack to fetch from,
// and the CSP grants `font-src 'self'` only, so a remote or inlined `data:` font is
// silently blocked and the app quietly falls back to Segoe UI. A stylesheet can
// therefore look correct and render the wrong typeface. These checks read the
// shipped source and the font files themselves.

const projectRoot = path.resolve(fileURLToPath(import.meta.url), '../..');
const stylesDir = path.join(projectRoot, 'src', 'renderer', 'src', 'styles');

const stylesheets = ['tokens.css', 'global.css', 'components.css'].map((name) => ({
  name,
  source: readFileSync(path.join(stylesDir, name), 'utf8').replace(/\r\n/g, '\n'),
}));

const fontFaces = stylesheets.flatMap(({ name, source }) =>
  [...source.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((block) => ({
    stylesheet: name,
    family: /font-family:\s*'([^']+)'/.exec(block[1] ?? '')?.[1] ?? '',
    weight: /font-weight:\s*([\d\s]+);/.exec(block[1] ?? '')?.[1]?.trim() ?? '',
    sources: [...(block[1] ?? '').matchAll(/url\('([^']+)'\)/g)].map((url) => url[1] ?? ''),
  })),
);

describe('bundled UI font', () => {
  it('declares one family with a face for every weight the app uses', () => {
    expect(fontFaces.length).toBeGreaterThanOrEqual(4);
    expect(new Set(fontFaces.map((face) => face.family))).toEqual(new Set(['Geist']));
    expect(fontFaces.map((face) => face.weight).sort()).toEqual(['400', '500', '600', '700']);
  });

  it('loads each face from a file that exists next to the stylesheet', () => {
    for (const face of fontFaces) {
      expect(face.sources.length).toBe(1);
      const target = path.resolve(stylesDir, face.sources[0] ?? '');
      expect(existsSync(target), `${face.stylesheet} -> ${face.sources[0]}`).toBe(true);
      expect(statSync(target).size).toBeGreaterThan(1024);
    }
  });

  it('asks for no font over the network and inlines none', () => {
    const urls = fontFaces.flatMap((face) => face.sources);
    expect(urls.length).toBeGreaterThanOrEqual(4);
    for (const url of urls) {
      expect(url).not.toMatch(/^https?:/);
      expect(url).not.toMatch(/^data:/);
      expect(url.startsWith('./fonts/'), url).toBe(true);
    }
  });

  it('keeps Geist first in the UI stack with a local fallback behind it', () => {
    const tokens = stylesheets.find((sheet) => sheet.name === 'tokens.css');
    const fontSans = /--font-sans:\s*([^;]+);/.exec(tokens?.source ?? '')?.[1] ?? '';
    expect(fontSans.startsWith("'Geist'"), fontSans).toBe(true);
    expect(fontSans).toContain("'Segoe UI'");
    expect(fontSans).toContain('sans-serif');
  });

  it('leaves no reference to the font that was replaced', () => {
    for (const sheet of stylesheets) {
      expect(sheet.source, sheet.name).not.toContain('Inter');
    }
  });
});
