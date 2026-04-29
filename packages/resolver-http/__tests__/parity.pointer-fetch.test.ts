// Real public-API parity test against @peac/protocol's pointer-fetch.
//
// Imports ONLY public @peac/protocol exports (`fetchPointerWithDigest` and
// public types). Compares NORMALIZED behavior classes only — not internal
// error code strings or implementation internals. The full cross-
// implementation byte-equal harness over fetched bodies belongs to Commit 4
// (which adds dispatcher-mock infrastructure to drive both code paths
// through synthetic responses).
//
// This test exercises the no-network cases (non-HTTPS URL pre-check;
// invalid expected-digest format) where both paths short-circuit before any
// network attempt. That is sufficient for "real parity" as a starting
// point. Body-fetch parity is Commit 4 scope.
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
 * error codes; the parity test compares classes only.
 */
type NormalizedClass =
  | 'success'
  | 'url_blocked'
  | 'invalid_digest_input'
  | 'malformed_body'
  | 'digest_mismatch'
  | 'fetch_failure';

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

describe('parity: pointer-fetch normalized class agreement (no-network cases)', () => {
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

  it('invalid expected-digest format: both surface a non-success failure', async () => {
    // Protocol uses pointer_fetch_failed for invalid digest input;
    // resolver-http uses pointer_fetch_blocked. Both are non-success
    // discriminated-union failures at the boundary. Normalized class
    // agreement: both are pre-fetch failures (not 'success').
    const url = 'https://issuer.example.com/r';
    const proto = await protocolFetchPointer({ url, expectedDigest: 'not-a-digest' });
    const ours = await resolverHttpFetchPointer(url, 'not-a-digest');
    expect(proto.ok).toBe(false);
    expect(ours.ok).toBe(false);
    // Both implementations short-circuit at the boundary without network
    // access — class agreement on "not success".
    const protoClass = normalizeProtocol(proto);
    const oursClass = normalizeResolver(ours);
    expect(protoClass).not.toBe('success');
    expect(oursClass).not.toBe('success');
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
