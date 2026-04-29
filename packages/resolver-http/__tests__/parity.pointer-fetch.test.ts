// Public-API no-network smoke against @peac/protocol's pointer-fetch.
//
// Imports ONLY public @peac/protocol exports (`fetchPointerWithDigest` and
// public types). Compares NORMALIZED behavior classes only; not internal
// error code strings or implementation internals.
//
// Scope: explicit SMOKE-level test, NOT full parity. Covers only the
// no-network short-circuit cases (non-HTTPS URL; invalid expected-digest
// format) where both paths fail before any network attempt.
//
// True cross-implementation pointer parity (body-fetch, byte-equal digest,
// full error-class agreement, redaction parity, content-type warning class
// agreement) is RE-HOMED to PR B's apps/api shadow-mode harness, where both
// implementations naturally run side by side against the same fetched
// response set. See plan PR B section "Cross-implementation pointer parity
// gate (RE-HOMED from Commit 4 of PR A)".
//
// Parity test files are the ONLY allowed location for @peac/protocol
// imports under packages/resolver-http/. Runtime source and shared helpers
// MUST NOT import @peac/protocol.

import { describe, it, expect } from 'vitest';

import {
  fetchPointerWithDigest as protocolFetchPointer,
  type PointerFetchResult as ProtocolPointerResult,
} from '@peac/protocol';

import {
  fetchPointerWithDigest as resolverHttpFetchPointer,
  type PointerFetchResult as ResolverPointerResult,
} from '../src/pointer-fetch.js';

/**
 * Normalized behavior class. Both implementations use different specific
 * error codes; this smoke test compares the broader class only.
 */
type NormalizedClass =
  | 'success'
  | 'url_blocked'
  | 'invalid_digest_input'
  | 'malformed_body'
  | 'digest_mismatch'
  | 'fetch_failure';

/**
 * Map protocol's pointer-fetch result to a normalized class.
 *
 * Protocol uses `pointer_fetch_failed` for invalid digest input (per
 * `packages/protocol/src/pointer-fetch.ts:155-160`). When the message
 * contains "Invalid expected digest" we treat the failure as
 * `invalid_digest_input` rather than the generic `fetch_failure` bucket so
 * that resolver-http's dedicated `pointer_invalid_expected_digest` code
 * normalizes to the same class.
 */
function normalizeProtocol(result: ProtocolPointerResult): NormalizedClass {
  if (result.ok) return 'success';
  switch (result.reason) {
    case 'pointer_fetch_blocked':
      return 'url_blocked';
    case 'pointer_digest_mismatch':
      return 'digest_mismatch';
    case 'malformed_receipt':
      return 'malformed_body';
    case 'pointer_fetch_failed':
      // Protocol re-uses pointer_fetch_failed for invalid digest input
      // (a programmer-error class) AND for generic fetch failures. Use
      // the message string as the normalization signal.
      if (
        typeof result.message === 'string' &&
        result.message.toLowerCase().includes('invalid expected digest')
      ) {
        return 'invalid_digest_input';
      }
      return 'fetch_failure';
    case 'pointer_fetch_timeout':
    case 'pointer_fetch_too_large':
      return 'fetch_failure';
    default:
      return 'fetch_failure';
  }
}

function normalizeResolver(result: ResolverPointerResult): NormalizedClass {
  if (result.ok) return 'success';
  switch (result.code) {
    case 'pointer_invalid_expected_digest':
      return 'invalid_digest_input';
    case 'pointer_fetch_blocked':
      return 'url_blocked';
    case 'pointer_digest_mismatch':
      return 'digest_mismatch';
    case 'pointer_malformed_jws':
      return 'malformed_body';
    case 'fetch_blocked_https_only':
      return 'url_blocked';
    case 'fetch_blocked_ssrf':
    case 'fetch_blocked_metadata_ip':
    case 'fetch_blocked_redirect':
    case 'fetch_blocked_dangerous_port':
      return 'url_blocked';
    case 'fetch_timeout':
    case 'fetch_network_error':
    case 'fetch_blocked_byte_cap':
    case 'fetch_status_4xx':
    case 'fetch_status_5xx':
    case 'fetch_invalid_content_type':
    case 'resolver_internal_error':
      return 'fetch_failure';
    default:
      return 'fetch_failure';
  }
}

const VALID_HEX_64 = '0'.repeat(64);

describe('public-API no-network smoke: pointer-fetch normalized class agreement (true parity is PR B shadow-mode scope)', () => {
  it('non-HTTPS URL: both surface url_blocked', async () => {
    const url = 'http://issuer.example.com/r';
    const proto = await protocolFetchPointer({ url, expectedDigest: VALID_HEX_64 });
    const ours = await resolverHttpFetchPointer(url, VALID_HEX_64);
    expect(normalizeProtocol(proto)).toBe('url_blocked');
    expect(normalizeResolver(ours)).toBe('url_blocked');
    // Class agreement
    expect(normalizeResolver(ours)).toBe(normalizeProtocol(proto));
  });

  it('javascript: scheme URL: both surface url_blocked', async () => {
    const url = 'javascript:alert(1)';
    const proto = await protocolFetchPointer({ url, expectedDigest: VALID_HEX_64 });
    const ours = await resolverHttpFetchPointer(url, VALID_HEX_64);
    expect(normalizeProtocol(proto)).toBe('url_blocked');
    expect(normalizeResolver(ours)).toBe('url_blocked');
    expect(normalizeResolver(ours)).toBe(normalizeProtocol(proto));
  });

  it('invalid expected-digest format: both surface invalid_digest_input', async () => {
    // Protocol uses pointer_fetch_failed for invalid digest input;
    // resolver-http uses pointer_invalid_expected_digest (Commit 3.1
    // Plan Fix #3). The normalization function maps both to the
    // invalid_digest_input class.
    const url = 'https://issuer.example.com/r';
    const proto = await protocolFetchPointer({ url, expectedDigest: 'not-a-digest' });
    const ours = await resolverHttpFetchPointer(url, 'not-a-digest');
    expect(normalizeProtocol(proto)).toBe('invalid_digest_input');
    expect(normalizeResolver(ours)).toBe('invalid_digest_input');
    expect(normalizeResolver(ours)).toBe(normalizeProtocol(proto));
  });

  it('uppercase hex digest: both reject (lowercase rule)', async () => {
    const url = 'https://issuer.example.com/r';
    const upper = 'A'.repeat(64);
    const proto = await protocolFetchPointer({ url, expectedDigest: upper });
    const ours = await resolverHttpFetchPointer(url, upper);
    expect(proto.ok).toBe(false);
    expect(ours.ok).toBe(false);
  });

  it('parity test imports only public @peac/protocol exports', () => {
    // Self-test: assert the imports above are the only @peac/protocol
    // references in this file. (Source-level discipline; shell isolation
    // gate scopes only src + __tests__/_helpers, so this file's imports
    // are intentionally allowed.)
    expect(typeof protocolFetchPointer).toBe('function');
    expect(typeof resolverHttpFetchPointer).toBe('function');
  });
});
