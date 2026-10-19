import type { JSX } from 'react';
import { svg as amazonSvg } from 'thesvg/amazon-badge';
import { svg as facebookSvg } from 'thesvg/facebook';
import { svg as githubSvg } from 'thesvg/github';
import { svg as googleSvg } from 'thesvg/google';
import { svg as instagramSvg } from 'thesvg/instagram';
import { svg as linkedinSvg } from 'thesvg/linkedin';
import { svg as microsoftSvg } from 'thesvg/microsoft';
import { svg as xSvg } from 'thesvg/x';
import { svg as youtubeSvg } from 'thesvg/youtube';

// thesvg hands back a whole SVG document rather than a single path, so a mark
// cannot be injected as-is. Three things have to be repaired first, and none of
// them can be seen by eye in development only:
//   * ids are global to the document, and two brands can both define `id="a"`.
//     Without a per-mark prefix one logo quietly borrows another's gradient.
//   * some brands carry their colour in a `style` attribute. The production CSP
//     is `style-src 'self'`, which drops it, so the declarations move into SVG
//     presentation attributes -- the same effect, and not CSP-governed.
//   * a fixed root `width`/`height` would fight the tile, which sizes the mark.
function stripRootSize(markup: string): string {
  return markup.replace(/^<svg([^>]*)>/, (_tag, attributes: string) => {
    return `<svg${attributes.replace(/\s(?:width|height)="[^"]*"/g, '')}>`;
  });
}

function hoistStyleAttributes(markup: string): string {
  return markup.replace(/ style="([^"]*)"/g, (_match, declarations: string) => {
    const attributes = declarations
      .split(';')
      .filter((declaration) => declaration.includes(':'))
      .map((declaration) => {
        const separator = declaration.indexOf(':');
        return `${declaration.slice(0, separator).trim()}="${declaration.slice(separator + 1).trim()}"`;
      })
      .join(' ');
    return ` ${attributes}`;
  });
}

function namespaceIds(slug: string, markup: string): string {
  const ids = new Set<string>();
  for (const match of markup.matchAll(/ id="([^"]+)"/g)) {
    ids.add(match[1] as string);
  }
  if (ids.size === 0) {
    return markup;
  }
  const qualify = (id: string): string => `tsvg-${slug}-${id}`;
  return markup
    .replace(/ id="([^"]+)"/g, (match, id: string) =>
      ids.has(id) ? ` id="${qualify(id)}"` : match,
    )
    .replace(/url\(#([^)]+)\)/g, (match, id: string) =>
      ids.has(id) ? `url(#${qualify(id)})` : match,
    )
    .replace(/((?:xlink:)?href="#)([^"]+)"/g, (match, prefix: string, id: string) =>
      ids.has(id) ? `${prefix}${qualify(id)}"` : match,
    );
}

function prepareMark(slug: string, markup: string): string {
  return namespaceIds(slug, hoistStyleAttributes(stripRootSize(markup)));
}

function createMark(slug: string, markup: string): () => JSX.Element {
  const html = { __html: prepareMark(slug, markup) };
  return () => <span className="glyph" aria-hidden="true" dangerouslySetInnerHTML={html} />;
}

