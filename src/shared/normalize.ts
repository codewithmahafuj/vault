export function normalizeService(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Identifiers are trimmed and case-folded only: internal spacing is preserved so
// formatted phone numbers compare equal to themselves.
export function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}
