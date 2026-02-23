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
 *   E_VERIFY_JWKS_URI_INVALID     - jwks_uri not HTTPS (reachable via resolver)
 *   E_VERIFY_INSECURE_SCHEME_BLOCKED - non-HTTPS issuer URL
 *   E_VERIFY_JWKS_INVALID         - JWKS not valid JSON or missing keys
 *   E_VERIFY_KEY_FETCH_BLOCKED    - SSRF block (private IP)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveJWKS, clearJWKSCache, getJWKSCacheSize } from '../src/jwks-resolver';

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

  // ------------------------------------------------------------------
  // Issuer normalization (URL origin canonicalization)
  // ------------------------------------------------------------------

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

  it('normalizes issuer URL with path to origin', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));

    const result = await resolveJWKS('https://api.example.com/v1/issuer');

    expect(result.ok).toBe(true);
    expect(mockSsrfSafeFetch).toHaveBeenCalledWith(
      'https://api.example.com/.well-known/peac-issuer.json',
      expect.any(Object)
    );
  });

  it('elides default port 443 from issuer origin', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));

    const result = await resolveJWKS('https://api.example.com:443');

    expect(result.ok).toBe(true);
    expect(mockSsrfSafeFetch).toHaveBeenCalledWith(
      'https://api.example.com/.well-known/peac-issuer.json',
      expect.any(Object)
    );
  });

  it('preserves non-standard port in issuer origin', async () => {
    const config = JSON.stringify({
      version: 'peac-issuer/0.1',
      issuer: 'https://api.example.com:8443',
      jwks_uri: 'https://api.example.com:8443/.well-known/jwks.json',
    });
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(config));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));

    const result = await resolveJWKS('https://api.example.com:8443');

    expect(result.ok).toBe(true);
    expect(mockSsrfSafeFetch).toHaveBeenCalledWith(
      'https://api.example.com:8443/.well-known/peac-issuer.json',
      expect.any(Object)
    );
  });

  it('cache key uses canonicalized origin (path variations share cache)', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));

    await resolveJWKS('https://api.example.com/v1');
    const result = await resolveJWKS('https://api.example.com/v2');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fromCache).toBe(true);
    expect(mockSsrfSafeFetch).toHaveBeenCalledTimes(1);
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
      expect(result.reason).toBe('network_error');
    }
  });

  it('returns E_VERIFY_ISSUER_CONFIG_MISSING on DNS failure', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(errorResponse('dns_failure', 'NXDOMAIN'));

    const result = await resolveJWKS('https://nonexistent.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_ISSUER_CONFIG_MISSING');
      expect(result.reason).toBe('dns_failure');
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
  // E_VERIFY_JWKS_URI_INVALID (now reachable for non-HTTPS jwks_uri)
  // ------------------------------------------------------------------

  it('returns E_VERIFY_JWKS_URI_INVALID for non-HTTPS jwks_uri', async () => {
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
      expect(result.code).toBe('E_VERIFY_JWKS_URI_INVALID');
      expect(result.message).toContain('HTTPS');
      expect(result.blockedUrl).toBe('http://api.example.com/.well-known/jwks.json');
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
      expect(result.reason).toBe('private_ip');
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
      expect(result.reason).toBe('loopback');
    }
  });

  // ------------------------------------------------------------------
  // SSRF reason fidelity
  // ------------------------------------------------------------------

  it('preserves original SSRF reason on JWKS fetch errors', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(
      errorResponse('private_ip', 'Blocked private IP on JWKS')
    );

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_KEY_FETCH_BLOCKED');
      expect(result.reason).toBe('private_ip');
    }
  });

  it('preserves timeout reason on config fetch', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(errorResponse('timeout', 'Fetch timeout after 5000ms'));

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_KEY_FETCH_TIMEOUT');
      expect(result.reason).toBe('timeout');
    }
  });

  it('does not set reason for non-SSRF errors', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse('not json'));

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_ISSUER_CONFIG_INVALID');
      expect(result.reason).toBeUndefined();
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
      expect(result.reason).toBe('network_error');
    }
  });

  it('returns E_VERIFY_KEY_FETCH_TIMEOUT on JWKS timeout', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(errorResponse('timeout', 'Fetch timeout after 5000ms'));

    const result = await resolveJWKS('https://api.example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_KEY_FETCH_TIMEOUT');
      expect(result.reason).toBe('timeout');
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

  // ------------------------------------------------------------------
  // Configurable cache (LRU, TTL, noCache)
  // ------------------------------------------------------------------

  it('bypasses cache when noCache is true', async () => {
    mockSsrfSafeFetch.mockResolvedValue(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValue(okResponse(VALID_JWKS));

    await resolveJWKS('https://api.example.com', { noCache: true });
    const result2 = await resolveJWKS('https://api.example.com', { noCache: true });

    // Both calls should fetch (no caching)
    expect(mockSsrfSafeFetch).toHaveBeenCalledTimes(2);
    expect(mockFetchJWKSSafe).toHaveBeenCalledTimes(2);
    expect(result2.ok).toBe(true);
    if (result2.ok) expect(result2.fromCache).toBe(false);
    // noCache should not populate the cache
    expect(getJWKSCacheSize()).toBe(0);
  });

  it('evicts oldest entries when cache exceeds maxCacheEntries', async () => {
    // Populate cache with 3 entries, then add a 4th with max=3
    for (let i = 0; i < 3; i++) {
      const issuer = `https://issuer-${i}.example.com`;
      const config = JSON.stringify({
        version: 'peac-issuer/0.1',
        issuer,
        jwks_uri: `${issuer}/.well-known/jwks.json`,
      });
      mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(config));
      mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));
      await resolveJWKS(issuer, { maxCacheEntries: 3 });
    }

    expect(getJWKSCacheSize()).toBe(3);

    // Add 4th entry: should evict issuer-0
    const issuer4 = 'https://issuer-3.example.com';
    const config4 = JSON.stringify({
      version: 'peac-issuer/0.1',
      issuer: issuer4,
      jwks_uri: `${issuer4}/.well-known/jwks.json`,
    });
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(config4));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));
    await resolveJWKS(issuer4, { maxCacheEntries: 3 });

    expect(getJWKSCacheSize()).toBe(3);

    // issuer-0 should have been evicted, issuer-1 should still be cached
    mockSsrfSafeFetch.mockResolvedValueOnce(
      okResponse(
        JSON.stringify({
          version: 'peac-issuer/0.1',
          issuer: 'https://issuer-0.example.com',
          jwks_uri: 'https://issuer-0.example.com/.well-known/jwks.json',
        })
      )
    );
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));

    const evicted = await resolveJWKS('https://issuer-0.example.com');
    expect(evicted.ok).toBe(true);
    if (evicted.ok) expect(evicted.fromCache).toBe(false); // Was evicted, had to re-fetch

    const cached = await resolveJWKS('https://issuer-1.example.com');
    expect(cached.ok).toBe(true);
    if (cached.ok) expect(cached.fromCache).toBe(true); // Still in cache
  });
});
