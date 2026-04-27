// Fixture: silentDefault is REPORT-ONLY even in sensitive paths
// because predicate functions and try-parsers are widespread and
// legitimate (false-on-parse-failure is the contract here).
export function isCanonicalIss(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}
