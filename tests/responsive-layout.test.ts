import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMPACT_MAX_WIDTH, detailPane, rowPress } from '../src/renderer/src/lib/responsive-layout';

// The renderer decides which work pane to show and the stylesheet decides when a
// window is narrow enough to need one. Neither side can see the other, so these
// checks pin down the shared contract: the pane rule itself, and the breakpoint
// the rule is written against.

const projectRoot = path.resolve(fileURLToPath(import.meta.url), '../..');
const componentsCss = readFileSync(
  path.join(projectRoot, 'src', 'renderer', 'src', 'styles', 'components.css'),
  'utf8',
).replace(/\r\n/g, '\n');

const mediaWidths = [...componentsCss.matchAll(/@media \(max-width: (\d+)px\)/g)].map((match) =>
  Number(match[1]),
);
const lastQuery = componentsCss.lastIndexOf(
  `@media (max-width: ${mediaWidths[mediaWidths.length - 1]}px)`,
);
const compactBlock = componentsCss.slice(lastQuery);

describe('compact pane rule', () => {
  it('shows the details only while a record is selected', () => {
    expect(detailPane('details', true)).toBe('details');
  });

  it('falls back to the list when the selection disappears', () => {
    // A delete, a deselection or a filter that hides the record must not leave a
    // compact window on an empty panel with no way back.
    expect(detailPane('details', false)).toBe('list');
    expect(detailPane('list', false)).toBe('list');
  });

  it('never overrides an explicit request for the list', () => {
    expect(detailPane('list', true)).toBe('list');
  });
});

describe('row press', () => {
  it('selects the pressed row and travels to its details', () => {
    expect(rowPress(null, 'a', 'list', true)).toEqual({ selectedId: 'a', pane: 'details' });
    expect(rowPress('b', 'a', 'details', false)).toEqual({ selectedId: 'a', pane: 'details' });
  });

  it('deselects the row whose details are showing, wide or compact', () => {
    expect(rowPress('a', 'a', 'details', false)).toEqual({ selectedId: null, pane: 'list' });
    expect(rowPress('a', 'a', 'details', true)).toEqual({ selectedId: null, pane: 'list' });
  });

  it('reopens the details for the row a compact window just came back from', () => {
    expect(rowPress('a', 'a', 'list', true)).toEqual({ selectedId: 'a', pane: 'details' });
  });

  it('leaves the wide window deselect rule untouched', () => {
    // A save selects the new record while the pane state is still the list, and
    // clicking that row must still clear it.
    expect(rowPress('a', 'a', 'list', false)).toEqual({ selectedId: null, pane: 'list' });
  });
});

describe('compact breakpoint', () => {
  it('is the narrowest media query in the stylesheet and matches the shared constant', () => {
    expect(mediaWidths.length).toBeGreaterThan(1);
    expect(mediaWidths[mediaWidths.length - 1]).toBe(COMPACT_MAX_WIDTH);
    expect(Math.min(...mediaWidths)).toBe(COMPACT_MAX_WIDTH);
  });

  it('collapses the shell to a sidebar and one work column', () => {
    expect(compactBlock).toMatch(
      /grid-template-columns:\s*var\(--panel-sidebar-width\)\s+minmax\(0,\s*1fr\);/,
    );
  });

  it('hides the inactive pane and reveals the way back', () => {
    expect(compactBlock).toMatch(
      /\.app-shell\[data-pane='list'\]\s+\.workspace-details,\s*\.app-shell\[data-pane='details'\]\s+\.workspace-list\s*\{\s*display: none;/,
    );
    expect(compactBlock).toMatch(/\.pane-back\s*\{\s*display: inline-flex;/);
  });
});