const marks: Record<string, () => JSX.Element> = {
  google: createMark('google', googleSvg),
  microsoft: createMark('microsoft', microsoftSvg),
  facebook: createMark('facebook', facebookSvg),
  instagram: createMark('instagram', instagramSvg),
  linkedin: createMark('linkedin', linkedinSvg),
  github: createMark('github', githubSvg),
  youtube: createMark('youtube', youtubeSvg),
  amazon: createMark('amazon-badge', amazonSvg),
  x: createMark('x', xSvg),
  globe: () => (
    <svg
      className="glyph"
      viewBox="0 0 256 256"
      aria-hidden="true"
      focusable={false}
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinejoin="round"
    >
      <path d="M222.35693,161.11682a99.99106,99.99106,0,0,0-.02246-66.2959,3.99577,3.99577,0,0,0-.16308-.46191A100.00019,100.00019,0,0,0,33.83105,94.3512a4.01515,4.01515,0,0,0-.17773.50415,99.99136,99.99136,0,0,0,.03125,66.37927,4.14511,4.14511,0,0,0,.13965.3949,100,100,0,0,0,188.34228.02624A3.96321,3.96321,0,0,0,222.35693,161.11682ZM128,216.03064c-14.43311-13.53882-25.105-31.73706-30.93994-52.03027h61.87988C153.105,184.29358,142.43311,202.49182,128,216.03064ZM95.02979,156.00037a130.90714,130.90714,0,0,1-.00049-56h65.9414a130.90714,130.90714,0,0,1-.00049,56ZM36,128.00037a91.65778,91.65778,0,0,1,4.36182-28H86.76123a143.33386,143.33386,0,0,0,.00049,56H40.36182A91.65787,91.65787,0,0,1,36,128.00037Zm92-88.03028c14.43506,13.53858,25.10693,31.73633,30.94092,52.03028H97.05908C102.89307,71.70642,113.56494,53.50867,128,39.97009Zm41.23877,60.03028h46.39941a92.05165,92.05165,0,0,1,0,56h-46.3999a143.33386,143.33386,0,0,0,.00049-56Zm43.42187-8H167.36426c-5.70655-21.50928-16.53174-40.7439-31.61377-55.67041A92.20548,92.20548,0,0,1,212.66064,92.00037ZM120.24951,36.33c-15.082,14.92651-25.90722,34.16113-31.61377,55.67041H43.33936A92.20548,92.20548,0,0,1,120.24951,36.33ZM43.33936,164.00037H88.63574c5.707,21.50879,16.53174,40.74353,31.61377,55.67041A92.20529,92.20529,0,0,1,43.33936,164.00037Zm92.41113,55.67041c15.082-14.92688,25.90674-34.16162,31.61377-55.67041h45.29638A92.20529,92.20529,0,0,1,135.75049,219.67078Z" />
    </svg>
  ),
};

export interface ServiceMark {
  readonly component: () => JSX.Element;
  readonly colorVariable: string;
}

const alias = (name: string): string => {
  if (name.startsWith('microsoft') || name.startsWith('windows') || name.startsWith('office')) {
    return 'microsoft';
  }
  if (name.startsWith('twitter')) {
    return 'x';
  }
  if (name.startsWith('meta')) {
    return 'facebook';
  }
  if (name.startsWith('youtube')) {
    return 'youtube';
  }
  if (name.startsWith('amazon')) {
    return 'amazon';
  }
  if (name.startsWith('linkedin')) {
    return 'linkedin';
  }
  if (name.startsWith('instagram')) {
    return 'instagram';
  }
  if (name.startsWith('face')) {
    return 'facebook';
  }
  if (name.startsWith('git')) {
    return 'github';
  }
  if (name.startsWith('goo')) {
    return 'google';
  }
  return name;
};

// A known brand resolves to its mark and color token; anything else renders a
// globe, which the frames use for services the user typed themselves.
export function resolveServiceMark(normalizedService: string): ServiceMark | undefined {
  const key = alias(normalizedService);
  const component = marks[key];
  if (component === undefined) {
    return undefined;
  }
  const tokenName = key === 'globe' ? 'generic' : key;
  return { component, colorVariable: `--service-${tokenName}` };
}

export function globeMark(): ServiceMark {
  return { component: marks['globe'] as () => JSX.Element, colorVariable: '--service-generic' };
}

export const knownServiceNames: readonly string[] = [
  'Google',
  'Microsoft',
  'Facebook',
  'Instagram',
  'LinkedIn',
  'GitHub',
  'YouTube',
  'Amazon',
  'X',
  'Other',
];
