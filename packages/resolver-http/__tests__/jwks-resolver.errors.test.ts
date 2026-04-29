// JWKS resolver error mapping tests.
// Covers: pre-fetch URL pre-check failures (validateUrl / isMetadataIp);
// fetch-safe pass-through; local body-validator failures; kid-not-found.

import { vi, describe, it, expect, beforeEach } from 'vitest';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
  enqueue,
  resetMock,
  NET_CODES,
} from './_helpers/mock-net-node.js';

vi.mock('@peac/net-node', async () => {
  const actual = await vi.importActual<typeof import('@peac/net-node')>('@peac/net-node');
  return {
    ...actual,
    safeFetchJson: mockSafeFetchJson,
    safeFetchJWKS: mockSafeFetchJWKS,
    safeFetchRaw: mockSafeFetchRaw,
  };
});

import { fetchAndValidateJwks, IssuerJwksResolver } from '../src/jwks-resolver.js';

beforeEach(() => {
  resetMock();
});

describe('jwks-resolver pre-fetch URL pre-checks', () => {
  it('non-HTTPS jwks_uri rejected (jwks-cache validateUrl + fetch-safe both block)', async () => {
    const result = await fetchAndValidateJwks('http://issuer.example.com/jwks');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // jwks-cache validateUrl rejects http:// -> fetch_blocked_ssrf
      // (alternatively could surface fetch_blocked_https_only; both are
      // acceptable defenses)
      expect(['fetch_blocked_ssrf', 'fetch_blocked_https_only']).toContain(result.code);
    }
  });

  it('metadata-IP URL rejected with fetch_blocked_metadata_ip', async () => {
    const result = await fetchAndValidateJwks('https://169.254.169.254/jwks');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_metadata_ip');
  });

  it('malformed URL rejected', async () => {
    const result = await fetchAndValidateJwks('not-a-url');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['fetch_blocked_https_only', 'fetch_blocked_ssrf']).toContain(result.code);
    }
  });
});

describe('jwks-resolver fetch-safe pass-through', () => {
  it('SSRF pass-through preserves fetch_blocked_ssrf', async () => {
    enqueue('safeFetchJWKS', { ok: false, code: NET_CODES.E_SSRF_DNS_RESOLVED_PRIVATE });
    const result = await fetchAndValidateJwks('https://issuer.example.com/jwks');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_ssrf');
  });

  it('byte cap pass-through preserves fetch_blocked_byte_cap', async () => {
    enqueue('safeFetchJWKS', { ok: false, code: NET_CODES.E_RESPONSE_TOO_LARGE });
    const result = await fetchAndValidateJwks('https://issuer.example.com/jwks');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_byte_cap');
  });

  it('timeout pass-through preserves fetch_timeout', async () => {
    enqueue('safeFetchJWKS', { ok: false, code: NET_CODES.E_REQUEST_TIMEOUT });
    const result = await fetchAndValidateJwks('https://issuer.example.com/jwks');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_timeout');
  });

  it('4xx pass-through preserves fetch_status_4xx', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 404,
      contentType: 'application/json',
      body: {},
    });
    const result = await fetchAndValidateJwks('https://issuer.example.com/jwks');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_status_4xx');
  });
});

describe('jwks-resolver local body validation', () => {
  it('body without keys array surfaces jwks_invalid_shape', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { not_keys: [] },
    });
    const result = await fetchAndValidateJwks('https://issuer.example.com/jwks');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('jwks_invalid_shape');
  });

  it('keys array exceeding maxJwksKeys (20) surfaces jwks_invalid_shape', async () => {
    const tooMany = {
      keys: Array.from({ length: 25 }, (_, i) => ({
        kty: 'OKP',
        crv: 'Ed25519',
        kid: `k${i}`,
        x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
      })),
    };
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: tooMany,
    });
    const result = await fetchAndValidateJwks('https://issuer.example.com/jwks');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('jwks_invalid_shape');
  });

  it('key missing required fields surfaces jwks_invalid_shape', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { keys: [{ kty: 'OKP' /* missing crv, x */ }] },
    });
    const result = await fetchAndValidateJwks('https://issuer.example.com/jwks');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('jwks_invalid_shape');
  });

  it('null body surfaces jwks_invalid_shape', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: null,
    });
    const result = await fetchAndValidateJwks('https://issuer.example.com/jwks');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('jwks_invalid_shape');
  });
});

describe('jwks-resolver kid lookup', () => {
  it('kid not found in JWKS surfaces jwks_kid_not_found', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: {
        keys: [
          {
            kty: 'OKP',
            crv: 'Ed25519',
            kid: 'k1',
            x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
          },
        ],
      },
    });
    const resolver = new IssuerJwksResolver();
    const result = await resolver.resolve(
      'https://issuer.example.com',
      'https://issuer.example.com/jwks',
      'absent-kid'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('jwks_kid_not_found');
  });

  it('malformed issuer URL surfaces discovery_invalid_shape', async () => {
    const resolver = new IssuerJwksResolver();
    const result = await resolver.resolve('not-a-url', 'https://issuer.example.com/jwks', 'k1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('discovery_invalid_shape');
  });
});
