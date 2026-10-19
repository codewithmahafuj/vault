// Content Security Policy for the application window.
// The packaged build loads only local bundle files, so its policy allows
// nothing but same-origin assets. The dev server needs inline scripts for
// React Fast Refresh and a websocket for HMR.

const PRODUCTION_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
] as const;

const DEVELOPMENT_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws: http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
] as const;

export function contentSecurityPolicy(isDev: boolean): string {
  const directives = isDev ? DEVELOPMENT_DIRECTIVES : PRODUCTION_DIRECTIVES;
  return `${directives.join('; ')};`;
}
