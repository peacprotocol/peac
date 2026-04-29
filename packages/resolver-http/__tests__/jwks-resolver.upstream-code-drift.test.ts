// Upstream-code drift coverage for @peac/jwks-cache (Plan Fix #4 mirror).
//
// Imports the actual @peac/jwks-cache.ErrorCodes via vi.importActual and
// asserts every current upstream JWKS error code is either:
//   - mapped by resolver-http (MAPPED_JWKS_CODES); or
//   - explicitly listed as internal-only / unreachable in our composed
//     path because we do NOT call resolveKey/createResolver
//     (EXPLICITLY_INTERNAL_ONLY_JWKS_CODES).
//
// If @peac/jwks-cache adds a new E_JWKS_* / E_SSRF_* / E_KEY_NOT_FOUND code,
// this test fails loudly so the resolver-http error mapping gets a conscious
// extension before merge.

import { describe, it, expect } from 'vitest';

// This test does NOT mock @peac/jwks-cache. We import the real codes directly
// so the assertion runs against the actual current public enum.
import { ErrorCodes } from '@peac/jwks-cache';

// Codes that resolver-http surfaces directly (via either pre-fetch validateUrl
// throwing a JwksError or local body-validator emitting a derived code).
const MAPPED_JWKS_CODES: ReadonlySet<string> = new Set([
  // Pre-fetch URL pre-check via validateUrl throws JwksError({code: SSRF_BLOCKED, ...})
  // which resolver-http maps to fetch_blocked_ssrf or fetch_blocked_metadata_ip.
  'E_SSRF_BLOCKED',
  // Local body-validator surfaces this via jwks_invalid_shape on the resolver-http
  // boundary; jwks-cache's own E_JWKS_INVALID is the symbol class match.
  'E_JWKS_INVALID',
  // Local body-validator surfaces this via jwks_invalid_shape (max-keys cap fires).
  'E_JWKS_TOO_MANY_KEYS',
  // resolver-http does NOT call resolveKey, so E_KEY_NOT_FOUND from jwks-cache
  // never surfaces from jwks-cache directly. resolver-http emits its OWN
  // jwks_kid_not_found from its local kid-lookup; the symbol class from
  // jwks-cache is a stable identifier that resolver-http's mapping plan
  // references as "the equivalent class".
  'E_KEY_NOT_FOUND',
]);

// Codes that jwks-cache may emit but that resolver-http intentionally does
// NOT surface from jwks-cache directly because resolver-http does its OWN
// network fetch via fetchJwksSafe (NOT through jwks-cache's resolveKey).
// These would only surface if resolver-http called resolveKey/createResolver
// (which is forbidden per plan Fix #3).
const EXPLICITLY_INTERNAL_ONLY_JWKS_CODES: ReadonlySet<string> = new Set([
  // Network errors come from fetchJwksSafe (net-node-backed), NOT from
  // jwks-cache's internal fetchWithTimeout. The codes below are unreachable
  // from resolver-http's composed path.
  'E_JWKS_FETCH_FAILED',
  'E_JWKS_TIMEOUT',
  // Body-too-large is enforced upstream by net-node's response_too_large
  // (which fetch-safe maps to fetch_blocked_byte_cap). jwks-cache's own
  // E_JWKS_TOO_LARGE only fires from its internal fetch path, which we
  // do not call.
  'E_JWKS_TOO_LARGE',
  // E_ALL_PATHS_FAILED is multi-path discovery; resolver-http does not
  // multi-path. Unreachable from our composed path.
  'E_ALL_PATHS_FAILED',
]);

describe('jwks-resolver upstream-code drift (@peac/jwks-cache)', () => {
  it('every actual @peac/jwks-cache.ErrorCodes value is either mapped or explicitly internal', () => {
    const actualCodes = Object.values(ErrorCodes) as string[];
    expect(actualCodes.length).toBeGreaterThan(0);

    const undecided: string[] = [];
    for (const code of actualCodes) {
      const decided = MAPPED_JWKS_CODES.has(code) || EXPLICITLY_INTERNAL_ONLY_JWKS_CODES.has(code);
      if (!decided) undecided.push(code);
    }

    expect(
      undecided,
      `New upstream @peac/jwks-cache code(s) without a conscious mapping decision: ${undecided.join(', ')}. ` +
        `Add to MAPPED_JWKS_CODES (and update resolver-http error mapping) or ` +
        `EXPLICITLY_INTERNAL_ONLY_JWKS_CODES with a rationale comment.`
    ).toEqual([]);
  });

  it('every code in MAPPED_JWKS_CODES exists in the actual upstream enum (no stale entries)', () => {
    const actualValues = new Set(Object.values(ErrorCodes) as string[]);
    const stale: string[] = [];
    for (const mapped of MAPPED_JWKS_CODES) {
      if (!actualValues.has(mapped)) stale.push(mapped);
    }
    expect(
      stale,
      `Stale entries in MAPPED_JWKS_CODES (no longer in upstream): ${stale.join(', ')}`
    ).toEqual([]);
  });

  it('every code in EXPLICITLY_INTERNAL_ONLY_JWKS_CODES exists in the actual upstream enum', () => {
    const actualValues = new Set(Object.values(ErrorCodes) as string[]);
    const stale: string[] = [];
    for (const internal of EXPLICITLY_INTERNAL_ONLY_JWKS_CODES) {
      if (!actualValues.has(internal)) stale.push(internal);
    }
    expect(
      stale,
      `Stale entries in EXPLICITLY_INTERNAL_ONLY_JWKS_CODES (no longer in upstream): ${stale.join(', ')}`
    ).toEqual([]);
  });
});
