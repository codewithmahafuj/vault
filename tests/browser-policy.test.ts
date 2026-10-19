import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../src/main/browser-policy';

describe('contentSecurityPolicy', () => {
  it('allows no inline script in the packaged build', () => {
    expect(contentSecurityPolicy(false)).not.toContain('unsafe-inline');
  });

  it('locks the packaged build to same-origin assets', () => {
    const policy = contentSecurityPolicy(false);
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'none'");
  });

  it('permits only what the dev server needs', () => {
    const policy = contentSecurityPolicy(true);
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain('ws:');
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain("default-src 'none'");
  });
});
