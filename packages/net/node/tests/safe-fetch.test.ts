/**
 * Tests for @peac/net-node safeFetch
 *
 * These tests use dependency injection to mock DNS resolution and HTTP fetch,
 * allowing comprehensive testing without actual network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  safeFetch,
  safeFetchJson,
  safeFetchRaw,
  safeFetchJWKS,
  SAFE_FETCH_ERROR_CODES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_ALLOWED_METHODS,
  DEFAULT_MAX_RESPONSE_BYTES,
  MAX_JWKS_RESPONSE_BYTES,
  RESPONSE_BYTES_MEASUREMENT,
  ALLOW_MIXED_DNS_ACK,
  MAX_PENDING_AUDIT_EVENTS,
  getAuditQueueStats,
  canonicalizeEvidence,
  computeEvidenceDigest,
  DANGEROUS_PORTS,
  ALLOW_DANGEROUS_PORTS_ACK,
  type DnsResolver,
  type HttpClient,
  type RedirectPolicy,
} from '../src/index';

// Import _internals from testing subpath (not exported from main entry)
import { _internals } from '../src/testing';

// -----------------------------------------------------------------------------
// Mock Implementations
// -----------------------------------------------------------------------------

/**
 * Create a mock DNS resolver that returns separate IPv4/IPv6 arrays
 */
function createMockDnsResolver(ipv4: string[] = [], ipv6: string[] = []): DnsResolver {
  return {
    resolveAll: vi.fn().mockResolvedValue({ ipv4, ipv6 }),
  };
}

/**
 * Create a mock DNS resolver that fails
 */
function createFailingDnsResolver(error: Error): DnsResolver {
  return {
    resolveAll: vi.fn().mockRejectedValue(error),
  };
}

/**
 * Create a mock response body reader
 */
