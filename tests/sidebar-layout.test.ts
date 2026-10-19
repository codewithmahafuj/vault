import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A column flex item whose height comes from a token is still a shrink candidate
// unless it says otherwise, so a long Services list used to squash the search
// field to 24px and every service row to 22px instead of scrolling. The
// stylesheet is the only place this is decided, so it is checked here.

const projectRoot = path.resolve(fileURLToPath(import.meta.url), '../..');
const componentsCss = readFileSync(
  path.join(projectRoot, 'src', 'renderer', 'src', 'styles', 'components.css'),
  'utf8',
).replace(/\r\n/g, '\n');
const tokensCss = readFileSync(
  path.join(projectRoot, 'src', 'renderer', 'src', 'styles', 'tokens.css'),
  'utf8',
).replace(/\r\n/g, '\n');

/** The first top-level rule body for a bare class selector. */
function ruleBody(className: string): string {
  const match = componentsCss.match(new RegExp(`^\\.${className}\\s*\\{([^}]*)\\}`, 'm'));
  if (match === null) throw new Error(`no top-level .${className} rule`);
  return match[1] ?? '';
}

describe('sidebar vertical fit', () => {
  it('keeps every fixed-height block out of the shrink race', () => {
    for (const className of [
      'brand',
      'search-field',
      'nav',
      'nav-item',
      'section-label',
      'service-item',
      'sidebar-footer',
    ]) {
      expect(ruleBody(className), `.${className} must declare flex: none`).toMatch(/flex:\s*none;/);
    }
  });

  it('gives the Services list the leftover height and lets it scroll', () => {
    expect(ruleBody('services-block')).toMatch(/flex:\s*1;/);
    expect(ruleBody('services-block')).toMatch(/min-height:\s*0;/);
    expect(ruleBody('services')).toMatch(/flex:\s*1;/);
    expect(ruleBody('services')).toMatch(/min-height:\s*0;/);
    expect(ruleBody('services')).toMatch(/overflow-y:\s*auto;/);
  });

  it('reserves the scrollbar so a list crossing the limit does not reflow rows', () => {
    expect(ruleBody('services')).toMatch(/scrollbar-gutter:\s*stable;/);
  });

  it('lets the sidebar column itself be the thing that is measured', () => {
    expect(ruleBody('sidebar')).toMatch(/min-height:\s*0;/);
    expect(ruleBody('sidebar')).not.toMatch(/overflow(-y)?:/);
  });
});

describe('sidebar vertical rhythm', () => {
  /** `--sidebar-padding-top` for every tier that re-declares it, narrowest last. */
  function topInsetByTier(): { width: number; inset: number }[] {
    return [...componentsCss.matchAll(/@media \(max-width: (\d+)px\) \{\s*:root \{([\s\S]*?)\}/g)]
      .map((match) => {
        const inset = /--sidebar-padding-top:\s*(\d+)px/.exec(match[2] ?? '');
        return { width: Number(match[1]), inset: Number(inset?.[1] ?? NaN) };
      })
      .filter((tier) => Number.isFinite(tier.inset))
      .sort((a, b) => b.width - a.width);
  }

  it('holds the wordmark, search field and nav in one tight group', () => {
    expect(ruleBody('sidebar')).toMatch(/gap:\s*var\(--space-4\);/);
  });

  it('keeps the SERVICES break twice that gap', () => {
    expect(ruleBody('services-block')).toMatch(/margin-top:\s*var\(--space-4\);/);
  });

  it('starts the sidebar closer to the top than its own side inset', () => {
    const inset = /--sidebar-padding-top:\s*(\d+)px/.exec(tokensCss);
    expect(inset?.[1]).toBe('28');
  });

  it('shrinks the top inset at every tier instead of leaving the base value behind', () => {
    expect(topInsetByTier().map((tier) => tier.inset)).toEqual([24, 20, 16]);
  });
});
