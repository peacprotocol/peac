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
 *   E_VERIFY_ISSUER_CONFIG_INVALID   - malformed issuer URL / non-hierarchical URI
 *   E_VERIFY_INSECURE_SCHEME_BLOCKED - non-HTTPS issuer URL
 *   E_VERIFY_JWKS_INVALID         - JWKS not valid JSON or missing keys
 *   E_VERIFY_KEY_FETCH_BLOCKED    - SSRF block (private IP)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveJWKS,
  clearJWKSCache,
  getJWKSCacheSize,
  clearKidThumbprints,
  getKidThumbprintSize,
} from '../src/jwks-resolver';

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
    clearKidThumbprints();
    vi.resetAllMocks();
  });

  afterEach(() => {
    clearJWKSCache();
    clearKidThumbprints();
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

  it('rejects malformed issuer URL with descriptive message', async () => {
    const result = await resolveJWKS('not-a-url');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_ISSUER_CONFIG_INVALID');
      expect(result.message).toContain('not a valid URL');
      expect(result.blockedUrl).toBe('not-a-url');
    }
  });

  it('rejects data: URI issuer (no valid origin)', async () => {
    const result = await resolveJWKS('data:text/html,hello');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('E_VERIFY_ISSUER_CONFIG_INVALID');
      expect(result.message).toContain('no valid origin');
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

  // ------------------------------------------------------------------
  // Kid reuse detection (DD-148)
  // ------------------------------------------------------------------

  it('detects kid reuse when same kid maps to different key material', async () => {
    // First resolution: kid=reuse-001 with key material A
    const jwks1 = JSON.stringify({
      keys: [
        {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          kid: 'reuse-001',
        },
      ],
    });
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(jwks1));

    const result1 = await resolveJWKS('https://api.example.com', { noCache: true });
    expect(result1.ok).toBe(true);

    // Second resolution: same kid with different key material B
    const jwks2 = JSON.stringify({
      keys: [
        {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          kid: 'reuse-001',
        },
      ],
    });
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(jwks2));

    const result2 = await resolveJWKS('https://api.example.com', { noCache: true });
    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.code).toBe('E_KID_REUSE_DETECTED');
      expect(result2.message).toContain('reuse-001');
    }
  });

  it('allows same kid with same key material (no reuse)', async () => {
    const jwks = JSON.stringify({
      keys: [
        {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          kid: 'stable-001',
        },
      ],
    });

    // First resolution
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(jwks));
    const result1 = await resolveJWKS('https://api.example.com', { noCache: true });
    expect(result1.ok).toBe(true);

    // Second resolution with same key material: should succeed
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(jwks));
    const result2 = await resolveJWKS('https://api.example.com', { noCache: true });
    expect(result2.ok).toBe(true);
  });

  it('isolates kid reuse detection per issuer', async () => {
    // Issuer A uses kid=shared-001 with material A
    const configA = JSON.stringify({
      version: 'peac-issuer/0.1',
      issuer: 'https://issuer-a.example.com',
      jwks_uri: 'https://issuer-a.example.com/.well-known/jwks.json',
    });
    const jwksA = JSON.stringify({
      keys: [
        {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          kid: 'shared-001',
        },
      ],
    });
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(configA));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(jwksA));
    const resultA = await resolveJWKS('https://issuer-a.example.com', { noCache: true });
    expect(resultA.ok).toBe(true);

    // Issuer B uses same kid=shared-001 but with different material B (should succeed: different issuer)
    const configB = JSON.stringify({
      version: 'peac-issuer/0.1',
      issuer: 'https://issuer-b.example.com',
      jwks_uri: 'https://issuer-b.example.com/.well-known/jwks.json',
    });
    const jwksB = JSON.stringify({
      keys: [
        {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          kid: 'shared-001',
        },
      ],
    });
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(configB));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(jwksB));
    const resultB = await resolveJWKS('https://issuer-b.example.com', { noCache: true });
    expect(resultB.ok).toBe(true);
  });

  it('skips kid reuse check for keys without kid or x', async () => {
    const jwks = JSON.stringify({
      keys: [
        { kty: 'OKP', crv: 'Ed25519', kid: 'no-x-key' },
        { kty: 'OKP', crv: 'Ed25519', x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
      ],
    });
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(jwks));

    const result = await resolveJWKS('https://api.example.com', { noCache: true });
    expect(result.ok).toBe(true);
  });

  // ------------------------------------------------------------------
  // Revoked keys passthrough (DD-148)
  // ------------------------------------------------------------------

  it('passes revoked_keys from issuer config to resolve result', async () => {
    const configWithRevoked = JSON.stringify({
      version: 'peac-issuer/0.1',
      issuer: 'https://api.example.com',
      jwks_uri: 'https://api.example.com/.well-known/jwks.json',
      revoked_keys: [
        { kid: 'old-key-001', revoked_at: '2026-01-15T00:00:00Z', reason: 'superseded' },
      ],
    });
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(configWithRevoked));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));

    const result = await resolveJWKS('https://api.example.com');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.revokedKeys).toHaveLength(1);
      expect(result.revokedKeys![0].kid).toBe('old-key-001');
      expect(result.revokedKeys![0].reason).toBe('superseded');
    }
  });

  it('returns undefined revokedKeys when issuer config has none', async () => {
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));

    const result = await resolveJWKS('https://api.example.com');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.revokedKeys).toBeUndefined();
    }
  });

  it('includes revokedKeys in cached results', async () => {
    const configWithRevoked = JSON.stringify({
      version: 'peac-issuer/0.1',
      issuer: 'https://api.example.com',
      jwks_uri: 'https://api.example.com/.well-known/jwks.json',
      revoked_keys: [{ kid: 'cached-revoked-001', revoked_at: '2026-02-01T00:00:00Z' }],
    });
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(configWithRevoked));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));

    // First call: populates cache
    await resolveJWKS('https://api.example.com');

    // Second call: from cache
    const cached = await resolveJWKS('https://api.example.com');
    expect(cached.ok).toBe(true);
    if (cached.ok) {
      expect(cached.fromCache).toBe(true);
      expect(cached.revokedKeys).toHaveLength(1);
      expect(cached.revokedKeys![0].kid).toBe('cached-revoked-001');
    }
  });

  // ------------------------------------------------------------------
  // No key material in error messages (security audit)
  // ------------------------------------------------------------------

  it('kid reuse error message contains kid but not key material', async () => {
    const jwks1 = JSON.stringify({
      keys: [
        {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          kid: 'leak-test-001',
        },
      ],
    });
    const jwks2 = JSON.stringify({
      keys: [
        {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          kid: 'leak-test-001',
        },
      ],
    });

    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(jwks1));
    await resolveJWKS('https://api.example.com', { noCache: true });

    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(jwks2));
    const result = await resolveJWKS('https://api.example.com', { noCache: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('leak-test-001'); // kid is expected
      expect(result.message).not.toContain('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'); // old key material must not leak
      expect(result.message).not.toContain('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'); // new key material must not leak
    }
  });

  // ------------------------------------------------------------------
  // Bounded memory for kid reuse tracking (enterprise readiness)
  // ------------------------------------------------------------------

  it('tracks kid-to-thumbprint map size', async () => {
    expect(getKidThumbprintSize()).toBe(0);

    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));
    await resolveJWKS('https://api.example.com', { noCache: true });

    // One key in VALID_JWKS: test-key-1
    expect(getKidThumbprintSize()).toBe(1);
  });

  it('does not grow unbounded under repeated resolutions with unique kids', async () => {
    // Simulate many issuers/kids to verify the map stays bounded
    for (let i = 0; i < 50; i++) {
      const issuer = `https://issuer-${i}.example.com`;
      const config = JSON.stringify({
        version: 'peac-issuer/0.1',
        issuer,
        jwks_uri: `${issuer}/.well-known/jwks.json`,
      });
      const jwks = JSON.stringify({
        keys: [
          {
            kty: 'OKP',
            crv: 'Ed25519',
            x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            kid: `key-${i}`,
          },
        ],
      });
      mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(config));
      mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(jwks));
      await resolveJWKS(issuer, { noCache: true });
    }

    // Map grows but stays bounded (max 10,000 entries internal limit)
    expect(getKidThumbprintSize()).toBe(50);
    expect(getKidThumbprintSize()).toBeLessThanOrEqual(10_000);
  });

  it('prunes expired kid entries during check', async () => {
    // Use vi.spyOn(Date, 'now') to simulate time passing
    const realDateNow = Date.now;

    // First resolution at time T
    const baseTime = 1709308800000; // 2024-03-01T12:00:00Z
    vi.spyOn(Date, 'now').mockReturnValue(baseTime);

    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(VALID_ISSUER_CONFIG));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(VALID_JWKS));
    await resolveJWKS('https://api.example.com', { noCache: true });
    expect(getKidThumbprintSize()).toBe(1);

    // Advance time past the 30-day retention window
    const thirtyOneDays = 31 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(baseTime + thirtyOneDays);

    // New resolution triggers pruning of expired entries
    const newIssuer = 'https://new-issuer.example.com';
    const newConfig = JSON.stringify({
      version: 'peac-issuer/0.1',
      issuer: newIssuer,
      jwks_uri: `${newIssuer}/.well-known/jwks.json`,
    });
    const newJwks = JSON.stringify({
      keys: [
        {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          kid: 'new-key',
        },
      ],
    });
    mockSsrfSafeFetch.mockResolvedValueOnce(okResponse(newConfig));
    mockFetchJWKSSafe.mockResolvedValueOnce(okResponse(newJwks));
    await resolveJWKS(newIssuer, { noCache: true });

    // Old entry should have been pruned, only new entry remains
    expect(getKidThumbprintSize()).toBe(1);

    // Restore Date.now
    vi.spyOn(Date, 'now').mockImplementation(realDateNow);
  });
});
