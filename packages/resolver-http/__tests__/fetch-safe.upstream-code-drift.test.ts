// Upstream-code drift coverage (Commit 2.1 Fix #4).
//
// Imports the actual @peac/net-node SAFE_FETCH_ERROR_CODES via vi.importActual
// (NOT the mocked module — see vi.unmock at the top scope) and asserts every
// current upstream code is either:
//   - mapped by fetch-safe (MAPPED_UPSTREAM_CODES); or
//   - explicitly listed as an internal-only / never-reaches-resolver-http
//     exception (EXPLICITLY_INTERNAL_ONLY_CODES).
//
// If upstream net-node adds a new E_NET_* code, this test fails loudly so the
// fetch-safe mapping table gets a conscious extension before merge.

import { describe, it, expect } from 'vitest';

// This test does NOT mock @peac/net-node. We import the real codes module
// directly so the assertion runs against the actual current public enum.
import { SAFE_FETCH_ERROR_CODES } from '@peac/net-node';

// Codes that fetch-safe.ts mapNetNodeCode() switch handles. The order
// mirrors the switch in src/fetch-safe.ts; if the switch changes, this
// set must change too.
const MAPPED_UPSTREAM_CODES: ReadonlySet<string> = new Set([
  // -> fetch_timeout
  'E_NET_REQUEST_TIMEOUT',
  'E_NET_DNS_TIMEOUT',
  'E_NET_CONNECT_TIMEOUT',
  'E_NET_HEADERS_TIMEOUT',
  'E_NET_BODY_TIMEOUT',
  // -> fetch_network_error
  'E_NET_NETWORK_ERROR',
  'E_NET_DNS_RESOLUTION_FAILED',
  'E_NET_PARSE_ERROR',
  // -> fetch_blocked_ssrf
  'E_NET_SSRF_URL_REJECTED',
  'E_NET_SSRF_DNS_RESOLVED_PRIVATE',
  'E_NET_SSRF_ALL_IPS_BLOCKED',
  'E_NET_SSRF_IPV6_ZONE_ID',
  'E_NET_SSRF_INVALID_HOST',
  'E_NET_SSRF_MIXED_DNS_BLOCKED',
  'E_NET_SSRF_MIXED_DNS_ACK_MISSING',
  'E_NET_SSRF_ALLOWCIDRS_ACK_REQUIRED',
  'E_NET_TENANT_KEY_MISSING',
  // -> fetch_blocked_redirect
  'E_NET_SSRF_REDIRECT_BLOCKED',
  'E_NET_SSRF_TOO_MANY_REDIRECTS',
  // -> fetch_blocked_byte_cap
  'E_NET_RESPONSE_TOO_LARGE',
  // -> fetch_blocked_dangerous_port
  'E_NET_SSRF_DANGEROUS_PORT',
  'E_NET_SSRF_DANGEROUS_PORT_ACK_MISSING',
  // -> resolver_internal_error (programmer error in resolver-http; never expected
  //    in production because resolver-http only issues GET / HEAD via allowedMethods).
  'E_NET_METHOD_NOT_ALLOWED',
]);

// Codes that net-node may emit but that resolver-http intentionally does NOT
// surface as a distinct mapped class. Listed here so that "every upstream
// code is consciously decided" is a hard test rather than a soft default.
//
// (Currently empty — every upstream code is mapped. Future net-node codes
// that are evidence-emission-only or telemetry-only should be added here
// with a one-line rationale comment.)
const EXPLICITLY_INTERNAL_ONLY_CODES: ReadonlySet<string> = new Set([
  // (none today)
]);

describe('fetch-safe upstream-code drift', () => {
  it('every actual @peac/net-node SAFE_FETCH_ERROR_CODES value is either mapped or explicitly internal', () => {
    const actualCodes = Object.values(SAFE_FETCH_ERROR_CODES);
    expect(actualCodes.length).toBeGreaterThan(0);

    const undecided: string[] = [];
    for (const code of actualCodes) {
      const decided = MAPPED_UPSTREAM_CODES.has(code) || EXPLICITLY_INTERNAL_ONLY_CODES.has(code);
      if (!decided) undecided.push(code);
    }

    expect(
      undecided,
      `New upstream @peac/net-node code(s) without a conscious mapping decision: ${undecided.join(', ')}. ` +
        `Add to MAPPED_UPSTREAM_CODES (and update fetch-safe.ts mapNetNodeCode switch) or ` +
        `EXPLICITLY_INTERNAL_ONLY_CODES with a rationale comment.`
    ).toEqual([]);
  });

  it('every code in MAPPED_UPSTREAM_CODES exists in the actual upstream enum (no stale entries)', () => {
    const actualValues = new Set(Object.values(SAFE_FETCH_ERROR_CODES) as string[]);
    const stale: string[] = [];
    for (const mapped of MAPPED_UPSTREAM_CODES) {
      if (!actualValues.has(mapped)) stale.push(mapped);
    }
    expect(
      stale,
      `Stale entries in MAPPED_UPSTREAM_CODES (no longer in upstream): ${stale.join(', ')}`
    ).toEqual([]);
  });

  it('every code in EXPLICITLY_INTERNAL_ONLY_CODES exists in the actual upstream enum (no stale entries)', () => {
    const actualValues = new Set(Object.values(SAFE_FETCH_ERROR_CODES) as string[]);
    const stale: string[] = [];
    for (const internal of EXPLICITLY_INTERNAL_ONLY_CODES) {
      if (!actualValues.has(internal)) stale.push(internal);
    }
    expect(
      stale,
      `Stale entries in EXPLICITLY_INTERNAL_ONLY_CODES (no longer in upstream): ${stale.join(', ')}`
    ).toEqual([]);
  });
});
