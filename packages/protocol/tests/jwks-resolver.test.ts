/**
 * Tests for strict JWKS discovery via peac-issuer.json
 *
 * Validates the 3-step resolution algorithm:
 *   iss -> peac-issuer.json -> jwks_uri -> JWKS
 *
 * Error codes tested:
 *   E_VERIFY_ISSUER_CONFIG_MISSING - peac-issuer.json not fetchable
 *   E_VERIFY_ISSUER_CONFIG_INVALID - bad JSON / schema
 *   E_VERIFY_ISSUER_MISMATCH      - issuer field mismatch
 *   E_VERIFY_JWKS_URI_INVALID     - jwks_uri not HTTPS
 *   E_VERIFY_INSECURE_SCHEME_BLOCKED - non-HTTPS issuer URL
 *   E_VERIFY_JWKS_INVALID         - JWKS not valid JSON or missing keys
 *   E_VERIFY_KEY_FETCH_BLOCKED    - SSRF block (private IP)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveJWKS, clearJWKSCache } from '../src/jwks-resolver';

// Mock ssrf-safe-fetch and discovery modules
vi.mock('../src/ssrf-safe-fetch.js', () => ({
  ssrfSafeFetch: vi.fn(),
  fetchJWKSSafe: vi.fn(),
}));

vi.mock('../src/discovery.js', async () => {
  const actual = await vi.importActual<typeof import('../src/discovery.js')>('../src/discovery.js');
  return {
    ...actual,
    parseIssuerConfig: actual.parseIssuerConfig,
  };
});

import { ssrfSafeFetch, fetchJWKSSafe } from '../src/ssrf-safe-fetch';
import type { SSRFFetchResult, SSRFFetchError } from '../src/ssrf-safe-fetch';

const mockSsrfSafeFetch = vi.mocked(ssrfSafeFetch);
const mockFetchJWKSSafe = vi.mocked(fetchJWKSSafe);

function okResponse(body: string, status = 200): SSRFFetchResult {
  return {
    ok: true,
    status,
    body,
    rawBytes: new TextEncoder().encode(body),
    contentType: 'application/json',
  };
}

function errorResponse(reason: SSRFFetchError['reason'], message: string): SSRFFetchError {
  return { ok: false, reason, message };
}

const VALID_ISSUER_CONFIG = JSON.stringify({
  version: 'peac-issuer/0.1',
  issuer: 'https://api.example.com',
  jwks_uri: 'https://api.example.com/.well-known/jwks.json',
});

const VALID_JWKS = JSON.stringify({
  keys: [
    {
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      kid: 'test-key-1',
    },
  ],
});

describe('resolveJWKS (strict discovery)', () => {
  beforeEach(() => {
    clearJWKSCache();
    vi.resetAllMocks();
  });

  afterEach(() => {
    clearJWKSCache();
  });

  // ------------------------------------------------------------------
  // Happy path
  // ------------------------------------------------------------------

  it('resolves JWKS via peac-issuer.json -> jwks_uri', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.jwks.keys).toHaveLength(1);
      expect(result.jwks.keys[0].kid).toBe('test-key-1');
      expect(result.fromCache).toBe(false);
      expect(result.rawBytes).toBeDefined();
    }
  });

  it('returns cached result on second call', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));

    const result1 = await resolveJWKS('https://api.example.com');
    const result2 = await resolveJWKS('https://api.example.com');

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result2.ok) {
      expect(result2.fromCache).toBe(true);
      expect(result2.rawBytes).toBeUndefined();
    }

    // Only one fetch pair (config + jwks)
    expect(mockSsrfSafeFetch).toHaveBeenCalledTimes(1);
    expect(mockFetchJWKSSafe).toHaveBeenCalledTimes(1);
  });

  it('normalizes trailing slash on issuer URL', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));

    const result = await resolveJWKS('https://api.example.com/');

    expect(result.ok).toBe(true);
    expect(mockSsrfSafeFetch).toHaveBeenCalledWith(
      'https://api.example.com/.well-known/peac-issuer.json',
      expect.any(Object)
    );
  });

  // ------------------------------------------------------------------
  // E_VERIFY_INSECURE_SCHEME_BLOCKED
  // ------------------------------------------------------------------

  it('rejects non-HTTPS issuer URL', async () => {
    const result = await resolveJWKS('http://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_INSECURE_SCHEME_BLOCKED');
      expect(result.message).toContain('HTTPS');
    }
  });

  // ------------------------------------------------------------------
  // E_VERIFY_ISSUER_CONFIG_MISSING
  // ------------------------------------------------------------------

  it('returns E_VERIFY_ISSUER_CONFIG_MISSING when config fetch fails', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(errorResponse('network_error', 'Connection refused'));

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_ISSUER_CONFIG_MISSING');
      expect(result.message).toContain('peac-issuer.json');
    }
  });

  it('returns E_VERIFY_ISSUER_CONFIG_MISSING on DNS failure', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(errorResponse('dns_failure', 'NXDOMAIN'));

    const result = await resolveJWKS('https://nonexistent.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_ISSUER_CONFIG_MISSING');
    }
  });

  // ------------------------------------------------------------------
  // E_VERIFY_ISSUER_CONFIG_INVALID
  // ------------------------------------------------------------------

  it('returns E_VERIFY_ISSUER_CONFIG_INVALID for non-JSON response', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse('not valid json at all'));

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_ISSUER_CONFIG_INVALID');
    }
  });

  it('returns E_VERIFY_ISSUER_CONFIG_INVALID for missing version', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(
      okResponse(
        JSON.stringify({
          issuer: 'https://api.example.com',
          jwks_uri: 'https://api.example.com/.well-known/jwks.json',
        })
      )
    );

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_ISSUER_CONFIG_INVALID');
      expect(result.message).toContain('version');
    }
  });

  it('returns E_VERIFY_ISSUER_CONFIG_INVALID for missing jwks_uri', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(
      okResponse(
        JSON.stringify({
          version: 'peac-issuer/0.1',
          issuer: 'https://api.example.com',
        })
      )
    );

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_ISSUER_CONFIG_INVALID');
      expect(result.message).toContain('jwks_uri');
    }
  });

  // ------------------------------------------------------------------
  // E_VERIFY_ISSUER_MISMATCH
  // ------------------------------------------------------------------

  it('returns E_VERIFY_ISSUER_MISMATCH when issuer does not match', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(
      okResponse(
        JSON.stringify({
          version: 'peac-issuer/0.1',
          issuer: 'https://different.example.com',
          jwks_uri: 'https://different.example.com/.well-known/jwks.json',
        })
      )
    );

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_ISSUER_MISMATCH');
      expect(result.message).toContain('different.example.com');
      expect(result.message).toContain('api.example.com');
    }
  });

  // ------------------------------------------------------------------
  // E_VERIFY_JWKS_URI_INVALID
  // ------------------------------------------------------------------

  it('rejects non-HTTPS jwks_uri during config parsing', async () => {
    // parseIssuerConfig validates jwks_uri HTTPS at parse time,
    // so this surfaces as E_VERIFY_ISSUER_CONFIG_INVALID
    mockSsrfSafeFetch.mockResolvedValueOnce(
      okResponse(
        JSON.stringify({
          version: 'peac-issuer/0.1',
          issuer: 'https://api.example.com',
          jwks_uri: 'http://api.example.com/.well-known/jwks.json',
        })
      )
    );

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_ISSUER_CONFIG_INVALID');
      expect(result.message).toContain('HTTPS');
    }
  });

  // ------------------------------------------------------------------
  // E_VERIFY_KEY_FETCH_BLOCKED (SSRF)
  // ------------------------------------------------------------------

  it('returns E_VERIFY_KEY_FETCH_BLOCKED for private IP on config fetch', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(
      errorResponse('private_ip', 'Blocked private IP 10.0.0.1')
    );

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_KEY_FETCH_BLOCKED');
    }
  });

  it('returns E_VERIFY_KEY_FETCH_BLOCKED for loopback on config fetch', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(
      errorResponse('loopback', 'Blocked loopback 127.0.0.1')
    );

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_KEY_FETCH_BLOCKED');
    }
  });

  // ------------------------------------------------------------------
  // E_VERIFY_JWKS_INVALID
  // ------------------------------------------------------------------

  it('returns E_VERIFY_JWKS_INVALID for non-JSON JWKS', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse('not json'));

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_JWKS_INVALID');
      expect(result.message).toContain('not valid JSON');
    }
  });

  it('returns E_VERIFY_JWKS_INVALID for JWKS without keys array', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse('{"something": "else"}'));

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_JWKS_INVALID');
      expect(result.message).toContain('keys array');
    }
  });

  // ------------------------------------------------------------------
  // E_VERIFY_KEY_FETCH_FAILED / TIMEOUT on JWKS fetch
  // ------------------------------------------------------------------

  it('returns E_VERIFY_KEY_FETCH_FAILED on JWKS network error', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(errorResponse('network_error', 'ECONNREFUSED'));

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_KEY_FETCH_FAILED');
    }
  });

  it('returns E_VERIFY_KEY_FETCH_TIMEOUT on JWKS timeout', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(errorResponse('timeout', 'Fetch timeout after 5000ms'));

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_KEY_FETCH_TIMEOUT');
    }
  });

  // ------------------------------------------------------------------
  // E_VERIFY_JWKS_TOO_MANY_KEYS
  // ------------------------------------------------------------------

  it('returns E_VERIFY_JWKS_TOO_MANY_KEYS for oversized JWKS', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));

    // Generate 21 keys (limit is 20)
    const keys = Array.from({ length: 21 }, (_, i) => ({
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      kid: `key-${i}`,
    }));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(JSON.stringify({ keys })));

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_JWKS_TOO_MANY_KEYS');
    }
  });

  // ------------------------------------------------------------------
  // No fallback to direct JWKS
  // ------------------------------------------------------------------

  it('does NOT fall back to direct /.well-known/jwks.json', async () => {
    // Config fetch fails
    mockSsrfSafeFetch.mockResolvedValueOnce(errorResponse('network_error', '404 Not Found'));

    const result = await resolveJWKS('https://api.example.com');

    // Should NOT attempt fetchJWKSSafe as a fallback
    expect(mockFetchJWKSSafe).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_ISSUER_CONFIG_MISSING');
    }
  });
});
