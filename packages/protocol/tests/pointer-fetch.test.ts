/**
 * Pointer Fetch Tests
 *
 * Tests for PEAC pointer fetch with digest verification per TRANSPORT-PROFILES.md
 *
 * P0-3: DoS bounds testing - size cap, redirect rules, timeout, content-type
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPointerWithDigest, verifyAndFetchPointer } from '../src/pointer-fetch.js';
import * as ssrfModule from '../src/ssrf-safe-fetch.js';
import { sha256Hex } from '@peac/crypto';

// Mock ssrfSafeFetch for deterministic testing
vi.mock('../src/ssrf-safe-fetch.js', async () => {
  const actual = await vi.importActual('../src/ssrf-safe-fetch.js');
  return {
    ...actual,
    ssrfSafeFetch: vi.fn(),
  };
});

describe('Pointer Fetch', () => {
  const validJws = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.c2lnbmF0dXJl';
  let validDigest: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    validDigest = await sha256Hex(validJws);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchPointerWithDigest', () => {
    describe('Input Validation', () => {
      it('should reject invalid digest format (wrong length)', async () => {
        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: 'abc123', // Too short
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('pointer_fetch_failed');
          expect(result.message).toContain('64 lowercase hex');
        }
      });

      it('should reject invalid digest format (uppercase)', async () => {
        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest.toUpperCase(),
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('pointer_fetch_failed');
          expect(result.message).toContain('64 lowercase hex');
        }
      });

      it('should reject non-HTTPS URL', async () => {
        const result = await fetchPointerWithDigest({
          url: 'http://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('pointer_fetch_blocked');
          expect(result.message).toContain('HTTPS');
        }
      });

      it('should reject invalid URL', async () => {
        const result = await fetchPointerWithDigest({
          url: 'not-a-url',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('pointer_fetch_failed');
          expect(result.message).toContain('Invalid pointer URL');
        }
      });
    });

    describe('DoS Bounds - Size Cap', () => {
      it('should reject response exceeding size limit', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: false,
          reason: 'response_too_large',
          message: 'Response too large: 500000 bytes > 262144 max',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('pointer_fetch_too_large');
        }
      });

      it('should pass maxBytes to ssrfSafeFetch', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: true,
          status: 200,
          body: validJws,
          rawBytes: new TextEncoder().encode(validJws),
          contentType: 'application/jose',
        });

        await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(ssrfModule.ssrfSafeFetch).toHaveBeenCalledWith(
          'https://example.com/receipt',
          expect.objectContaining({
            maxBytes: expect.any(Number),
          })
        );
      });
    });

    describe('DoS Bounds - Redirect Policy', () => {
      it('should reject redirects (allowRedirects: false)', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: false,
          reason: 'too_many_redirects',
          message: 'Redirects not allowed',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('pointer_fetch_failed');
        }
      });

      it('should pass allowRedirects: false to ssrfSafeFetch', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: true,
          status: 200,
          body: validJws,
          rawBytes: new TextEncoder().encode(validJws),
          contentType: 'application/jose',
        });

        await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(ssrfModule.ssrfSafeFetch).toHaveBeenCalledWith(
          'https://example.com/receipt',
          expect.objectContaining({
            allowRedirects: false,
          })
        );
      });
    });

    describe('DoS Bounds - Timeout', () => {
      it('should handle timeout errors', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: false,
          reason: 'timeout',
          message: 'Fetch timeout after 5000ms',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('pointer_fetch_timeout');
        }
      });

      it('should pass timeoutMs to ssrfSafeFetch', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: true,
          status: 200,
          body: validJws,
          rawBytes: new TextEncoder().encode(validJws),
          contentType: 'application/jose',
        });

        await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(ssrfModule.ssrfSafeFetch).toHaveBeenCalledWith(
          'https://example.com/receipt',
          expect.objectContaining({
            timeoutMs: expect.any(Number),
          })
        );
      });
    });

    describe('Content-Type Validation', () => {
      it('should accept application/jose content-type', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: true,
          status: 200,
          body: validJws,
          rawBytes: new TextEncoder().encode(validJws),
          contentType: 'application/jose',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.contentTypeWarning).toBeUndefined();
        }
      });

      it('should accept application/json content-type', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: true,
          status: 200,
          body: validJws,
          rawBytes: new TextEncoder().encode(validJws),
          contentType: 'application/json',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.contentTypeWarning).toBeUndefined();
        }
      });

      it('should accept text/plain content-type', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: true,
          status: 200,
          body: validJws,
          rawBytes: new TextEncoder().encode(validJws),
          contentType: 'text/plain',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.contentTypeWarning).toBeUndefined();
        }
      });

      it('should warn but allow unexpected content-type (interoperability)', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: true,
          status: 200,
          body: validJws,
          rawBytes: new TextEncoder().encode(validJws),
          contentType: 'text/html',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.contentTypeWarning).toBeDefined();
          expect(result.contentTypeWarning).toContain('Unexpected Content-Type');
          expect(result.contentTypeWarning).toContain('text/html');
        }
      });
    });

    describe('Digest Verification', () => {
      it('should verify digest matches', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: true,
          status: 200,
          body: validJws,
          rawBytes: new TextEncoder().encode(validJws),
          contentType: 'application/jose',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.digestMatched).toBe(true);
          expect(result.actualDigest).toBe(validDigest);
        }
      });

      it('should reject digest mismatch', async () => {
        const wrongDigest = '0'.repeat(64);

        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: true,
          status: 200,
          body: validJws,
          rawBytes: new TextEncoder().encode(validJws),
          contentType: 'application/jose',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: wrongDigest,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('pointer_digest_mismatch');
          expect(result.actualDigest).toBe(validDigest);
          expect(result.expectedDigest).toBe(wrongDigest);
        }
      });
    });

    describe('JWS Validation', () => {
      it('should reject empty body', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: true,
          status: 200,
          body: '',
          rawBytes: new Uint8Array(),
          contentType: 'application/jose',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: await sha256Hex(''),
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('malformed_receipt');
          expect(result.message).toContain('empty');
        }
      });

      it('should reject non-JWS content', async () => {
        const notJws = 'this is not a JWS';

        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: true,
          status: 200,
          body: notJws,
          rawBytes: new TextEncoder().encode(notJws),
          contentType: 'application/jose',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: await sha256Hex(notJws),
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('malformed_receipt');
          expect(result.message).toContain('3 segments');
        }
      });

      it('should reject JWS with invalid characters', async () => {
        const badJws = 'header.pay!load.signature';

        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: true,
          status: 200,
          body: badJws,
          rawBytes: new TextEncoder().encode(badJws),
          contentType: 'application/jose',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: await sha256Hex(badJws),
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('malformed_receipt');
          expect(result.message).toContain('invalid characters');
        }
      });
    });

    describe('SSRF Error Mapping', () => {
      it('should map private_ip to pointer_fetch_blocked', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: false,
          reason: 'private_ip',
          message: 'Blocked private IP',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('pointer_fetch_blocked');
        }
      });

      it('should map loopback to pointer_fetch_blocked', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: false,
          reason: 'loopback',
          message: 'Blocked loopback address',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('pointer_fetch_blocked');
        }
      });

      it('should map dns_failure to pointer_fetch_blocked', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: false,
          reason: 'dns_failure',
          message: 'DNS resolution failed',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('pointer_fetch_blocked');
        }
      });

      it('should map network_error to pointer_fetch_failed', async () => {
        vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
          ok: false,
          reason: 'network_error',
          message: 'Connection refused',
        });

        const result = await fetchPointerWithDigest({
          url: 'https://example.com/receipt',
          expectedDigest: validDigest,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('pointer_fetch_failed');
        }
      });
    });
  });

  describe('verifyAndFetchPointer', () => {
    it('should parse valid pointer header', async () => {
      vi.mocked(ssrfModule.ssrfSafeFetch).mockResolvedValue({
        ok: true,
        status: 200,
        body: validJws,
        rawBytes: new TextEncoder().encode(validJws),
        contentType: 'application/jose',
      });

      const header = `sha256="${validDigest}", url="https://example.com/receipt"`;
      const result = await verifyAndFetchPointer(header);

      expect(result.ok).toBe(true);
    });

    it('should reject missing sha256 parameter', async () => {
      const header = `url="https://example.com/receipt"`;
      const result = await verifyAndFetchPointer(header);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('missing sha256');
      }
    });

    it('should reject missing url parameter', async () => {
      const header = `sha256="${validDigest}"`;
      const result = await verifyAndFetchPointer(header);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('missing url');
      }
    });
  });
});