function createMockBody(data: unknown): ReadableStream<Uint8Array> {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/**
 * Create a mock HTTP client that returns { response, close }
 */
function createMockHttpClient(response: Partial<Response>, json?: unknown): HttpClient {
  const mockResponse = {
    status: 200,
    headers: new Headers(),
    body: json !== undefined ? createMockBody(json) : createMockBody({}),
    ...response,
  } as unknown as Response;

  const closeFn = vi.fn().mockResolvedValue(undefined);

  return {
    fetch: vi.fn().mockResolvedValue({ response: mockResponse, close: closeFn }),
  };
}

/**
 * Create a mock HTTP client that returns different responses
 */
function createSequentialHttpClient(
  responses: Array<{ response: Partial<Response>; json?: unknown }>
): HttpClient {
  let callIndex = 0;
  const closeFn = vi.fn().mockResolvedValue(undefined);

  return {
    fetch: vi.fn().mockImplementation(async () => {
      const config = responses[callIndex % responses.length];
      callIndex++;
      const mockResponse = {
        status: 200,
        headers: new Headers(),
        body: config.json !== undefined ? createMockBody(config.json) : createMockBody({}),
        ...config.response,
      } as unknown as Response;
      return { response: mockResponse, close: closeFn };
    }),
  };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('@peac/net-node', () => {
  describe('Constants', () => {
    it('should export DEFAULT_TIMEOUT_MS', () => {
      expect(DEFAULT_TIMEOUT_MS).toBe(30000);
    });

    it('should export DEFAULT_MAX_REDIRECTS', () => {
      expect(DEFAULT_MAX_REDIRECTS).toBe(5);
    });

    it('should export DEFAULT_ALLOWED_METHODS', () => {
      expect(DEFAULT_ALLOWED_METHODS).toEqual(['GET', 'HEAD']);
    });

    it('should export DEFAULT_MAX_RESPONSE_BYTES', () => {
      expect(DEFAULT_MAX_RESPONSE_BYTES).toBe(2 * 1024 * 1024);
    });

    it('should export MAX_JWKS_RESPONSE_BYTES', () => {
      expect(MAX_JWKS_RESPONSE_BYTES).toBe(512 * 1024);
    });

    it('should export RESPONSE_BYTES_MEASUREMENT as decoded', () => {
      // P0.4: Compression semantics documentation
      // maxResponseBytes measures DECODED bytes (after potential decompression)
      expect(RESPONSE_BYTES_MEASUREMENT).toBe('decoded');
    });

    it('should export SAFE_FETCH_ERROR_CODES', () => {
      expect(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED).toBe('E_NET_SSRF_URL_REJECTED');
      expect(SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE).toBe(
        'E_NET_SSRF_DNS_RESOLVED_PRIVATE'
      );
      expect(SAFE_FETCH_ERROR_CODES.E_SSRF_ALL_IPS_BLOCKED).toBe('E_NET_SSRF_ALL_IPS_BLOCKED');
      expect(SAFE_FETCH_ERROR_CODES.E_SSRF_REDIRECT_BLOCKED).toBe('E_NET_SSRF_REDIRECT_BLOCKED');
      expect(SAFE_FETCH_ERROR_CODES.E_SSRF_TOO_MANY_REDIRECTS).toBe(
        'E_NET_SSRF_TOO_MANY_REDIRECTS'
      );
      expect(SAFE_FETCH_ERROR_CODES.E_SSRF_ALLOWCIDRS_ACK_REQUIRED).toBe(
        'E_NET_SSRF_ALLOWCIDRS_ACK_REQUIRED'
      );
      expect(SAFE_FETCH_ERROR_CODES.E_DNS_RESOLUTION_FAILED).toBe('E_NET_DNS_RESOLUTION_FAILED');
      expect(SAFE_FETCH_ERROR_CODES.E_REQUEST_TIMEOUT).toBe('E_NET_REQUEST_TIMEOUT');
      expect(SAFE_FETCH_ERROR_CODES.E_NETWORK_ERROR).toBe('E_NET_NETWORK_ERROR');
      expect(SAFE_FETCH_ERROR_CODES.E_METHOD_NOT_ALLOWED).toBe('E_NET_METHOD_NOT_ALLOWED');
      expect(SAFE_FETCH_ERROR_CODES.E_RESPONSE_TOO_LARGE).toBe('E_NET_RESPONSE_TOO_LARGE');
      expect(SAFE_FETCH_ERROR_CODES.E_PARSE_ERROR).toBe('E_NET_PARSE_ERROR');
    });
  });

  describe('safeFetch URL validation (string-level)', () => {
    it('should reject localhost URLs', async () => {
      const result = await safeFetch('https://localhost/api');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
      }
    });

    it('should reject private IP URLs (10.x.x.x)', async () => {
      const result = await safeFetch('https://10.0.0.1/api');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
      }
    });

    it('should reject private IP URLs (192.168.x.x)', async () => {
      const result = await safeFetch('https://192.168.1.1/api');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
      }
    });

    it('should reject private IP URLs (172.16.x.x)', async () => {
      const result = await safeFetch('https://172.16.0.1/api');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
      }
    });

    it('should reject HTTP URLs by default', async () => {
      const result = await safeFetch('http://example.com/api');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
      }
    });

    it('should reject IP literal URLs by default', async () => {
      const result = await safeFetch('https://8.8.8.8/api');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
      }
    });

    it('should reject CGNAT range by default', async () => {
      const result = await safeFetch('https://100.64.1.1/api');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
      }
    });

    it('should reject loopback addresses', async () => {
      const result = await safeFetch('https://127.0.0.1/api');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
      }
    });

    it('should reject link-local addresses', async () => {
      const result = await safeFetch('https://169.254.169.254/api');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
      }
    });

    it('should reject URLs with credentials', async () => {
      const result = await safeFetch('https://user:pass@example.com/api');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
      }
    });

    it('should reject invalid URLs', async () => {
      const result = await safeFetch('not-a-valid-url');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
      }
    });
  });

  describe('HTTP method restrictions', () => {
    // Note: We use 93.184.216.34 (example.com) as a valid public IP.
    // Cannot use 203.0.113.0/24 (TEST-NET-3) as it's now blocked per RFC 6890.
    it('should allow GET by default', async () => {
      const mockResolver = createMockDnsResolver(['93.184.216.34']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { data: 'ok' });

      const result = await safeFetchJson('https://example.com/api', {
        method: 'GET',
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(true);
    });

    it('should allow HEAD by default', async () => {
      const mockResolver = createMockDnsResolver(['93.184.216.34']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, {});

      const result = await safeFetchRaw('https://example.com/api', {
        method: 'HEAD',
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        await result.close();
      }
    });

    it('should reject POST by default', async () => {
      const result = await safeFetch('https://example.com/api', {
        method: 'POST',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_METHOD_NOT_ALLOWED);
        expect(result.error).toContain('POST');
      }
    });

    it('should reject PUT by default', async () => {
      const result = await safeFetch('https://example.com/api', {
        method: 'PUT',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_METHOD_NOT_ALLOWED);
      }
    });

    it('should allow POST when explicitly permitted', async () => {
      const mockResolver = createMockDnsResolver(['93.184.216.34']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { data: 'ok' });

      const result = await safeFetch('https://example.com/api', {
        method: 'POST',
        allowedMethods: ['GET', 'POST'],
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('safeFetch DNS resolution with mocked resolver', () => {
    it('should block DNS resolution to private IPs', async () => {
      const mockResolver = createMockDnsResolver(['10.0.0.1']);
      const mockHttpClient = createMockHttpClient({ status: 200 });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE);
        // P0.1: Error messages are now generic (non-sensitive)
        // Sensitive details (IPs) are in dns_answers for audit, not in error string
        expect(result.error).toBe('DNS resolved to blocked addresses');
        // Verify dns_answers contains the blocked IP for audit purposes
        expect(result.dns_answers).toBeDefined();
        expect(result.dns_answers).toContainEqual(
          expect.objectContaining({ ip: '10.0.0.1', blocked_reason: expect.any(String) })
        );
      }
      expect(mockResolver.resolveAll).toHaveBeenCalledWith('example.com');
      expect(mockHttpClient.fetch).not.toHaveBeenCalled();
    });

    it('should block DNS resolution to loopback', async () => {
      const mockResolver = createMockDnsResolver(['127.0.0.1']);
      const mockHttpClient = createMockHttpClient({ status: 200 });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE);
      }
    });

    it('should block DNS resolution to link-local', async () => {
      const mockResolver = createMockDnsResolver(['169.254.169.254']);
      const mockHttpClient = createMockHttpClient({ status: 200 });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE);
      }
    });

    it('should block DNS resolution to CGNAT by default', async () => {
      const mockResolver = createMockDnsResolver(['100.64.1.1']);
      const mockHttpClient = createMockHttpClient({ status: 200 });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE);
      }
    });

    it('should block if ANY resolved IP is private (mixed IPs)', async () => {
      // Attacker technique: add both public and private IPs
      // P0.2: Mixed DNS now has distinct error code
      const mockResolver = createMockDnsResolver(['8.8.8.8', '10.0.0.1']);
      const mockHttpClient = createMockHttpClient({ status: 200 });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_MIXED_DNS_BLOCKED);
      }
    });

    it('should succeed with public IP', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { keys: [] });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(true);
      expect(mockHttpClient.fetch).toHaveBeenCalledWith(
        'https://example.com/api',
        '8.8.8.8',
        expect.any(Object)
      );
    });

    it('should handle DNS resolution failure', async () => {
      const mockResolver = createFailingDnsResolver(new Error('ENOTFOUND'));
      const mockHttpClient = createMockHttpClient({ status: 200 });

      const result = await safeFetch('https://nonexistent.example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_DNS_RESOLUTION_FAILED);
        // P0.1: Error messages are now generic (non-sensitive)
        // Original error details are not leaked in error string
        expect(result.error).toBe('DNS resolution failed');
      }
    });

    it('should handle empty DNS response', async () => {
      const mockResolver = createMockDnsResolver([], []);
      const mockHttpClient = createMockHttpClient({ status: 200 });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_DNS_RESOLUTION_FAILED);
      }
    });

    it('should prefer IPv6 addresses (RFC 8305)', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8'], ['2001:4860:4860::8888']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { data: 'test' });

      await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      // IPv6 should be selected first
      expect(mockHttpClient.fetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  describe('RFC 6890-grade special range blocking', () => {
    it('should block benchmarking range (198.18.0.0/15)', async () => {
      const mockResolver = createMockDnsResolver(['198.18.1.1']);
      const mockHttpClient = createMockHttpClient({ status: 200 });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE);
      }
    });

    it('should block documentation range TEST-NET-1 (192.0.2.0/24)', async () => {
      const mockResolver = createMockDnsResolver(['192.0.2.1']);
      const mockHttpClient = createMockHttpClient({ status: 200 });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE);
      }
    });

    it('should block documentation range TEST-NET-2 (198.51.100.0/24)', async () => {
      const mockResolver = createMockDnsResolver(['198.51.100.1']);
      const mockHttpClient = createMockHttpClient({ status: 200 });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE);
      }
    });

    it('should block documentation range TEST-NET-3 (203.0.113.0/24)', async () => {
      const mockResolver = createMockDnsResolver(['203.0.113.1']);
      const mockHttpClient = createMockHttpClient({ status: 200 });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE);
      }
    });

    it('should block IPv6 documentation range (2001:db8::/32)', async () => {
      const mockResolver = createMockDnsResolver([], ['2001:db8::1']);
      const mockHttpClient = createMockHttpClient({ status: 200 });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE);
      }
    });
  });

  describe('Redirect policy', () => {
    it('should follow same-origin redirects with same-origin policy', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createSequentialHttpClient([
        {
          response: {
            status: 302,
            headers: new Headers({ location: '/new-path' }),
          },
        },
        {
          response: { status: 200 },
          json: { data: 'final' },
        },
      ]);

      const result = await safeFetch('https://example.com/api', {
        redirectPolicy: 'same-origin',
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(true);
      expect(mockHttpClient.fetch).toHaveBeenCalledTimes(2);
    });

    it('should block cross-origin redirects with same-origin policy', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({
        status: 302,
        headers: new Headers({ location: 'https://evil.com/redirect' }),
      });

      const result = await safeFetch('https://example.com/api', {
        redirectPolicy: 'same-origin',
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_REDIRECT_BLOCKED);
      }
    });

    it('should allow same-registrable-domain redirects', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createSequentialHttpClient([
        {
          response: {
            status: 302,
            headers: new Headers({ location: 'https://cdn.example.com/file' }),
          },
        },
        {
          response: { status: 200 },
          json: { data: 'from cdn' },
        },
      ]);

      const result = await safeFetch('https://api.example.com/api', {
        redirectPolicy: 'same-registrable-domain',
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(true);
    });

    it('should block different-domain redirects with same-registrable-domain policy', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({
        status: 302,
        headers: new Headers({ location: 'https://evil.com/redirect' }),
      });

      const result = await safeFetch('https://example.com/api', {
        redirectPolicy: 'same-registrable-domain',
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_REDIRECT_BLOCKED);
      }
    });

    it('should use allowlist for redirect validation', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createSequentialHttpClient([
        {
          response: {
            status: 302,
            headers: new Headers({ location: 'https://trusted-cdn.com/file' }),
          },
        },
        {
          response: { status: 200 },
          json: { data: 'from trusted cdn' },
        },
      ]);

      const result = await safeFetch('https://example.com/api', {
        redirectPolicy: 'allowlist',
        redirectAllowHosts: ['trusted-cdn.com'],
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(true);
    });

    it('should block redirects with none policy', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({
        status: 302,
        headers: new Headers({ location: '/same-host' }),
      });

      const result = await safeFetch('https://example.com/api', {
        redirectPolicy: 'none',
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_REDIRECT_BLOCKED);
      }
    });

    it('should handle deprecated allowCrossHostRedirects', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createSequentialHttpClient([
        {
          response: {
            status: 302,
            headers: new Headers({ location: 'https://cdn.example.com/file' }),
          },
        },
        {
          response: { status: 200 },
          json: { data: 'ok' },
        },
      ]);

      const result = await safeFetch('https://api.example.com/api', {
        allowCrossHostRedirects: true,
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.warnings).toContain(
          'allowCrossHostRedirects is deprecated, use redirectPolicy instead'
        );
      }
    });

    it('should enforce maxRedirects', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({
        status: 302,
        headers: new Headers({ location: '/redirect' }),
      });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        maxRedirects: 2,
      });

      // After 3 calls (initial + 2 redirects), should fail
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_TOO_MANY_REDIRECTS);
      }
    });

    it('should reject redirect with missing Location header', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({
        status: 302,
        headers: new Headers(), // No Location header
      });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_REDIRECT_BLOCKED);
      }
    });
  });

  describe('Response size limits', () => {
    it('should reject responses exceeding maxResponseBytes', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const largeData = 'x'.repeat(1000); // 1000 bytes
      const mockHttpClient = createMockHttpClient({ status: 200 }, largeData);

      const result = await safeFetchJson('https://example.com/api', {
        maxResponseBytes: 100, // Only allow 100 bytes
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_RESPONSE_TOO_LARGE);
      }
    });

    it('should accept responses within maxResponseBytes', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { small: 'data' });

      const result = await safeFetchJson('https://example.com/api', {
        maxResponseBytes: 1000,
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('safeFetchJWKS', () => {
    it('should use shorter timeout', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { keys: [] });

      await safeFetchJWKS('https://issuer.example.com/.well-known/jwks.json', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(mockHttpClient.fetch).toHaveBeenCalledWith(
        'https://issuer.example.com/.well-known/jwks.json',
        '8.8.8.8',
        expect.objectContaining({ timeoutMs: 10000 })
      );
    });

    it('should reject redirects for JWKS', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({
        status: 302,
        headers: new Headers({ location: '/moved' }),
      });

      const result = await safeFetchJWKS('https://issuer.example.com/.well-known/jwks.json', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      // maxRedirects is 0 for JWKS, so first redirect should fail
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_TOO_MANY_REDIRECTS);
      }
    });

    it('should use smaller response size limit', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const largeJwks = { keys: Array(10000).fill({ kty: 'RSA', n: 'x'.repeat(1000) }) };
      const mockHttpClient = createMockHttpClient({ status: 200 }, largeJwks);

      const result = await safeFetchJWKS('https://issuer.example.com/.well-known/jwks.json', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      // Should fail due to size limit (512KB for JWKS)
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_RESPONSE_TOO_LARGE);
      }
    });
  });

  describe('SSRF policy options', () => {
    it('should allow HTTP when requireHttps is false', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { data: 'ok' });

      const result = await safeFetch('http://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        ssrfPolicy: {
          requireHttps: false,
        },
      });

      expect(result.ok).toBe(true);
    });

    it('should allow CGNAT when properly acknowledged', async () => {
      const mockResolver = createMockDnsResolver(['100.64.1.1']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { data: 'ok' });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        ssrfPolicy: {
          allowCgnat: true,
          ack_allow_cgnat: 'I_UNDERSTAND_CGNAT_SECURITY_RISKS',
        },
      });

      expect(result.ok).toBe(true);
    });

    it('should block CGNAT without proper acknowledgment', async () => {
      const mockResolver = createMockDnsResolver(['100.64.1.1']);
      const mockHttpClient = createMockHttpClient({ status: 200 });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        ssrfPolicy: {
          allowCgnat: true,
          // Missing acknowledgment
        },
      });

      expect(result.ok).toBe(false);
    });

    it('should require ack for allowCidrs containing dangerous ranges', async () => {
      const result = await safeFetch('https://example.com/api', {
        ssrfPolicy: {
          allowCidrs: ['10.0.0.0/8'], // Private range without ack
        },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_ALLOWCIDRS_ACK_REQUIRED);
      }
    });

    it('should allow public CIDR in allowCidrs without ack', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { data: 'ok' });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        ssrfPolicy: {
          allowCidrs: ['8.8.8.0/24'], // Public range, no ack needed
        },
      });

      expect(result.ok).toBe(true);
    });

    it('should respect custom allowCidrs (with proper ack)', async () => {
      const mockResolver = createMockDnsResolver(['10.0.5.100']); // Private, but in allowCidrs
      const mockHttpClient = createMockHttpClient({ status: 200 }, { data: 'ok' });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        ssrfPolicy: {
          allowCidrs: ['10.0.5.0/24'],
          ack_allow_dangerous_cidrs: 'I_UNDERSTAND_ALLOWING_PRIVATE_CIDRS_IS_DANGEROUS',
        },
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('safeFetchRaw lifecycle', () => {
    it('should return close function that must be called', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const closeFn = vi.fn().mockResolvedValue(undefined);
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockResolvedValue({
          response: {
            status: 200,
            headers: new Headers(),
            body: createMockBody({ data: 'test' }),
          } as unknown as Response,
          close: closeFn,
        }),
      };

      const result = await safeFetchRaw('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Close should not have been called yet
        expect(closeFn).not.toHaveBeenCalled();

        // Caller must call close
        await result.close();
        expect(closeFn).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('_internals.isPrivateIP', () => {
    it('should detect private IPv4 addresses', () => {
      expect(_internals.isPrivateIP('10.0.0.1')).toBe(true);
      expect(_internals.isPrivateIP('172.16.0.1')).toBe(true);
      expect(_internals.isPrivateIP('192.168.1.1')).toBe(true);
      expect(_internals.isPrivateIP('127.0.0.1')).toBe(true);
      expect(_internals.isPrivateIP('169.254.169.254')).toBe(true);
    });

    it('should detect CGNAT as private by default', () => {
      expect(_internals.isPrivateIP('100.64.0.1')).toBe(true);
      expect(_internals.isPrivateIP('100.127.255.254')).toBe(true);
    });

    it('should allow CGNAT when policy allows with ack', () => {
      expect(
        _internals.isPrivateIP('100.64.0.1', {
          allowCgnat: true,
          ack_allow_cgnat: 'I_UNDERSTAND_CGNAT_SECURITY_RISKS',
        })
      ).toBe(false);
    });

    it('should block CGNAT when allowCgnat but missing ack', () => {
      expect(_internals.isPrivateIP('100.64.0.1', { allowCgnat: true })).toBe(true);
    });

    it('should detect private IPv6 addresses', () => {
      expect(_internals.isPrivateIP('::1')).toBe(true);
      expect(_internals.isPrivateIP('fe80::1')).toBe(true);
      expect(_internals.isPrivateIP('fc00::1')).toBe(true);
      expect(_internals.isPrivateIP('fd12:3456:789a::1')).toBe(true);
    });

    it('should detect RFC 6890 special ranges', () => {
      expect(_internals.isPrivateIP('192.0.2.1')).toBe(true); // TEST-NET-1
      expect(_internals.isPrivateIP('198.18.1.1')).toBe(true); // Benchmarking
      expect(_internals.isPrivateIP('198.51.100.1')).toBe(true); // TEST-NET-2
      expect(_internals.isPrivateIP('203.0.113.1')).toBe(true); // TEST-NET-3
      expect(_internals.isPrivateIP('2001:db8::1')).toBe(true); // IPv6 doc
    });

    it('should allow public IPs', () => {
      expect(_internals.isPrivateIP('8.8.8.8')).toBe(false);
      expect(_internals.isPrivateIP('1.1.1.1')).toBe(false);
      expect(_internals.isPrivateIP('2001:4860:4860::8888')).toBe(false);
    });

    it('should fail-closed on invalid IPs', () => {
      expect(_internals.isPrivateIP('not-an-ip')).toBe(true);
      expect(_internals.isPrivateIP('')).toBe(true);
    });
  });

  describe('_internals.validateAllowCidrsAck', () => {
    it('should pass for empty allowCidrs', () => {
      expect(_internals.validateAllowCidrsAck({})).toEqual({ valid: true });
      expect(_internals.validateAllowCidrsAck({ allowCidrs: [] })).toEqual({ valid: true });
    });

    it('should pass for public CIDRs without ack', () => {
      expect(
        _internals.validateAllowCidrsAck({
          allowCidrs: ['8.8.8.0/24'],
        })
      ).toEqual({ valid: true });
    });

    it('should fail for private CIDRs without ack', () => {
      const result = _internals.validateAllowCidrsAck({
        allowCidrs: ['10.0.0.0/8'],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ack_allow_dangerous_cidrs');
    });

    it('should pass for private CIDRs with proper ack', () => {
      expect(
        _internals.validateAllowCidrsAck({
          allowCidrs: ['10.0.0.0/8'],
          ack_allow_dangerous_cidrs: 'I_UNDERSTAND_ALLOWING_PRIVATE_CIDRS_IS_DANGEROUS',
        })
      ).toEqual({ valid: true });
    });
  });

  describe('_internals.getRegistrableDomain', () => {
    it('should extract eTLD+1 from hostname', () => {
      expect(_internals.getRegistrableDomain('www.example.com')).toBe('example.com');
      expect(_internals.getRegistrableDomain('api.cdn.example.com')).toBe('example.com');
      expect(_internals.getRegistrableDomain('example.com')).toBe('example.com');
    });

    it('should handle common multi-part TLDs', () => {
      expect(_internals.getRegistrableDomain('www.example.co.uk')).toBe('example.co.uk');
      expect(_internals.getRegistrableDomain('api.example.com.au')).toBe('example.com.au');
    });

    it('should return IP addresses as-is', () => {
      expect(_internals.getRegistrableDomain('8.8.8.8')).toBe('8.8.8.8');
    });
  });

  describe('_internals.isRedirectAllowed', () => {
    const origUrl = new URL('https://example.com/api');

    it('should allow same-origin redirects with same-origin policy', () => {
      const redirUrl = new URL('https://example.com/other');
      expect(_internals.isRedirectAllowed(origUrl, redirUrl, 'same-origin')).toBe(true);
    });

    it('should block different-origin redirects with same-origin policy', () => {
      const redirUrl = new URL('https://other.com/api');
      expect(_internals.isRedirectAllowed(origUrl, redirUrl, 'same-origin')).toBe(false);
    });

    it('should block all redirects with none policy', () => {
      const redirUrl = new URL('https://example.com/other');
      expect(_internals.isRedirectAllowed(origUrl, redirUrl, 'none')).toBe(false);
    });

    it('should allow same-registrable-domain redirects', () => {
      const orig = new URL('https://api.example.com/api');
      const redir = new URL('https://cdn.example.com/file');
      expect(_internals.isRedirectAllowed(orig, redir, 'same-registrable-domain')).toBe(true);
    });

    it('should allow http to https upgrade with same-registrable-domain', () => {
      const orig = new URL('http://example.com/api');
      const redir = new URL('https://example.com/api');
      expect(_internals.isRedirectAllowed(orig, redir, 'same-registrable-domain')).toBe(true);
    });
  });

  describe('_internals.parseCidr', () => {
    it('should parse valid IPv4 CIDRs', () => {
      const result = _internals.parseCidr('192.168.1.0/24');
      expect(result).not.toBeNull();
      if (result) {
        expect(result[1]).toBe(24);
      }
    });

    it('should parse valid IPv6 CIDRs', () => {
      const result = _internals.parseCidr('2001:db8::/32');
      expect(result).not.toBeNull();
      if (result) {
        expect(result[1]).toBe(32);
      }
    });

    it('should return null for invalid CIDRs', () => {
      expect(_internals.parseCidr('not-a-cidr')).toBeNull();
      expect(_internals.parseCidr('192.168.1.0')).toBeNull(); // Missing prefix
    });
  });

  describe('_internals.matchesAnyCidr', () => {
    it('should match IP against CIDR list', () => {
      const ipaddr = require('ipaddr.js');
      const addr = ipaddr.parse('192.168.1.50');
      expect(_internals.matchesAnyCidr(addr, ['192.168.1.0/24'])).toBe(true);
      expect(_internals.matchesAnyCidr(addr, ['10.0.0.0/8'])).toBe(false);
    });

    it('should handle empty CIDR list', () => {
      const ipaddr = require('ipaddr.js');
      const addr = ipaddr.parse('192.168.1.50');
      expect(_internals.matchesAnyCidr(addr, [])).toBe(false);
    });

    it('should skip invalid CIDRs', () => {
      const ipaddr = require('ipaddr.js');
      const addr = ipaddr.parse('192.168.1.50');
      expect(_internals.matchesAnyCidr(addr, ['invalid', '192.168.1.0/24'])).toBe(true);
    });
  });

  // ============================================================================
  // ADVERSARIAL SECURITY TESTS
  // Tests for edge cases that could lead to SSRF bypasses if mishandled
  // ============================================================================
  describe('adversarial: IPv6 hostname handling', () => {
    it('should not truncate IPv6 addresses at colon', () => {
      // The bug: split(':')[0] would truncate "2001:db8::1" to "2001"
      // IPv6 addresses contain colons as part of the address, not port separator
      const ipv6 = '2001:db8::1';
      expect(_internals.getRegistrableDomain(ipv6)).toBe(ipv6);
    });

    it('should handle full IPv6 addresses', () => {
      // IPv6 addresses may be normalized (leading zeros removed, :: compression)
      const fullIpv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      const normalized = '2001:db8:85a3::8a2e:370:7334'; // ipaddr.js normalizes
      expect(_internals.getRegistrableDomain(fullIpv6)).toBe(normalized);
    });

    it('should handle IPv6 loopback', () => {
      expect(_internals.getRegistrableDomain('::1')).toBe('::1');
      expect(_internals.isPrivateIP('::1')).toBe(true);
    });

    it('should handle IPv6 link-local addresses', () => {
      // fe80::/10 - link-local
      expect(_internals.isPrivateIP('fe80::1')).toBe(true);
      expect(_internals.isPrivateIP('fe80::1234:5678:abcd:ef01')).toBe(true);
    });

    it('should handle IPv6 ULA (Unique Local Address)', () => {
      // fc00::/7 - unique local (private)
      expect(_internals.isPrivateIP('fc00::1')).toBe(true);
      expect(_internals.isPrivateIP('fd12:3456:789a::1')).toBe(true);
    });

    it('should block IPv6 documentation range', () => {
      // 2001:db8::/32 - documentation range (should be blocked like TEST-NET)
      expect(_internals.isPrivateIP('2001:db8::1')).toBe(true);
      expect(_internals.isPrivateIP('2001:db8:ffff:ffff::1')).toBe(true);
    });

    it('should allow public IPv6 addresses', () => {
      // Google's public DNS
      expect(_internals.isPrivateIP('2001:4860:4860::8888')).toBe(false);
      expect(_internals.isPrivateIP('2606:4700:4700::1111')).toBe(false);
    });
  });

  describe('adversarial: hostname normalization', () => {
    it('should normalize trailing dot in hostnames', () => {
      // DNS FQDNs can have trailing dot - must be normalized
      expect(_internals.normalizeHostname('example.com.')).toBe('example.com');
      expect(_internals.normalizeHostname('www.example.com.')).toBe('www.example.com');
    });

    it('should normalize case in hostnames', () => {
      // DNS is case-insensitive
      expect(_internals.normalizeHostname('EXAMPLE.COM')).toBe('example.com');
      expect(_internals.normalizeHostname('Example.COM')).toBe('example.com');
      expect(_internals.normalizeHostname('eXaMpLe.CoM')).toBe('example.com');
    });

    it('should handle trailing dot and case together', () => {
      expect(_internals.normalizeHostname('EXAMPLE.COM.')).toBe('example.com');
      expect(_internals.normalizeHostname('Www.Example.Com.')).toBe('www.example.com');
    });

    it('should handle empty hostname', () => {
      expect(_internals.normalizeHostname('')).toBe('');
    });

    it('should preserve IPv4 addresses', () => {
      expect(_internals.normalizeHostname('192.168.1.1')).toBe('192.168.1.1');
    });

    it('should preserve IPv6 addresses (no case change needed)', () => {
      // IPv6 hex digits should be normalized to lowercase
      expect(_internals.normalizeHostname('2001:DB8::1')).toBe('2001:db8::1');
      expect(_internals.normalizeHostname('FE80::1')).toBe('fe80::1');
    });
  });

  describe('adversarial: PSL edge cases', () => {
    it('should correctly handle github.io as public suffix', () => {
      // github.io is a public suffix, so user.github.io is the eTLD+1
      const result = _internals.getRegistrableDomain('user.github.io');
      expect(result).toBe('user.github.io');
    });

    it('should correctly handle co.uk as public suffix', () => {
      expect(_internals.getRegistrableDomain('www.example.co.uk')).toBe('example.co.uk');
      expect(_internals.getRegistrableDomain('api.cdn.example.co.uk')).toBe('example.co.uk');
    });

    it('should correctly handle com.au as public suffix', () => {
      expect(_internals.getRegistrableDomain('www.example.com.au')).toBe('example.com.au');
    });

    it('should handle blogspot.com as public suffix', () => {
      // blogspot.com is in the public suffix list
      const result = _internals.getRegistrableDomain('myblog.blogspot.com');
      expect(result).toBe('myblog.blogspot.com');
    });

    it('should handle TLD-only domains', () => {
      // Bare TLD should return as-is (no registrable domain above TLD)
      const result = _internals.getRegistrableDomain('com');
      expect(result).toBe('com');
    });

    it('should handle localhost', () => {
      const result = _internals.getRegistrableDomain('localhost');
      expect(result).toBe('localhost');
    });

    it('should handle single-label internal hostnames', () => {
      // Internal hostnames like "fileserver" should be preserved
      const result = _internals.getRegistrableDomain('fileserver');
      expect(result).toBe('fileserver');
    });
  });

  describe('adversarial: mixed DNS resolution (public + private)', () => {
    it('should block when DNS returns both public and private IPs (default)', async () => {
      // Some DNS servers return both public and private IPs
      // Default behavior should block if ANY private IP is returned
      // P0.2: Mixed DNS now has distinct error code
      const mockResolver = createMockDnsResolver(['8.8.8.8', '192.168.1.1']);
      const mockHttpClient = createMockHttpClient({ data: 'test' });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_MIXED_DNS_BLOCKED);
      }
    });

    it('should allow mixed DNS with correct ack (explicit opt-in)', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8', '192.168.1.1']);
      const mockHttpClient = createMockHttpClient({ data: 'test' });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        allowMixedPublicAndPrivateDns: true,
        ack_allow_mixed_dns: ALLOW_MIXED_DNS_ACK,
      });

      expect(result.ok).toBe(true);
    });

    it('should block mixed DNS with allowMixedPublicAndPrivateDns but wrong ack', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8', '192.168.1.1']);
      const mockHttpClient = createMockHttpClient({ data: 'test' });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        allowMixedPublicAndPrivateDns: true,
        ack_allow_mixed_dns: 'wrong_ack_string' as typeof ALLOW_MIXED_DNS_ACK,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Wrong ack returns the mixed DNS ack missing error (P0.2 audit-clean code)
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_MIXED_DNS_ACK_MISSING);
      }
    });

    it('should use E_SSRF_MIXED_DNS_BLOCKED when mixed DNS detected without ack option', async () => {
      // P0.2: Distinct error code for mixed DNS scenario
      const mockResolver = createMockDnsResolver(['8.8.8.8', '192.168.1.1']);
      const mockHttpClient = createMockHttpClient({ data: 'test' });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        // No allowMixedPublicAndPrivateDns option
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Should use the mixed DNS blocked code (not the generic private IP code)
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_MIXED_DNS_BLOCKED);
        // P0.1: Error messages are now generic (non-sensitive)
        expect(result.error).toBe(
          'DNS returned mixed public/private addresses (blocked by policy)'
        );
        // Verify dns_answers contains structured audit data
        expect(result.dns_answers).toBeDefined();
      }
    });

    it('should use E_SSRF_DNS_RESOLVED_PRIVATE when only private IPs returned', async () => {
      // P0.2: Pure private IP case uses the original error code
      const mockResolver = createMockDnsResolver(['192.168.1.1', '10.0.0.1']);
      const mockHttpClient = createMockHttpClient({ data: 'test' });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Should use the private IP code (not the mixed DNS code)
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE);
      }
    });

    it('should use only public IPs when mixed DNS allowed', async () => {
      // When mixed DNS is allowed, only public IPs should be used
      let capturedPinnedIp: string | null = null;
      const mockResolver = createMockDnsResolver(['192.168.1.1', '8.8.8.8']);
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockImplementation(async (url, pinnedIp, options) => {
          capturedPinnedIp = pinnedIp;
          return {
            response: {
              status: 200,
              headers: new Headers(),
              body: createMockBody({ data: 'test' }),
            } as unknown as Response,
            close: vi.fn(),
          };
        }),
      };

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        allowMixedPublicAndPrivateDns: true,
        ack_allow_mixed_dns: ALLOW_MIXED_DNS_ACK,
      });

      expect(result.ok).toBe(true);
      // The fetch should have been called with the public IP only
      expect(capturedPinnedIp).toBe('8.8.8.8');
      expect(mockHttpClient.fetch).toHaveBeenCalled();
    });
  });

  describe('adversarial: Accept-Encoding header casing', () => {
    it('should not override user-set Accept-Encoding (lowercase)', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      let capturedHeaders: Headers | undefined;
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockImplementation(async (url, pinnedIp, options) => {
          capturedHeaders = options?.headers as Headers;
          return {
            response: {
              status: 200,
              headers: new Headers(),
              body: createMockBody({ data: 'test' }),
            } as unknown as Response,
            close: vi.fn(),
          };
        }),
      };

      await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        headers: { 'accept-encoding': 'gzip, deflate' },
      });

      // User's encoding should be preserved (Headers normalizes to lowercase)
      expect(capturedHeaders?.get('accept-encoding')).toBe('gzip, deflate');
    });

    it('should not override user-set Accept-Encoding (mixed case)', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      let capturedHeaders: Headers | undefined;
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockImplementation(async (url, pinnedIp, options) => {
          capturedHeaders = options?.headers as Headers;
          return {
            response: {
              status: 200,
              headers: new Headers(),
              body: createMockBody({ data: 'test' }),
            } as unknown as Response,
            close: vi.fn(),
          };
        }),
      };

      await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        headers: { 'Accept-Encoding': 'gzip, deflate' },
      });

      // User's encoding should be preserved
      expect(capturedHeaders?.get('accept-encoding')).toBe('gzip, deflate');
    });

    it('should not override user-set Accept-Encoding (uppercase)', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      let capturedHeaders: Headers | undefined;
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockImplementation(async (url, pinnedIp, options) => {
          capturedHeaders = options?.headers as Headers;
          return {
            response: {
              status: 200,
              headers: new Headers(),
              body: createMockBody({ data: 'test' }),
            } as unknown as Response,
            close: vi.fn(),
          };
        }),
      };

      await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        headers: { 'ACCEPT-ENCODING': 'gzip, deflate' },
      });

      // User's encoding should be preserved (Headers API normalizes to lowercase)
      expect(capturedHeaders?.get('accept-encoding')).toBe('gzip, deflate');
    });

    it('should set identity encoding when not specified', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      let capturedHeaders: Headers | undefined;
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockImplementation(async (url, pinnedIp, options) => {
          capturedHeaders = options?.headers as Headers;
          return {
            response: {
              status: 200,
              headers: new Headers(),
              body: createMockBody({ data: 'test' }),
            } as unknown as Response,
            close: vi.fn(),
          };
        }),
      };

      await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        // No Accept-Encoding header
      });

      // Should default to identity to prevent decompression bombs
      expect(capturedHeaders?.get('accept-encoding')).toBe('identity');
    });

    it('should allow compression when explicitly enabled', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      let capturedHeaders: Headers | undefined;
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockImplementation(async (url, pinnedIp, options) => {
          capturedHeaders = options?.headers as Headers;
          return {
            response: {
              status: 200,
              headers: new Headers(),
              body: createMockBody({ data: 'test' }),
            } as unknown as Response,
            close: vi.fn(),
          };
        }),
      };

      await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        allowCompression: true,
        // No Accept-Encoding header
      });

      // Should NOT set identity when allowCompression is true
      expect(capturedHeaders?.get('accept-encoding')).toBeNull();
    });
  });

  describe('adversarial: redirect policy enforcement', () => {
    it('should block all redirects with none policy', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockResolvedValue({
          response: {
            status: 302,
            headers: new Headers({ Location: 'https://example.com/other' }),
            body: createMockBody({}),
          } as unknown as Response,
          close: vi.fn(),
        }),
      };

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        redirectPolicy: 'none',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_REDIRECT_BLOCKED);
      }
    });

    it('should block cross-origin redirect with same-origin policy', () => {
      const origUrl = new URL('https://example.com/api');
      const redirUrl = new URL('https://other.com/api');
      expect(_internals.isRedirectAllowed(origUrl, redirUrl, 'same-origin')).toBe(false);
    });

    it('should block subdomain redirect with same-origin policy', () => {
      // same-origin is strict: different subdomain = different origin
      const origUrl = new URL('https://api.example.com/api');
      const redirUrl = new URL('https://cdn.example.com/file');
      expect(_internals.isRedirectAllowed(origUrl, redirUrl, 'same-origin')).toBe(false);
    });

    it('should allow subdomain redirect with same-registrable-domain policy', () => {
      const origUrl = new URL('https://api.example.com/api');
      const redirUrl = new URL('https://cdn.example.com/file');
      expect(_internals.isRedirectAllowed(origUrl, redirUrl, 'same-registrable-domain')).toBe(true);
    });

    it('should block different registrable domain', () => {
      const origUrl = new URL('https://example.com/api');
      const redirUrl = new URL('https://example.org/api');
      expect(_internals.isRedirectAllowed(origUrl, redirUrl, 'same-registrable-domain')).toBe(
        false
      );
    });

    it('should block HTTPS to HTTP downgrade', () => {
      const origUrl = new URL('https://example.com/api');
      const redirUrl = new URL('http://example.com/api');
      // Protocol downgrade should be blocked
      expect(_internals.isRedirectAllowed(origUrl, redirUrl, 'same-origin')).toBe(false);
    });

    it('should allow HTTP to HTTPS upgrade with same-registrable-domain', () => {
      // same-registrable-domain policy allows HTTP->HTTPS upgrade for security
      const origUrl = new URL('http://example.com/api');
      const redirUrl = new URL('https://example.com/api');
      expect(_internals.isRedirectAllowed(origUrl, redirUrl, 'same-registrable-domain')).toBe(true);
    });

    it('should block HTTP to HTTPS with same-origin (strict)', () => {
      // same-origin is strict: different protocol = different origin
      const origUrl = new URL('http://example.com/api');
      const redirUrl = new URL('https://example.com/api');
      expect(_internals.isRedirectAllowed(origUrl, redirUrl, 'same-origin')).toBe(false);
    });

    it('should block redirect to IP address with domain policy', () => {
      // Redirecting to an IP could bypass domain-based policies
      const origUrl = new URL('https://example.com/api');
      const redirUrl = new URL('https://192.168.1.1/api');
      // IP addresses have themselves as registrable domain
      expect(_internals.isRedirectAllowed(origUrl, redirUrl, 'same-registrable-domain')).toBe(
        false
      );
    });

    it('should block redirect to private IP (via DNS check)', async () => {
      // First request resolves to public IP, redirect resolves to private
      let callCount = 0;
      const mockResolver: DnsResolver = {
        resolveAll: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return { ipv4: ['8.8.8.8'], ipv6: [] };
          }
          return { ipv4: ['192.168.1.1'], ipv6: [] };
        }),
      };

      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockResolvedValueOnce({
          response: {
            status: 302,
            headers: new Headers({ Location: 'https://internal.example.com/api' }),
            body: createMockBody({}),
          } as unknown as Response,
          close: vi.fn(),
        }),
      };

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        redirectPolicy: 'same-registrable-domain',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Redirect to private IP is blocked at DNS resolution time
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE);
      }
    });
  });

  describe('adversarial: hasHeaderCaseInsensitive', () => {
    it('should find headers case-insensitively in Headers object', () => {
      const headers = new Headers({ 'Accept-Encoding': 'gzip' });
      expect(_internals.hasHeaderCaseInsensitive(headers, 'accept-encoding')).toBe(true);
      expect(_internals.hasHeaderCaseInsensitive(headers, 'Accept-Encoding')).toBe(true);
      expect(_internals.hasHeaderCaseInsensitive(headers, 'ACCEPT-ENCODING')).toBe(true);
    });

    it('should find headers case-insensitively in plain object', () => {
      const headers = { 'Accept-Encoding': 'gzip' };
      expect(_internals.hasHeaderCaseInsensitive(headers, 'accept-encoding')).toBe(true);
      expect(_internals.hasHeaderCaseInsensitive(headers, 'Accept-Encoding')).toBe(true);
      expect(_internals.hasHeaderCaseInsensitive(headers, 'ACCEPT-ENCODING')).toBe(true);
    });

    it('should find headers case-insensitively in array format', () => {
      const headers: [string, string][] = [['Accept-Encoding', 'gzip']];
      expect(_internals.hasHeaderCaseInsensitive(headers, 'accept-encoding')).toBe(true);
      expect(_internals.hasHeaderCaseInsensitive(headers, 'Accept-Encoding')).toBe(true);
      expect(_internals.hasHeaderCaseInsensitive(headers, 'ACCEPT-ENCODING')).toBe(true);
    });

    it('should return false for missing headers', () => {
      const headers = { 'Content-Type': 'application/json' };
      expect(_internals.hasHeaderCaseInsensitive(headers, 'Accept-Encoding')).toBe(false);
    });

    it('should handle undefined headers', () => {
      expect(_internals.hasHeaderCaseInsensitive(undefined, 'Accept-Encoding')).toBe(false);
    });
  });

  // ============================================================================
  // P0.1: DNS Pinning Verification (CRITICAL SECURITY)
  // ============================================================================
  describe('P0.1: DNS pinning security', () => {
    it('should pin IP at connection time and not re-resolve', async () => {
      // CRITICAL: This test verifies DNS rebinding protection.
      // The resolver returns public IP first, then would return private IP.
      // The HTTP client must use ONLY the first (pinned) IP.
      let resolutionCount = 0;
      const mockResolver: DnsResolver = {
        resolveAll: vi.fn().mockImplementation(async () => {
          resolutionCount++;
          if (resolutionCount === 1) {
            // First resolution: public IP (allowed)
            return { ipv4: ['8.8.8.8'], ipv6: [] };
          }
          // Subsequent resolutions: private IP (would be blocked if called)
          // This simulates DNS rebinding attack
          return { ipv4: ['10.0.0.1'], ipv6: [] };
        }),
      };

      // Track which IP was used for connection
      let connectedToIp: string | null = null;
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockImplementation(async (_url, pinnedIp) => {
          connectedToIp = pinnedIp;
          return {
            response: {
              status: 200,
              headers: new Headers(),
              body: createMockBody({ data: 'test' }),
            } as unknown as Response,
            close: vi.fn(),
          };
        }),
      };

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      // Request should succeed with pinned public IP
      expect(result.ok).toBe(true);
      // DNS should only be called ONCE (not re-resolved for connection)
      expect(resolutionCount).toBe(1);
      // Connection should use the pinned public IP
      expect(connectedToIp).toBe('8.8.8.8');
    });

    it('should record pinned IP in evidence (private level for raw IP)', async () => {
      const mockResolver = createMockDnsResolver(['93.184.216.34']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        evidenceLevel: 'private', // P0.3: Need private level for raw IP
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Evidence must include the actual pinned IP for audit trail
        expect(result.evidence.selected_ip).toBe('93.184.216.34');
        expect(result.evidence.policy_decision).toBe('allow');
      }
    });

    it('should pin different IP per redirect hop (re-validates each hop)', async () => {
      // Each redirect hop must get its own DNS resolution and IP pinning
      let dnsCallCount = 0;
      const mockResolver: DnsResolver = {
        resolveAll: vi.fn().mockImplementation(async (hostname: string) => {
          dnsCallCount++;
          if (hostname === 'first.example.com') {
            return { ipv4: ['8.8.8.8'], ipv6: [] };
          }
          if (hostname === 'second.example.com') {
            return { ipv4: ['8.8.4.4'], ipv6: [] };
          }
          return { ipv4: [], ipv6: [] };
        }),
      };

      const fetchedIps: (string | null)[] = [];
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockImplementation(async (_url, pinnedIp) => {
          fetchedIps.push(pinnedIp);
          if (fetchedIps.length === 1) {
            return {
              response: {
                status: 302,
                headers: new Headers({ Location: 'https://second.example.com/target' }),
                body: createMockBody({}),
              } as unknown as Response,
              close: vi.fn(),
            };
          }
          return {
            response: {
              status: 200,
              headers: new Headers(),
              body: createMockBody({ data: 'success' }),
            } as unknown as Response,
            close: vi.fn(),
          };
        }),
      };

      const result = await safeFetch('https://first.example.com/start', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        redirectPolicy: 'same-registrable-domain',
        maxRedirects: 5,
      });

      expect(result.ok).toBe(true);
      // DNS resolved separately for each hop
      expect(dnsCallCount).toBe(2);
      // Each hop used its own pinned IP
      expect(fetchedIps).toEqual(['8.8.8.8', '8.8.4.4']);
    });
  });

  describe('integration: redirect chain with mixed DNS', () => {
    it('should block redirect chain where final hop returns mixed DNS', async () => {
      // Scenario: Public URL redirects to another URL that resolves to both public and private
      // This tests the full redirect + DNS validation pipeline
      let dnsCallCount = 0;
      const mockResolver: DnsResolver = {
        resolveAll: vi.fn().mockImplementation(async (hostname: string) => {
          dnsCallCount++;
          if (hostname === 'api.example.com') {
            // First hop: pure public
            return { ipv4: ['8.8.8.8'], ipv6: [] };
          }
          if (hostname === 'internal-api.example.com') {
            // Second hop: mixed DNS (attacker-controlled DNS returns both)
            return { ipv4: ['8.8.4.4', '10.0.0.1'], ipv6: [] };
          }
          return { ipv4: [], ipv6: [] };
        }),
      };

      let fetchCallCount = 0;
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockImplementation(async () => {
          fetchCallCount++;
          if (fetchCallCount === 1) {
            // First request returns redirect
            return {
              response: {
                status: 302,
                headers: new Headers({ Location: 'https://internal-api.example.com/data' }),
                body: createMockBody({}),
              } as unknown as Response,
              close: vi.fn(),
            };
          }
          // Should never reach here - DNS check should block
          return {
            response: {
              status: 200,
              headers: new Headers(),
              body: createMockBody({ secret: 'data' }),
            } as unknown as Response,
            close: vi.fn(),
          };
        }),
      };

      const result = await safeFetch('https://api.example.com/start', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        redirectPolicy: 'same-registrable-domain',
        maxRedirects: 5,
      });

      // Should fail with mixed DNS error, not succeed with data
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // P0.2: Mixed DNS (public + private) now has distinct error code
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_MIXED_DNS_BLOCKED);
      }
      // Verify DNS was called for both hostnames
      expect(dnsCallCount).toBe(2);
      // Verify only one fetch was made (redirect target DNS blocked before fetch)
      expect(fetchCallCount).toBe(1);
    });

    it('should allow redirect chain with mixed DNS when explicitly acknowledged', async () => {
      let dnsCallCount = 0;
      const mockResolver: DnsResolver = {
        resolveAll: vi.fn().mockImplementation(async (hostname: string) => {
          dnsCallCount++;
          if (hostname === 'api.example.com') {
            return { ipv4: ['8.8.8.8'], ipv6: [] };
          }
          if (hostname === 'cdn.example.com') {
            // Mixed DNS but with ack it should be allowed
            return { ipv4: ['8.8.4.4', '192.168.1.100'], ipv6: [] };
          }
          return { ipv4: [], ipv6: [] };
        }),
      };

      let fetchCallCount = 0;
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockImplementation(async () => {
          fetchCallCount++;
          if (fetchCallCount === 1) {
            return {
              response: {
                status: 302,
                headers: new Headers({ Location: 'https://cdn.example.com/asset' }),
                body: createMockBody({}),
              } as unknown as Response,
              close: vi.fn(),
            };
          }
          return {
            response: {
              status: 200,
              headers: new Headers({ 'Content-Type': 'application/json' }),
              body: createMockBody({ data: 'success' }),
            } as unknown as Response,
            close: vi.fn(),
          };
        }),
      };

      const result = await safeFetchJson('https://api.example.com/start', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        redirectPolicy: 'same-registrable-domain',
        maxRedirects: 5,
        allowMixedPublicAndPrivateDns: true,
        ack_allow_mixed_dns: ALLOW_MIXED_DNS_ACK,
      });

      // Should succeed because mixed DNS was explicitly acknowledged
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ data: 'success' });
      }
      expect(dnsCallCount).toBe(2);
      expect(fetchCallCount).toBe(2);
    });

    it('should block redirect chain where intermediate hop goes to private IP', async () => {
      // Multi-hop: public -> public -> private (blocked at third DNS check)
      let dnsCallCount = 0;
      const mockResolver: DnsResolver = {
        resolveAll: vi.fn().mockImplementation(async (hostname: string) => {
          dnsCallCount++;
          if (hostname === 'start.example.com') {
            return { ipv4: ['8.8.8.8'], ipv6: [] };
          }
          if (hostname === 'middle.example.com') {
            return { ipv4: ['8.8.4.4'], ipv6: [] };
          }
          if (hostname === 'final.example.com') {
            // Final hop resolves to private IP only
            return { ipv4: ['10.0.0.50'], ipv6: [] };
          }
          return { ipv4: [], ipv6: [] };
        }),
      };

      let fetchCallCount = 0;
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockImplementation(async () => {
          fetchCallCount++;
          if (fetchCallCount === 1) {
            return {
              response: {
                status: 302,
                headers: new Headers({ Location: 'https://middle.example.com/hop' }),
                body: createMockBody({}),
              } as unknown as Response,
              close: vi.fn(),
            };
          }
          if (fetchCallCount === 2) {
            return {
              response: {
                status: 302,
                headers: new Headers({ Location: 'https://final.example.com/data' }),
                body: createMockBody({}),
              } as unknown as Response,
              close: vi.fn(),
            };
          }
          // Should not reach here
          return {
            response: {
              status: 200,
              headers: new Headers(),
              body: createMockBody({ leaked: true }),
            } as unknown as Response,
            close: vi.fn(),
          };
        }),
      };

      const result = await safeFetch('https://start.example.com/begin', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        redirectPolicy: 'same-registrable-domain',
        maxRedirects: 10,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE);
      }
      // DNS called for all 3 hostnames
      expect(dnsCallCount).toBe(3);
      // Only 2 fetches made (third blocked before fetch)
      expect(fetchCallCount).toBe(2);
    });
  });

  describe('adversarial: IPv6 zone ID rejection', () => {
    it('should detect zone ID with hasIPv6ZoneId helper', () => {
      // Zone IDs can be used to bind to specific interfaces, bypassing SSRF
      expect(_internals.hasIPv6ZoneId('fe80::1%eth0')).toBe(true);
      expect(_internals.hasIPv6ZoneId('fe80::1%25eth0')).toBe(true);
      expect(_internals.hasIPv6ZoneId('fe80::1%0')).toBe(true);
      expect(_internals.hasIPv6ZoneId('fe80::1')).toBe(false);
      expect(_internals.hasIPv6ZoneId('example.com')).toBe(false);
    });

    it('should reject zone ID in canonicalizeHost', () => {
      const result = _internals.canonicalizeHost('fe80::1%eth0');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_IPV6_ZONE_ID);
      }
    });

    it('should reject URL-encoded zone ID in canonicalizeHost', () => {
      const result = _internals.canonicalizeHost('fe80::1%25eth0');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_IPV6_ZONE_ID);
      }
    });

    it('should allow zone-free IPv6 in canonicalizeHost', () => {
      const result = _internals.canonicalizeHost('fe80::1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.hostname).toBe('fe80::1');
        expect(result.isIP).toBe(true);
      }
    });

    it('should allow domains in canonicalizeHost', () => {
      const result = _internals.canonicalizeHost('example.com');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.hostname).toBe('example.com');
        expect(result.isIP).toBe(false);
      }
    });
  });

  describe('adversarial: IPv4-mapped IPv6 normalization', () => {
    it('should normalize IPv4-mapped IPv6 to IPv4', () => {
      // ::ffff:127.0.0.1 should be treated as 127.0.0.1
      expect(_internals.normalizeIPv4MappedIPv6('::ffff:127.0.0.1')).toBe('127.0.0.1');
      expect(_internals.normalizeIPv4MappedIPv6('::ffff:192.168.1.1')).toBe('192.168.1.1');
      expect(_internals.normalizeIPv4MappedIPv6('::ffff:8.8.8.8')).toBe('8.8.8.8');
    });

    it('should leave pure IPv6 unchanged', () => {
      expect(_internals.normalizeIPv4MappedIPv6('2001:db8::1')).toBe('2001:db8::1');
      expect(_internals.normalizeIPv4MappedIPv6('::1')).toBe('::1');
    });

    it('should leave pure IPv4 unchanged', () => {
      expect(_internals.normalizeIPv4MappedIPv6('192.168.1.1')).toBe('192.168.1.1');
      expect(_internals.normalizeIPv4MappedIPv6('8.8.8.8')).toBe('8.8.8.8');
    });

    it('should block IPv4-mapped private addresses', () => {
      // ::ffff:127.0.0.1 is loopback and should be blocked
      expect(_internals.isPrivateIP('::ffff:127.0.0.1')).toBe(true);
      // ::ffff:192.168.1.1 is private and should be blocked
      expect(_internals.isPrivateIP('::ffff:192.168.1.1')).toBe(true);
      // ::ffff:10.0.0.1 is private and should be blocked
      expect(_internals.isPrivateIP('::ffff:10.0.0.1')).toBe(true);
    });

    it('should allow IPv4-mapped public addresses', () => {
      // ::ffff:8.8.8.8 is public and should be allowed
      expect(_internals.isPrivateIP('::ffff:8.8.8.8')).toBe(false);
    });

    it('should canonicalize IPv4-mapped IPv6 correctly', () => {
      const result = _internals.canonicalizeHost('::ffff:127.0.0.1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.hostname).toBe('127.0.0.1');
        expect(result.isIP).toBe(true);
      }
    });
  });

  describe('adversarial: hop-by-hop header stripping', () => {
    it('should strip Connection header', () => {
      const headers = new Headers({ Connection: 'keep-alive' });
      _internals.stripHopByHopHeaders(headers);
      expect(headers.has('connection')).toBe(false);
    });

    it('should strip Transfer-Encoding header', () => {
      const headers = new Headers({ 'Transfer-Encoding': 'chunked' });
      _internals.stripHopByHopHeaders(headers);
      expect(headers.has('transfer-encoding')).toBe(false);
    });

    it('should strip Upgrade header', () => {
      const headers = new Headers({ Upgrade: 'websocket' });
      _internals.stripHopByHopHeaders(headers);
      expect(headers.has('upgrade')).toBe(false);
    });

    it('should strip Proxy-Connection header', () => {
      const headers = new Headers({ 'Proxy-Connection': 'keep-alive' });
      _internals.stripHopByHopHeaders(headers);
      expect(headers.has('proxy-connection')).toBe(false);
    });

    it('should strip headers listed in Connection header', () => {
      // Custom headers listed in Connection should also be stripped
      const headers = new Headers({
        Connection: 'X-Custom-Header, Keep-Alive',
        'X-Custom-Header': 'sensitive-value',
        'Keep-Alive': 'timeout=5',
      });
      _internals.stripHopByHopHeaders(headers);
      expect(headers.has('connection')).toBe(false);
      expect(headers.has('x-custom-header')).toBe(false);
      expect(headers.has('keep-alive')).toBe(false);
    });

    it('should preserve non-hop-by-hop headers', () => {
      const headers = new Headers({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
        Accept: 'application/json',
      });
      _internals.stripHopByHopHeaders(headers);
      expect(headers.get('content-type')).toBe('application/json');
      expect(headers.get('authorization')).toBe('Bearer token');
      expect(headers.get('accept')).toBe('application/json');
    });

    it('should strip hop-by-hop headers case-insensitively', () => {
      const headers = new Headers({
        CONNECTION: 'keep-alive',
        'TRANSFER-ENCODING': 'chunked',
        TE: 'trailers',
      });
      _internals.stripHopByHopHeaders(headers);
      // Headers normalizes to lowercase, so check lowercase
      expect(headers.has('connection')).toBe(false);
      expect(headers.has('transfer-encoding')).toBe(false);
      expect(headers.has('te')).toBe(false);
    });

    it('should be integrated into safeFetch', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      let capturedHeaders: Headers | undefined;
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockImplementation(async (url, pinnedIp, options) => {
          capturedHeaders = options?.headers as Headers;
          return {
            response: {
              status: 200,
              headers: new Headers(),
              body: createMockBody({ data: 'test' }),
            } as unknown as Response,
            close: vi.fn(),
          };
        }),
      };

      await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        headers: {
          'Content-Type': 'application/json',
          Connection: 'keep-alive',
          'Transfer-Encoding': 'chunked',
        },
      });

      // Hop-by-hop headers should be stripped
      expect(capturedHeaders?.has('connection')).toBe(false);
      expect(capturedHeaders?.has('transfer-encoding')).toBe(false);
      // Regular headers should be preserved
      expect(capturedHeaders?.get('content-type')).toBe('application/json');
    });
  });

  // ============================================================================
  // P1.3: Response Size Budget Enforcement Tests
  // ============================================================================
  describe('P1.3: response size budget enforcement', () => {
    it('should reject response exceeding maxResponseBytes', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      // Create a response body that exceeds the limit
      const largeBody = 'x'.repeat(1000);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { data: largeBody });

      const result = await safeFetchJson('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        maxResponseBytes: 100, // Very small limit
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_RESPONSE_TOO_LARGE);
      }
    });

    it('should reject based on Content-Length header (optimization)', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockResolvedValue({
          response: {
            status: 200,
            headers: new Headers({ 'Content-Length': '10000' }),
            body: createMockBody({ data: 'test' }),
          } as unknown as Response,
          close: vi.fn(),
        }),
      };

      const result = await safeFetchJson('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        maxResponseBytes: 100, // Content-Length exceeds this
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_RESPONSE_TOO_LARGE);
        expect(result.error).toContain('10000 bytes');
      }
    });

    it('should allow response within maxResponseBytes limit', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const smallBody = { data: 'small' };
      const mockHttpClient = createMockHttpClient({ status: 200 }, smallBody);

      const result = await safeFetchJson('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        maxResponseBytes: 10000, // Plenty of room
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual(smallBody);
      }
    });

    it('should use DEFAULT_MAX_RESPONSE_BYTES when not specified', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

      const result = await safeFetchJson('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        // No maxResponseBytes specified - uses default (2MB)
      });

      expect(result.ok).toBe(true);
    });

    it('should use smaller limit for JWKS endpoints', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      // Create response larger than JWKS limit (512KB) but smaller than default (2MB)
      const largeJwksBody = { keys: ['x'.repeat(600 * 1024)] };
      const mockHttpClient: HttpClient = {
        fetch: vi.fn().mockResolvedValue({
          response: {
            status: 200,
            headers: new Headers({ 'Content-Length': String(600 * 1024) }),
            body: createMockBody(largeJwksBody),
          } as unknown as Response,
          close: vi.fn(),
        }),
      };

      const result = await safeFetchJWKS('https://example.com/.well-known/jwks.json', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_RESPONSE_TOO_LARGE);
      }
    });

    it('should allow valid JWKS within size limit', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const validJwks = { keys: [{ kty: 'RSA', kid: 'test' }] };
      const mockHttpClient = createMockHttpClient({ status: 200 }, validJwks);

      const result = await safeFetchJWKS('https://example.com/.well-known/jwks.json', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.keys).toHaveLength(1);
      }
    });
  });

  // ============================================================================
  // P1.1: Audit Hook Tests
  // ============================================================================
  describe('P1.1: audit hook (onEvent)', () => {
    it('should call onEvent hook on successful request', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });
      const events: any[] = [];

      await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        onEvent: (event) => events.push(event),
      });

      // Should have captured some events
      expect(events.length).toBeGreaterThan(0);
    });

    it('should swallow errors from onEvent hook', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

      // Hook that throws should not break the request
      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        onEvent: () => {
          throw new Error('Hook error');
        },
      });

      // Request should still succeed despite hook error
      expect(result.ok).toBe(true);
    });
  });

  // ============================================================================
  // P1.2: Timeout Config Tests
  // ============================================================================
  describe('P1.2: timeout configuration', () => {
    it('should accept TimeoutConfig option', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        timeouts: {
          totalMs: 5000,
          dnsMs: 1000,
          connectMs: 2000,
          headersMs: 3000,
          bodyMs: 4000,
        },
      });

      // Should succeed with custom timeouts
      expect(result.ok).toBe(true);
    });

    it('should export DEFAULT_TIMEOUTS constant', () => {
      // Import would fail if DEFAULT_TIMEOUTS doesn't exist
      expect(DEFAULT_TIMEOUT_MS).toBe(30000);
    });

    it('should enforce DNS phase timeout (P1.3)', async () => {
      // Create a slow DNS resolver that takes longer than the timeout
      const slowResolver: DnsResolver = {
        resolveAll: vi.fn().mockImplementation(async () => {
          // Simulate slow DNS (100ms, but timeout is 50ms)
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { ipv4: ['8.8.8.8'], ipv6: [] };
        }),
      };
      const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: slowResolver,
        _httpClient: mockHttpClient,
        timeouts: {
          totalMs: 5000,
          dnsMs: 50, // DNS timeout of 50ms
          connectMs: 2000,
          headersMs: 3000,
          bodyMs: 4000,
        },
      });

      // Should fail with DNS timeout
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_DNS_TIMEOUT);
        expect(result.error).toBe('DNS resolution timed out');
      }
      // HTTP client should never be called
      expect(mockHttpClient.fetch).not.toHaveBeenCalled();
    });

    it('should succeed when DNS completes within timeout (P1.3)', async () => {
      // Create a fast DNS resolver
      const fastResolver: DnsResolver = {
        resolveAll: vi.fn().mockImplementation(async () => {
          // Simulate fast DNS (10ms, timeout is 100ms)
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { ipv4: ['8.8.8.8'], ipv6: [] };
        }),
      };
      const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: fastResolver,
        _httpClient: mockHttpClient,
        timeouts: {
          totalMs: 5000,
          dnsMs: 100, // DNS timeout of 100ms
          connectMs: 2000,
          headersMs: 3000,
          bodyMs: 4000,
        },
      });

      // Should succeed
      expect(result.ok).toBe(true);
    });

    it('should use timeoutMs as totalMs fallback when timeouts not provided', async () => {
      const mockResolver = createMockDnsResolver(['8.8.8.8']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        timeoutMs: 5000, // Legacy option should still work
      });

      expect(result.ok).toBe(true);
    });
  });

  // ============================================================================
  // P1.2: JCS Canonicalization + SHA-256 Digest (Golden Vectors)
  // ============================================================================
  describe('P1.2: JCS canonicalization and evidence digest', () => {
    describe('JCS canonicalization', () => {
      it('should sort object keys lexicographically', () => {
        // Create evidence with keys in non-alphabetical order
        const evidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public' as const,
          request_timestamp: 1700000000000,
          request_url: 'https://example.com/api',
          canonical_host: 'example.com',
          is_ip_literal: false,
          policy_decision: 'allow' as const,
          decision_code: 'OK',
          max_response_bytes: 2097152,
        };

        const canonical = canonicalizeEvidence(evidence);

        // Keys should be sorted: canonical_host, decision_code, evidence_level, ...
        expect(canonical.indexOf('"canonical_host"')).toBeLessThan(
          canonical.indexOf('"decision_code"')
        );
        expect(canonical.indexOf('"decision_code"')).toBeLessThan(
          canonical.indexOf('"evidence_level"')
        );
        expect(canonical.indexOf('"evidence_level"')).toBeLessThan(
          canonical.indexOf('"is_ip_literal"')
        );
      });

      it('should produce no whitespace', () => {
        const evidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public' as const,
          request_timestamp: 1700000000000,
          request_url: 'https://example.com',
          canonical_host: 'example.com',
          is_ip_literal: false,
          policy_decision: 'allow' as const,
          decision_code: 'OK',
          max_response_bytes: 2097152,
        };

        const canonical = canonicalizeEvidence(evidence);

        // No newlines or extra spaces
        expect(canonical).not.toMatch(/\n/);
        expect(canonical).not.toMatch(/:\s/);
        expect(canonical).not.toMatch(/,\s/);
      });

      it('should handle nested objects', () => {
        const evidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public' as const,
          request_timestamp: 1700000000000,
          request_url: 'https://example.com',
          canonical_host: 'example.com',
          is_ip_literal: false,
          dns_answer_count: { ipv4: 2, ipv6: 1 },
          policy_decision: 'allow' as const,
          decision_code: 'OK',
          max_response_bytes: 2097152,
        };

        const canonical = canonicalizeEvidence(evidence);

        // Nested object should also be sorted
        expect(canonical).toContain('"dns_answer_count":{"ipv4":2,"ipv6":1}');
      });

      it('should omit undefined values', () => {
        const evidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public' as const,
          request_timestamp: 1700000000000,
          request_url: 'https://example.com',
          canonical_host: 'example.com',
          is_ip_literal: false,
          policy_decision: 'allow' as const,
          decision_code: 'OK',
          max_response_bytes: 2097152,
          response_status: undefined, // Should be omitted
        };

        const canonical = canonicalizeEvidence(evidence);
        expect(canonical).not.toContain('response_status');
      });
    });

    describe('evidence digest (golden vectors)', () => {
      // Golden vector 1: Minimal public evidence
      it('should produce deterministic digest for minimal evidence', () => {
        const evidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public' as const,
          request_timestamp: 1700000000000,
          request_url: 'https://example.com/api',
          canonical_host: 'example.com',
          is_ip_literal: false,
          policy_decision: 'allow' as const,
          decision_code: 'OK',
          max_response_bytes: 2097152,
        };

        const digest = computeEvidenceDigest(evidence);

        // Digest should be 0x-prefixed, 64 hex chars
        expect(digest).toMatch(/^0x[a-f0-9]{64}$/);

        // Record the golden vector for future runs
        // This hash should be stable across all implementations
        const canonical = canonicalizeEvidence(evidence);
        expect(canonical).toBe(
          '{"canonical_host":"example.com","decision_code":"OK","evidence_level":"public","is_ip_literal":false,"max_response_bytes":2097152,"policy_decision":"allow","request_timestamp":1700000000000,"request_url":"https://example.com/api","schema_version":"peac-safe-fetch-evidence/0.1"}'
        );
      });

      // Golden vector 2: Evidence with IP info
      it('should produce deterministic digest for evidence with IP info', () => {
        const evidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public' as const,
          request_timestamp: 1700000000000,
          request_url: 'https://example.com/api',
          canonical_host: 'example.com',
          is_ip_literal: false,
          selected_ip_info: {
            family: 4 as const,
            hash: '0xabc123',
          },
          dns_answer_count: { ipv4: 1, ipv6: 0 },
          policy_decision: 'allow' as const,
          decision_code: 'OK',
          max_response_bytes: 2097152,
        };

        const digest1 = computeEvidenceDigest(evidence);
        const digest2 = computeEvidenceDigest(evidence);

        // Same input -> same output (deterministic)
        expect(digest1).toBe(digest2);
      });

      // Golden vector 3: Verify changing any field changes the digest
      it('should produce different digest when any field changes', () => {
        const evidence1 = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public' as const,
          request_timestamp: 1700000000000,
          request_url: 'https://example.com/api',
          canonical_host: 'example.com',
          is_ip_literal: false,
          policy_decision: 'allow' as const,
          decision_code: 'OK',
          max_response_bytes: 2097152,
        };

        const evidence2 = {
          ...evidence1,
          request_timestamp: 1700000000001, // One millisecond difference
        };

        const digest1 = computeEvidenceDigest(evidence1);
        const digest2 = computeEvidenceDigest(evidence2);

        expect(digest1).not.toBe(digest2);
      });
    });

    // JCS Hardening: Invalid type rejection
    describe('JCS hardening - invalid types', () => {
      it('should throw on bigint values', () => {
        const invalidEvidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public',
          request_timestamp: BigInt(1700000000000),
        };

        expect(() => canonicalizeEvidence(invalidEvidence as any)).toThrow(
          'Cannot canonicalize value of type bigint'
        );
      });

      it('should throw on symbol values', () => {
        const invalidEvidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public',
          sym: Symbol('test'),
        };

        expect(() => canonicalizeEvidence(invalidEvidence as any)).toThrow(
          'Cannot canonicalize value of type symbol'
        );
      });

      it('should throw on function values', () => {
        const invalidEvidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public',
          fn: () => {},
        };

        expect(() => canonicalizeEvidence(invalidEvidence as any)).toThrow(
          'Cannot canonicalize value of type function'
        );
      });

      it('should throw on NaN', () => {
        const invalidEvidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public',
          num: NaN,
        };

        expect(() => canonicalizeEvidence(invalidEvidence as any)).toThrow(
          'JCS does not support Infinity or NaN'
        );
      });

      it('should throw on Infinity', () => {
        const invalidEvidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public',
          num: Infinity,
        };

        expect(() => canonicalizeEvidence(invalidEvidence as any)).toThrow(
          'JCS does not support Infinity or NaN'
        );
      });

      it('should throw on -Infinity', () => {
        const invalidEvidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public',
          num: -Infinity,
        };

        expect(() => canonicalizeEvidence(invalidEvidence as any)).toThrow(
          'JCS does not support Infinity or NaN'
        );
      });

      it('should normalize -0 to 0 per RFC 8785', () => {
        const evidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public',
          num: -0,
        };

        const canonical = canonicalizeEvidence(evidence as any);
        // -0 should be serialized as 0
        expect(canonical).toContain('"num":0');
        expect(canonical).not.toContain('"num":-0');
      });

      it('should filter undefined values (not throw)', () => {
        const evidence = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public',
          defined: 'value',
          notDefined: undefined,
        };

        const canonical = canonicalizeEvidence(evidence as any);
        // undefined should be filtered out
        expect(canonical).toContain('"defined":"value"');
        expect(canonical).not.toContain('notDefined');
      });
    });

    // Golden fixtures from file
    describe('JCS golden fixtures', () => {
      it('should match stored canonical form for empty object', () => {
        const input = {};
        const canonical = canonicalizeEvidence(input as any);
        expect(canonical).toBe('{}');
      });

      it('should match stored canonical form for key ordering', () => {
        const input = { z: 3, a: 1, m: 2 };
        const canonical = canonicalizeEvidence(input as any);
        // Keys must be sorted alphabetically
        expect(canonical).toBe('{"a":1,"m":2,"z":3}');
      });

      it('should match stored canonical form for nested objects', () => {
        const input = { outer: { inner: 'value' } };
        const canonical = canonicalizeEvidence(input as any);
        expect(canonical).toBe('{"outer":{"inner":"value"}}');
      });

      it('should preserve array order (no sorting)', () => {
        const input = { arr: [3, 1, 2] };
        const canonical = canonicalizeEvidence(input as any);
        // Arrays preserve order
        expect(canonical).toBe('{"arr":[3,1,2]}');
      });

      it('should handle boolean values correctly', () => {
        const input = { t: true, f: false };
        const canonical = canonicalizeEvidence(input as any);
        // Keys sorted, values as JSON booleans
        expect(canonical).toBe('{"f":false,"t":true}');
      });

      it('should handle null values correctly', () => {
        const input = { n: null };
        const canonical = canonicalizeEvidence(input as any);
        expect(canonical).toBe('{"n":null}');
      });

      // Golden fixture digest verification (cross-implementation parity)
      it('should compute correct digest for empty object (golden vector)', () => {
        const input = {};
        const digest = computeEvidenceDigest(input as any);
        expect(digest).toBe('0x44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
      });

      it('should compute correct digest for key ordering (golden vector)', () => {
        const input = { z: 3, a: 1, m: 2 };
        const digest = computeEvidenceDigest(input as any);
        expect(digest).toBe('0x70d1ebc7a727a476f15f7b4436d65b0bca07718c03a0843fa008659badad79c7');
      });

      it('should compute correct digest for nested object (golden vector)', () => {
        const input = { outer: { inner: 'value' } };
        const digest = computeEvidenceDigest(input as any);
        expect(digest).toBe('0xbaceb36f70797f9be9e55a51b0aacef83a0eb69a9fb77b06c3c0e06283e5afbe');
      });

      it('should compute correct digest for evidence sample (golden vector)', () => {
        const input = {
          schema_version: 'peac-safe-fetch-evidence/0.1',
          evidence_level: 'public',
          request_timestamp: 1706284800000,
          request_url: 'https://example.com/api',
          canonical_host: 'example.com',
          is_ip_literal: false,
          policy_decision: 'allow',
          decision_code: 'OK',
          max_response_bytes: 2097152,
        };
        const digest = computeEvidenceDigest(input as any);
        expect(digest).toBe('0x09cf04fe35ad74db9b9c413f0bca5a1525987ec6df26a450a570cade0a1bc12a');
      });

      // Load and validate all golden vectors from fixture file (cross-implementation parity)
      it('should validate all vectors from jcs-golden-vectors.json', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const fixtureContent = fs.readFileSync(
          path.join(__dirname, 'fixtures/jcs-golden-vectors.json'),
          'utf-8'
        );
        const fixtures = JSON.parse(fixtureContent);

        for (const testCase of fixtures.test_cases) {
          // Skip cases without digest (like negative_zero which tests normalization)
          if (!testCase.digest) continue;

          const canonical = canonicalizeEvidence(testCase.input as any);
          expect(canonical).toBe(testCase.canonical);

          const digest = computeEvidenceDigest(testCase.input as any);
          expect(digest).toBe(testCase.digest);
        }
      });
    });
  });

  // ============================================================================
  // P1.1: Separate Evidence and Event Schema Versions
  // ============================================================================
  describe('P1.1: Schema version separation', () => {
    it('should use evidence schema version in evidence (not event schema)', async () => {
      const mockResolver = createMockDnsResolver(['93.184.216.34']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Evidence should use evidence-specific schema version
        expect(result.evidence.schema_version).toBe('peac-safe-fetch-evidence/0.1');
        // NOT the event schema version
        expect(result.evidence.schema_version).not.toBe('peac-safe-fetch-event/0.1');
      }
    });

    it('should use event schema version in audit events', async () => {
      // Use _internals.emitAuditEvent directly to test schema version
      const events: any[] = [];
      const hook = (e: any) => events.push(e);

      _internals.emitAuditEvent(
        _internals.createRequestAuditContext(),
        hook,
        undefined,
        'onEvent',
        {
          type: 'dns_start',
          timestamp: Date.now(),
          url: 'https://example.com',
        }
      );

      // Wait for microtask queue to flush
      await new Promise((resolve) => queueMicrotask(resolve));

      // Events should use event-specific schema version
      expect(events.length).toBe(1);
      expect(events[0].schema_version).toBe('peac-safe-fetch-event/0.1');
      // NOT the evidence schema version
      expect(events[0].schema_version).not.toBe('peac-safe-fetch-evidence/0.1');
    });
  });

  // ============================================================================
  // P0.4: Scheme and Port Policy Defaults (SECURITY - Defense in Depth)
  // ============================================================================
  describe('P0.4: Scheme and port policy defaults', () => {
    describe('scheme defaults', () => {
      it('should block HTTP URLs by default (HTTPS required)', async () => {
        const result = await safeFetch('http://example.com/api');

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
        }
      });

      it('should allow HTTPS URLs', async () => {
        const mockResolver = createMockDnsResolver(['93.184.216.34']);
        const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

        const result = await safeFetch('https://example.com/api', {
          _dnsResolver: mockResolver,
          _httpClient: mockHttpClient,
        });

        expect(result.ok).toBe(true);
      });
    });

    describe('port defaults', () => {
      it('should allow default HTTPS port (443)', async () => {
        const mockResolver = createMockDnsResolver(['93.184.216.34']);
        const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

        const result = await safeFetch('https://example.com:443/api', {
          _dnsResolver: mockResolver,
          _httpClient: mockHttpClient,
        });

        expect(result.ok).toBe(true);
      });

      it('should block non-standard port 8080 by default', async () => {
        const result = await safeFetch('https://example.com:8080/api');

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
        }
      });

      it('should block database port 6379 (Redis) by default', async () => {
        const result = await safeFetch('https://example.com:6379/api');

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
        }
      });

      it('should block SSH port 22 by default', async () => {
        const result = await safeFetch('https://example.com:22/api');

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
        }
      });

      it('should allow custom port via allowPorts policy', async () => {
        const mockResolver = createMockDnsResolver(['93.184.216.34']);
        const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

        const result = await safeFetch('https://example.com:8443/api', {
          _dnsResolver: mockResolver,
          _httpClient: mockHttpClient,
          ssrfPolicy: {
            allowPorts: [8443],
          },
        });

        expect(result.ok).toBe(true);
      });
    });

    describe('dangerous ports blocklist', () => {
      it('should block SSH port 22 even when in allowPorts (defense in depth)', async () => {
        const result = await safeFetch('https://example.com:22/api', {
          ssrfPolicy: {
            allowPorts: [22], // User tries to allow SSH port
          },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DANGEROUS_PORT);
        }
      });

      it('should block database port 6379 even when in allowPorts', async () => {
        const result = await safeFetch('https://example.com:6379/api', {
          ssrfPolicy: {
            allowPorts: [6379], // User tries to allow Redis port
          },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DANGEROUS_PORT);
        }
      });

      it('should require ack when allowDangerousPorts is true', async () => {
        const result = await safeFetch('https://example.com:22/api', {
          ssrfPolicy: {
            allowPorts: [22],
          },
          allowDangerousPorts: true,
          // Missing ack_allow_dangerous_ports
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DANGEROUS_PORT_ACK_MISSING);
        }
      });

      it('should allow dangerous port with proper ack', async () => {
        const mockResolver = createMockDnsResolver(['93.184.216.34']);
        const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

        const result = await safeFetch('https://example.com:22/api', {
          _dnsResolver: mockResolver,
          _httpClient: mockHttpClient,
          ssrfPolicy: {
            allowPorts: [22],
          },
          allowDangerousPorts: true,
          ack_allow_dangerous_ports: ALLOW_DANGEROUS_PORTS_ACK,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          // Should have warning about dangerous port
          expect(result.warnings).toContain(
            'Dangerous port 22 allowed via explicit acknowledgment'
          );
        }
      });

      it('should include all expected dangerous ports', () => {
        // Verify the DANGEROUS_PORTS set contains critical ports
        expect(DANGEROUS_PORTS.has(22)).toBe(true); // SSH
        expect(DANGEROUS_PORTS.has(25)).toBe(true); // SMTP
        expect(DANGEROUS_PORTS.has(3306)).toBe(true); // MySQL
        expect(DANGEROUS_PORTS.has(5432)).toBe(true); // PostgreSQL
        expect(DANGEROUS_PORTS.has(6379)).toBe(true); // Redis
        expect(DANGEROUS_PORTS.has(27017)).toBe(true); // MongoDB
        expect(DANGEROUS_PORTS.has(6443)).toBe(true); // Kubernetes API

        // Standard web ports should NOT be in dangerous list
        expect(DANGEROUS_PORTS.has(80)).toBe(false);
        expect(DANGEROUS_PORTS.has(443)).toBe(false);
      });

      it('should reject redirect to non-allowed port at schema level (layer 1)', async () => {
        // LAYER 1: Schema-level port validation (before net-level checks)
        // Scenario: Safe URL redirects to port 22, but port 22 is NOT in allowPorts
        // Expected: Blocked by schema validation with E_SSRF_URL_REJECTED
        //
        // This test documents the first layer of defense-in-depth:
        // Ports not explicitly allowed are rejected before any network operations.
        let callCount = 0;
        const mockResolver: DnsResolver = {
          resolveAll: vi.fn().mockResolvedValue({ ipv4: ['93.184.216.34'], ipv6: [] }),
        };

        const mockHttpClient: HttpClient = {
          fetch: vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
              return {
                response: {
                  status: 302,
                  headers: new Headers({ Location: 'https://internal.example.com:22/ssh-tunnel' }),
                  body: createMockBody({}),
                } as unknown as Response,
                close: vi.fn(),
              };
            }
            return {
              response: {
                status: 200,
                headers: new Headers(),
                body: createMockBody({ shouldNotReach: true }),
              } as unknown as Response,
              close: vi.fn(),
            };
          }),
        };

        const result = await safeFetch('https://example.com/api', {
          _dnsResolver: mockResolver,
          _httpClient: mockHttpClient,
          redirectPolicy: 'same-registrable-domain',
          maxRedirects: 5,
          // NO allowPorts: [22] - port 22 is not in the allowed list
          // Schema validation should reject before dangerous port check
        });

        // Must fail at schema level (URL validation), not at net level (dangerous ports)
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED);
          // Only one fetch should have been made (redirect target blocked at URL validation)
          expect(callCount).toBe(1);
        }
      });

      it('should block dangerous port on redirect hop at net level (layer 2)', async () => {
        // LAYER 2: Net-level dangerous port check (after schema passes)
        // Scenario: Safe URL redirects to port 22, port 22 IS in allowPorts (schema passes)
        // Expected: Blocked by dangerous ports check with E_SSRF_DANGEROUS_PORT
        //
        // Defense-in-depth layers:
        // 1. Schema-level: allowPorts controls which ports pass URL validation
        // 2. Net-level: DANGEROUS_PORTS provides additional safeguard for high-risk ports
        //
        // This test proves that even when port 22 is added to allowPorts (schema passes),
        // the dangerous port check STILL blocks it unless explicitly acknowledged.
        let callCount = 0;
        const mockResolver: DnsResolver = {
          resolveAll: vi.fn().mockImplementation(async () => {
            // Both hops resolve to public IPs (DNS validation passes)
            return { ipv4: ['93.184.216.34'], ipv6: [] };
          }),
        };

        const mockHttpClient: HttpClient = {
          fetch: vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
              // First request: redirect to dangerous port
              return {
                response: {
                  status: 302,
                  headers: new Headers({ Location: 'https://internal.example.com:22/ssh-tunnel' }),
                  body: createMockBody({}),
                } as unknown as Response,
                close: vi.fn(),
              };
            }
            // Should never reach here - redirect target blocked before fetch
            return {
              response: {
                status: 200,
                headers: new Headers(),
                body: createMockBody({ shouldNotReach: true }),
              } as unknown as Response,
              close: vi.fn(),
            };
          }),
        };

        const result = await safeFetch('https://example.com/api', {
          _dnsResolver: mockResolver,
          _httpClient: mockHttpClient,
          redirectPolicy: 'same-registrable-domain',
          maxRedirects: 5,
          // Allow port 22 at schema level (passes URL validation)
          // But do NOT provide allowDangerousPorts (should be blocked by net-level check)
          ssrfPolicy: {
            allowPorts: [22],
          },
        });

        // Must fail at dangerous port check (not URL validation)
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DANGEROUS_PORT);
          expect(result.error).toContain('Port blocked');

          // Verify evidence was still captured for audit trail
          expect(result.evidence).toBeDefined();
          expect(result.evidence.policy_decision).toBe('block');
          expect(result.evidence.decision_code).toBe(SAFE_FETCH_ERROR_CODES.E_SSRF_DANGEROUS_PORT);
          expect(result.evidence.evidence_digest).toBeDefined();
          expect(result.evidence.evidence_digest).toMatch(/^0x[a-f0-9]{64}$/);
        }

        // Verify only one fetch was made (redirect target blocked before fetch)
        expect(callCount).toBe(1);
      });

      it('should allow dangerous port on redirect hop with explicit ack', async () => {
        // Counter-test: With proper acknowledgment, dangerous port redirect should work
        let callCount = 0;
        const mockResolver: DnsResolver = {
          resolveAll: vi.fn().mockResolvedValue({ ipv4: ['93.184.216.34'], ipv6: [] }),
        };

        const mockHttpClient: HttpClient = {
          fetch: vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
              return {
                response: {
                  status: 302,
                  headers: new Headers({ Location: 'https://internal.example.com:22/ssh-tunnel' }),
                  body: createMockBody({}),
                } as unknown as Response,
                close: vi.fn(),
              };
            }
            return {
              response: {
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                body: createMockBody({ success: true }),
              } as unknown as Response,
              close: vi.fn(),
            };
          }),
        };

        const result = await safeFetch('https://example.com/api', {
          _dnsResolver: mockResolver,
          _httpClient: mockHttpClient,
          redirectPolicy: 'same-registrable-domain',
          maxRedirects: 5,
          ssrfPolicy: {
            allowPorts: [22],
          },
          allowDangerousPorts: true,
          ack_allow_dangerous_ports: ALLOW_DANGEROUS_PORTS_ACK,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.warnings).toContain(
            'Dangerous port 22 allowed via explicit acknowledgment'
          );
          expect(result.evidence.policy_decision).toBe('allow');
        }
        // Both requests should have been made
        expect(callCount).toBe(2);
      });
    });
  });

  // ============================================================================
  // Tenant Mode Key Validation
  // ============================================================================
  describe('tenant mode key validation', () => {
    it('should reject tenant mode without redactionKey', async () => {
      const result = await safeFetch('https://example.com/api', {
        evidenceLevel: 'tenant',
        // Missing redactionKey
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_TENANT_KEY_MISSING);
        expect(result.error).toContain('redactionKey');
      }
    });

    it('should reject tenant mode with key less than 32 bytes', async () => {
      const result = await safeFetch('https://example.com/api', {
        evidenceLevel: 'tenant',
        redactionKey: new Uint8Array(16), // Too short
        redactionKeyId: 'key-2024',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_TENANT_KEY_MISSING);
        expect(result.error).toContain('32 bytes');
      }
    });

    it('should reject tenant mode without redactionKeyId', async () => {
      const result = await safeFetch('https://example.com/api', {
        evidenceLevel: 'tenant',
        redactionKey: new Uint8Array(32),
        // Missing redactionKeyId
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SAFE_FETCH_ERROR_CODES.E_TENANT_KEY_MISSING);
        expect(result.error).toContain('redactionKeyId');
      }
    });

    it('should accept tenant mode with valid key and keyId', async () => {
      const mockResolver = createMockDnsResolver(['93.184.216.34']);
      const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

      const result = await safeFetch('https://example.com/api', {
        _dnsResolver: mockResolver,
        _httpClient: mockHttpClient,
        evidenceLevel: 'tenant',
        redactionKey: new Uint8Array(32).fill(1),
        redactionKeyId: 'key-2024',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.evidence.evidence_level).toBe('tenant');
        // Tenant mode should have key_id in IP info
        expect(result.evidence.selected_ip_info?.key_id).toBe('key-2024');
      }
    });
  });

  // ============================================================================
  // P0.3: Evidence Redaction Levels (SECURITY - Defense in Depth)
  // ============================================================================
  describe('P0.3: Evidence redaction levels', () => {
    describe('public evidence (default)', () => {
      it('should redact IP addresses by default (public evidence)', async () => {
        const mockResolver = createMockDnsResolver(['93.184.216.34']);
        const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

        const result = await safeFetch('https://example.com/api', {
          _dnsResolver: mockResolver,
          _httpClient: mockHttpClient,
          // evidenceLevel defaults to 'public'
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          // Public evidence should NOT include raw IP
          expect(result.evidence.selected_ip).toBeUndefined();
          expect(result.evidence.dns_answers).toBeUndefined();

          // Public evidence SHOULD include redacted IP info
          expect(result.evidence.selected_ip_info).toBeDefined();
          expect(result.evidence.selected_ip_info?.family).toBe(4);
          expect(result.evidence.selected_ip_info?.hash).toMatch(/^0x[a-f0-9]{64}$/);

          // Public evidence SHOULD include DNS answer counts
          expect(result.evidence.dns_answer_count).toBeDefined();
          expect(result.evidence.dns_answer_count?.ipv4).toBe(1);
          expect(result.evidence.dns_answer_count?.ipv6).toBe(0);

          // Evidence level should be recorded
          expect(result.evidence.evidence_level).toBe('public');
        }
      });

      it('should hash IPv6 addresses correctly in public evidence', async () => {
        // Use public IPv6 (Cloudflare DNS) - not 2001:db8:: which is documentation range (blocked)
        const mockResolver = createMockDnsResolver([], ['2606:4700:4700::1111']);
        const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

        const result = await safeFetch('https://example.com/api', {
          _dnsResolver: mockResolver,
          _httpClient: mockHttpClient,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.evidence.selected_ip_info?.family).toBe(6);
          expect(result.evidence.selected_ip_info?.hash).toMatch(/^0x[a-f0-9]{64}$/);
        }
      });

      it('should produce consistent hashes for the same IP', async () => {
        // Same IP should always produce the same hash (deterministic)
        const hash1 = _internals.hashIpAddress('93.184.216.34');
        const hash2 = _internals.hashIpAddress('93.184.216.34');
        expect(hash1).toBe(hash2);

        // Different IPs should produce different hashes
        const hash3 = _internals.hashIpAddress('8.8.8.8');
        expect(hash3).not.toBe(hash1);
      });

      it('should redact IPs in error evidence (public)', async () => {
        // Create a failing scenario (private IP)
        const mockResolver = createMockDnsResolver(['10.0.0.1']);
        const mockHttpClient = createMockHttpClient({ status: 200 }, {});

        const result = await safeFetch('https://example.com/api', {
          _dnsResolver: mockResolver,
          _httpClient: mockHttpClient,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.evidence).toBeDefined();
          // Error evidence should also be redacted
          expect(result.evidence?.evidence_level).toBe('public');
          // Should NOT have raw IPs in public error evidence
          expect(result.evidence?.selected_ip).toBeUndefined();
          expect(result.evidence?.dns_answers).toBeUndefined();
        }
      });
    });

    describe('private evidence (explicit opt-in)', () => {
      it('should include raw IPs with evidenceLevel: private', async () => {
        const mockResolver = createMockDnsResolver(['93.184.216.34']);
        const mockHttpClient = createMockHttpClient({ status: 200 }, { ok: true });

        const result = await safeFetch('https://example.com/api', {
          _dnsResolver: mockResolver,
          _httpClient: mockHttpClient,
          evidenceLevel: 'private',
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          // Private evidence SHOULD include raw IP
          expect(result.evidence.selected_ip).toBe('93.184.216.34');

          // Private evidence SHOULD include full DNS answers
          expect(result.evidence.dns_answers).toBeDefined();
          expect(result.evidence.dns_answers?.length).toBe(1);
          expect(result.evidence.dns_answers?.[0].ip).toBe('93.184.216.34');

          // Private evidence should NOT include redacted versions
          expect(result.evidence.selected_ip_info).toBeUndefined();
          expect(result.evidence.dns_answer_count).toBeUndefined();

          // Evidence level should be recorded
          expect(result.evidence.evidence_level).toBe('private');
        }
      });

      it('should include raw IPs in error evidence (private)', async () => {
        const mockResolver = createMockDnsResolver(['10.0.0.1']);
        const mockHttpClient = createMockHttpClient({ status: 200 }, {});

        const result = await safeFetch('https://example.com/api', {
          _dnsResolver: mockResolver,
          _httpClient: mockHttpClient,
          evidenceLevel: 'private',
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.evidence?.evidence_level).toBe('private');
          // Private error evidence should include DNS answers
          expect(result.evidence?.dns_answers).toBeDefined();
          expect(result.evidence?.dns_answers?.some((a) => a.ip === '10.0.0.1')).toBe(true);
        }
      });
    });

    describe('redaction helper functions', () => {
      it('hashIpAddress should return 0x-prefixed hex', () => {
        const hash = _internals.hashIpAddress('8.8.8.8');
        expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
      });

      it('redactIp should return correct family for IPv4', () => {
        const redacted = _internals.redactIp('192.168.1.1');
        expect(redacted.family).toBe(4);
        expect(redacted.hash).toMatch(/^0x[a-f0-9]{64}$/);
      });

      it('redactIp should return correct family for IPv6', () => {
        const redacted = _internals.redactIp('2001:db8::1');
        expect(redacted.family).toBe(6);
        expect(redacted.hash).toMatch(/^0x[a-f0-9]{64}$/);
      });
    });
  });

  // ============================================================================
  // P2.2: _internals Lockdown Tests
  // ============================================================================
  describe('P2.2: _internals export stability', () => {
    it('should export _internals as const (frozen)', () => {
      // Check that _internals is readonly
      expect(typeof _internals).toBe('object');
      expect(_internals.isPrivateIP).toBeDefined();
      expect(_internals.canonicalizeHost).toBeDefined();
      expect(_internals.emitAuditEvent).toBeDefined();
    });

    it('should have emitAuditEvent helper', async () => {
      // P1.2: emitAuditEvent now uses queueMicrotask for async-safety
      const events: any[] = [];
      const hook = (e: any) => events.push(e);

      _internals.emitAuditEvent(
        _internals.createRequestAuditContext(),
        hook,
        undefined,
        'onEvent',
        {
          type: 'dns_start',
          timestamp: Date.now(),
          url: 'https://example.com',
        }
      );

      // Wait for microtask to execute
      await new Promise((resolve) => queueMicrotask(resolve));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('dns_start');
      // P1.1: Verify schema_version is automatically added
      expect(events[0].schema_version).toBe('peac-safe-fetch-event/0.1');
    });

    it('emitAuditEvent should swallow hook errors', async () => {
      const badHook = () => {
        throw new Error('oops');
      };

      // Should not throw (error is swallowed in microtask)
      _internals.emitAuditEvent(
        _internals.createRequestAuditContext(),
        badHook,
        undefined,
        'onEvent',
        {
          type: 'dns_start',
          timestamp: Date.now(),
          url: 'https://example.com',
        }
      );

      // Wait for microtask to execute (it should not throw)
      await new Promise((resolve) => queueMicrotask(resolve));
    });

    it('emitAuditEvent should handle undefined hook', () => {
      // Should not throw with undefined hook
      expect(() => {
        _internals.emitAuditEvent(
          _internals.createRequestAuditContext(),
          undefined,
          undefined,
          'onEvent',
          {
            type: 'dns_start',
            timestamp: Date.now(),
            url: 'https://example.com',
          }
        );
      }).not.toThrow();
    });
  });

  // ============================================================================
  // P1.4: Bounded Audit Queue Tests
  // ============================================================================
  describe('P1.4: Bounded audit queue', () => {
    beforeEach(() => {
      // Reset queue stats before each test
      _internals.resetAuditQueueStats();
    });

    it('MAX_PENDING_AUDIT_EVENTS should be 1000', () => {
      expect(MAX_PENDING_AUDIT_EVENTS).toBe(1000);
    });

    it('getAuditQueueStats should return initial state', () => {
      const stats = getAuditQueueStats();
      expect(stats.pending).toBe(0);
      expect(stats.dropped).toBe(0);
    });

    it('should track pending events before microtask executes', () => {
      const received: any[] = [];
      const hook = (e: any) => received.push(e);

      // Emit events synchronously - they're queued but not yet processed
      _internals.emitAuditEvent(
        _internals.createRequestAuditContext(),
        hook,
        undefined,
        'onEvent',
        {
          type: 'dns_start',
          timestamp: Date.now(),
          url: 'https://example.com',
        }
      );

      // Immediately after emitting, pending count should be 1
      // (microtask hasn't run yet)
      const stats = getAuditQueueStats();
      expect(stats.pending).toBe(1);
      expect(received.length).toBe(0); // Hook hasn't been called yet
    });

    it('should decrement pending after microtask completes', async () => {
      const received: any[] = [];
      const hook = (e: any) => received.push(e);

      _internals.emitAuditEvent(
        _internals.createRequestAuditContext(),
        hook,
        undefined,
        'onEvent',
        {
          type: 'dns_start',
          timestamp: Date.now(),
          url: 'https://example.com',
        }
      );

      // Wait for microtask to execute
      await new Promise((resolve) => queueMicrotask(resolve));

      // Pending should be 0 after processing
      const stats = getAuditQueueStats();
      expect(stats.pending).toBe(0);
      expect(received.length).toBe(1);
    });

    it('should drop events when queue is full', async () => {
      // Track received events
      const received: any[] = [];
      const hook = (e: any) => received.push(e);

      // Use a SINGLE request-scoped context to track all drops for this test
      const ctx = _internals.createRequestAuditContext();

      // Emit MAX_PENDING_AUDIT_EVENTS + 100 events synchronously
      const numEvents = MAX_PENDING_AUDIT_EVENTS + 100;
      for (let i = 0; i < numEvents; i++) {
        _internals.emitAuditEvent(ctx, hook, undefined, 'onEvent', {
          type: 'dns_start',
          timestamp: Date.now(),
          url: `https://example.com/${i}`,
        });
      }

      // Wait for all microtasks to execute
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Filter out overflow events (they're delivered directly, not queued)
      const regularEvents = received.filter((e) => e.type !== 'audit_overflow');
      const overflowEvents = received.filter((e) => e.type === 'audit_overflow');

      // Should have received at most MAX_PENDING_AUDIT_EVENTS regular events
      expect(regularEvents.length).toBeLessThanOrEqual(MAX_PENDING_AUDIT_EVENTS);

      // Should have received at least one overflow event
      expect(overflowEvents.length).toBeGreaterThan(0);
      expect(overflowEvents[0].meta.dropped_total).toBeGreaterThan(0);

      // Context should show dropped events (request-scoped)
      expect(ctx.dropped).toBeGreaterThan(0);
      // Dropped = total attempted - regular events received
      expect(ctx.dropped).toBe(numEvents - regularEvents.length);
    });

    it('resetAuditQueueStats should clear stats', async () => {
      const hook = () => {};

      // Emit some events
      for (let i = 0; i < 10; i++) {
        _internals.emitAuditEvent(
          _internals.createRequestAuditContext(),
          hook,
          undefined,
          'onEvent',
          {
            type: 'dns_start',
            timestamp: Date.now(),
            url: 'https://example.com',
          }
        );
      }

      // Wait for events to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Reset stats
      _internals.resetAuditQueueStats();

      const stats = getAuditQueueStats();
      expect(stats.pending).toBe(0);
      expect(stats.dropped).toBe(0);
    });

    it('should decrement pending count even when hook throws', async () => {
      const badHook = () => {
        throw new Error('hook error');
      };

      _internals.emitAuditEvent(
        _internals.createRequestAuditContext(),
        badHook,
        undefined,
        'onEvent',
        {
          type: 'dns_start',
          timestamp: Date.now(),
          url: 'https://example.com',
        }
      );

      // Wait for microtask to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Pending should be 0 (decremented in finally block)
      const stats = getAuditQueueStats();
      expect(stats.pending).toBe(0);
    });

    it('should emit audit_hook_error when hook throws', async () => {
      const received: any[] = [];
      let callCount = 0;
      const errorHook = (e: any) => {
        received.push(e);
        callCount++;
        if (e.type === 'dns_start') {
          throw new Error('hook error');
        }
      };

      _internals.emitAuditEvent(
        _internals.createRequestAuditContext(),
        errorHook,
        undefined,
        'onEvent',
        {
          type: 'dns_start',
          timestamp: Date.now(),
          url: 'https://example.com',
        }
      );

      // Wait for microtask to execute
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have received both the original event and an error event
      expect(received.length).toBe(2);
      expect(received[0].type).toBe('dns_start');
      expect(received[1].type).toBe('audit_hook_error');
      expect(received[1].meta.error_message).toBe('hook error');
      expect(received[1].meta.error_count).toBe(1);
      expect(received[1].meta.original_event_type).toBe('dns_start');
    });

    it('should not recurse when audit_hook_error handler also throws', async () => {
      const received: any[] = [];
      let errorCount = 0;
      const recursiveErrorHook = (e: any) => {
        received.push(e);
        errorCount++;
        // Always throw, including for audit_hook_error events
        throw new Error(`error ${errorCount}`);
      };

      _internals.emitAuditEvent(
        _internals.createRequestAuditContext(),
        recursiveErrorHook,
        undefined,
        'onEvent',
        {
          type: 'dns_start',
          timestamp: Date.now(),
          url: 'https://example.com',
        }
      );

      // Wait for microtask to execute
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have received exactly 2 events: the original and one error event
      // The explicit non-recursion guard prevents infinite loops:
      // 1. dns_start event is delivered, hook throws error 1
      // 2. audit_hook_error is emitted, hook throws error 2
      // 3. Because original event type IS audit_hook_error, we do NOT emit another
      expect(received.length).toBe(2);
      expect(received[0].type).toBe('dns_start');
      expect(received[1].type).toBe('audit_hook_error');
      expect(received[1].meta.original_event_type).toBe('dns_start');
      // The second throw (from audit_hook_error handler) incremented suppressed_count
      // Note: First error emitted, second suppressed = suppressed_count should be 1
      // But since we check suppressed_count BEFORE incrementing it in the error,
      // and the second throw goes to the explicit guard which increments suppressed_count,
      // the suppressed_count in the first event is 0, but the stats will show 1 after
    });

    it('should sanitize sensitive data in error messages', async () => {
      const received: any[] = [];
      const sensitiveErrorHook = (e: any) => {
        received.push(e);
        if (e.type === 'dns_start') {
          throw new Error('Failed with Bearer abc123token key=secret123 password=hunter2');
        }
      };

      _internals.emitAuditEvent(
        _internals.createRequestAuditContext(),
        sensitiveErrorHook,
        undefined,
        'onEvent',
        {
          type: 'dns_start',
          timestamp: Date.now(),
          url: 'https://example.com',
        }
      );

      // Wait for microtask to execute
      await new Promise((resolve) => setTimeout(resolve, 50));

      const errorEvent = received.find((e) => e.type === 'audit_hook_error');
      expect(errorEvent).toBeDefined();
      // Sensitive data should be redacted
      expect(errorEvent.meta.error_message).not.toContain('abc123token');
      expect(errorEvent.meta.error_message).not.toContain('secret123');
      expect(errorEvent.meta.error_message).not.toContain('hunter2');
      expect(errorEvent.meta.error_message).toContain('[REDACTED]');
    });

    it('should truncate long error messages', async () => {
      const received: any[] = [];
      const longErrorHook = (e: any) => {
        received.push(e);
        if (e.type === 'dns_start') {
          // Create a very long error message
          throw new Error('x'.repeat(500));
        }
      };

      _internals.emitAuditEvent(
        _internals.createRequestAuditContext(),
        longErrorHook,
        undefined,
        'onEvent',
        {
          type: 'dns_start',
          timestamp: Date.now(),
          url: 'https://example.com',
        }
      );

      // Wait for microtask to execute
      await new Promise((resolve) => setTimeout(resolve, 50));

      const errorEvent = received.find((e) => e.type === 'audit_hook_error');
      expect(errorEvent).toBeDefined();
      // Error message should be truncated to 200 chars + '...'
      expect(errorEvent.meta.error_message.length).toBeLessThanOrEqual(203);
      expect(errorEvent.meta.error_message).toContain('...');
    });

    it('should set audit_truncated in evidence when events are dropped', async () => {
      // Reset stats first
      _internals.resetAuditQueueStats();

      const hook = () => {};

      // Use a SINGLE request-scoped context to track drops
      const ctx = _internals.createRequestAuditContext();

      // Emit more events than the queue can hold
      const numEvents = MAX_PENDING_AUDIT_EVENTS + 100;
      for (let i = 0; i < numEvents; i++) {
        _internals.emitAuditEvent(ctx, hook, undefined, 'onEvent', {
          type: 'dns_start',
          timestamp: Date.now(),
          url: `https://example.com/${i}`,
        });
      }

      // Build evidence using finalizeEvidence with the context
      const core = {
        schema_version: '0.1',
        evidence_level: 'public' as const,
        request_timestamp: Date.now(),
        request_url: 'https://example.com',
        canonical_host: 'example.com',
        is_ip_literal: false,
        policy_decision: 'allow' as const,
        decision_code: 'E_OK',
        max_response_bytes: 1048576,
      };

      const evidence = _internals.finalizeEvidence(core, ctx);

      // Evidence should have audit_truncated: true (drops occurred)
      // Uses presence semantics: field present and true = truncated
      expect(evidence.audit_truncated).toBe(true);
      expect(evidence.audit_stats).toBeDefined();
      expect(evidence.audit_stats!.dropped).toBeGreaterThan(0);

      // Wait for events to process to clean up
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('should not set audit_truncated when no events are dropped', async () => {
      // Reset stats first
      _internals.resetAuditQueueStats();

      const received: any[] = [];
      const hook = (e: any) => received.push(e);

      // Emit just a few events (well under the limit)
      for (let i = 0; i < 5; i++) {
        _internals.emitAuditEvent(
          _internals.createRequestAuditContext(),
          hook,
          undefined,
          'onEvent',
          {
            type: 'dns_start',
            timestamp: Date.now(),
            url: `https://example.com/${i}`,
          }
        );
      }

      // Wait for events to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Build evidence using finalizeEvidence
      const core = {
        schema_version: '0.1',
        evidence_level: 'public' as const,
        request_timestamp: Date.now(),
        request_url: 'https://example.com',
        canonical_host: 'example.com',
        is_ip_literal: false,
        policy_decision: 'allow' as const,
        decision_code: 'E_OK',
        max_response_bytes: 1048576,
      };

      const evidence = _internals.finalizeEvidence(core);

      // Evidence should NOT have audit_truncated field (presence semantics)
      // Absence of field means "not truncated" - cleaner than explicit false
      expect(evidence.audit_truncated).toBeUndefined();
      // audit_stats should also be undefined (no issues to report)
      expect(evidence.audit_stats).toBeUndefined();
    });
  });
});

// -----------------------------------------------------------------------------
// API Surface Guard Tests
// -----------------------------------------------------------------------------

describe('API surface guards', () => {
  /**
   * Runtime test to ensure internal functions are not exported.
   *
   * This test verifies that `finalizeEvidence` is NOT part of the public API.
   * It should only be accessible via `_internals.finalizeEvidence` for testing.
   *
   * If this test fails, someone accidentally exported an internal function.
   */
  it('finalizeEvidence is not directly exported (internal-only)', async () => {
    // Dynamic import to check exports in ESM
    const netModule = await import('../src/index');

    // finalizeEvidence should NOT be a direct export
    // Use Object.keys to check what's actually exported
    const exportedNames = Object.keys(netModule);
    expect(exportedNames).not.toContain('finalizeEvidence');

    // _internals should NOT be exported from the main entry
    // (it's only available via the testing subpath)
    expect(exportedNames).not.toContain('_internals');

    // Verify _internals IS available from the testing subpath
    const testingModule = await import('../src/testing');
    expect(typeof testingModule._internals.finalizeEvidence).toBe('function');
  });

  it('_internals contains expected internal helpers', () => {
    // Verify _internals has the expected shape
    expect(typeof _internals.finalizeEvidence).toBe('function');
    expect(typeof _internals.jcsCanonicalizeValue).toBe('function');
    expect(typeof _internals.createRequestAuditContext).toBe('function');
    expect(typeof _internals.emitAuditEvent).toBe('function');
  });

  /**
   * Pack-level API surface test
   *
   * This test verifies the published artifact by checking the compiled
   * type definitions to ensure internal APIs are properly isolated.
   *
   * Target outcome:
   * - dist/index.d.ts contains NO _internals and NO mention of finalizeEvidence
   * - dist/testing.d.ts DOES contain _internals with finalizeEvidence
   */
  it('dist/index.d.ts has no _internals or finalizeEvidence (pack-level guard)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Read the compiled type definitions
    const distDir = path.join(__dirname, '..', 'dist');
    const indexDts = await fs.readFile(path.join(distDir, 'index.d.ts'), 'utf8');

    // Verify _internals is NOT in the main entry
    expect(indexDts).not.toMatch(/_internals/);

    // Verify finalizeEvidence is NOT directly mentioned in the main entry
    // (underscore-prefixed exports are OK, but 'finalizeEvidence' itself should not appear)
    expect(indexDts).not.toMatch(/finalizeEvidence/);

    // Verify the testing entry DOES have _internals
    const testingDts = await fs.readFile(path.join(distDir, 'testing.d.ts'), 'utf8');
    expect(testingDts).toMatch(/_internals/);
    expect(testingDts).toMatch(/finalizeEvidence/);
  });
});
