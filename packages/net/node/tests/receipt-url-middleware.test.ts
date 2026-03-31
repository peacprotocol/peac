/**
 * Tests for receipt URL resolution middleware (carrier-shaped API).
 *
 * Mocks the underlying resolveReceiptUrl() and verifyReceiptRef()
 * to test middleware behavior: carrier contract, semaphore, strict mode.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PeacEvidenceCarrier, ReceiptRef } from '@peac/schema';

vi.mock('../src/receipt-resolver.js', () => ({
  resolveReceiptUrl: vi.fn(),
  verifyReceiptRef: vi.fn(),
}));

import { createReceiptUrlResolver } from '../src/receipt-url-middleware.js';
import type { RetrievalMetadata } from '../src/receipt-url-middleware.js';
import { resolveReceiptUrl, verifyReceiptRef } from '../src/receipt-resolver.js';

const mockResolve = vi.mocked(resolveReceiptUrl);
const mockVerifyRef = vi.mocked(verifyReceiptRef);

const TEST_REF =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' as ReceiptRef;
const TEST_URL = 'https://receipts.example.com/abc123.jws';
const TEST_JWS = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.c2lnbmF0dXJl';

function makeCarrier(overrides?: Partial<PeacEvidenceCarrier>): PeacEvidenceCarrier {
  return {
    receipt_ref: TEST_REF,
    receipt_url: TEST_URL,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createReceiptUrlResolver()', () => {
  describe('factory validation', () => {
    it('rejects maxConcurrent <= 0', () => {
      expect(() => createReceiptUrlResolver({ maxConcurrent: 0 })).toThrow(/positive integer/);
    });

    it('rejects negative maxConcurrent', () => {
      expect(() => createReceiptUrlResolver({ maxConcurrent: -1 })).toThrow(/positive integer/);
    });

    it('rejects non-integer maxConcurrent', () => {
      expect(() => createReceiptUrlResolver({ maxConcurrent: 2.5 })).toThrow(/positive integer/);
    });

    it('accepts valid maxConcurrent', () => {
      expect(() => createReceiptUrlResolver({ maxConcurrent: 4 })).not.toThrow();
    });
  });

  describe('carrier contract: success', () => {
    it('populates receipt_jws on successful resolution', async () => {
      mockResolve.mockResolvedValue({ ok: true, jws: TEST_JWS });
      mockVerifyRef.mockReturnValue(true);

      const middleware = createReceiptUrlResolver();
      const result = await middleware(makeCarrier());

      expect(result.receipt_jws).toBe(TEST_JWS);
      expect(result.receipt_ref).toBe(TEST_REF);
      expect(result.receipt_url).toBe(TEST_URL);
    });

    it('returned carrier is a pure PeacEvidenceCarrier (no _retrieval field)', async () => {
      mockResolve.mockResolvedValue({ ok: true, jws: TEST_JWS });
      mockVerifyRef.mockReturnValue(true);

      const middleware = createReceiptUrlResolver();
      const result = await middleware(makeCarrier());

      expect(result).not.toHaveProperty('_retrieval');
    });

    it('delivers retrieval metadata via onResolved callback (DD-207)', async () => {
      mockResolve.mockResolvedValue({ ok: true, jws: TEST_JWS });
      mockVerifyRef.mockReturnValue(true);

      let captured: RetrievalMetadata | undefined;
      const middleware = createReceiptUrlResolver({
        onResolved: (meta) => {
          captured = meta;
        },
      });
      await middleware(makeCarrier());

      expect(captured).toBeDefined();
      expect(captured!.url).toBe(TEST_URL);
      expect(captured!.latencyMs).toBeGreaterThanOrEqual(0);
      expect(new Date(captured!.resolvedAt).getTime()).not.toBeNaN();
    });

    it('onResolved failure does not revert successful carrier resolution', async () => {
      mockResolve.mockResolvedValue({ ok: true, jws: TEST_JWS });
      mockVerifyRef.mockReturnValue(true);

      const middleware = createReceiptUrlResolver({
        onResolved: () => {
          throw new Error('telemetry crash');
        },
      });
      const result = await middleware(makeCarrier());

      expect(result.receipt_jws).toBe(TEST_JWS);
    });

    it('does not call onResolved on failure', async () => {
      mockResolve.mockResolvedValue({
        ok: false,
        code: 'E_NET_SSRF_URL_REJECTED',
        error: 'rejected',
      });

      const onResolved = vi.fn();
      const middleware = createReceiptUrlResolver({ onResolved });
      await middleware(makeCarrier());

      expect(onResolved).not.toHaveBeenCalled();
    });

    it('passes timeoutMs and maxBytes to resolveReceiptUrl', async () => {
      mockResolve.mockResolvedValue({ ok: true, jws: TEST_JWS });
      mockVerifyRef.mockReturnValue(true);

      const middleware = createReceiptUrlResolver({ timeoutMs: 3000, maxBytes: 32768 });
      await middleware(makeCarrier());

      expect(mockResolve).toHaveBeenCalledWith(TEST_URL, {
        timeoutMs: 3000,
        maxBytes: 32768,
      });
    });
  });

  describe('carrier contract: no-op cases', () => {
    it('returns carrier unchanged when receipt_jws already present', async () => {
      const carrier = makeCarrier({ receipt_jws: 'existing-jws' });
      const middleware = createReceiptUrlResolver();
      const result = await middleware(carrier);

      expect(result).toBe(carrier);
      expect(mockResolve).not.toHaveBeenCalled();
    });

    it('returns carrier unchanged when receipt_url is absent', async () => {
      const carrier: PeacEvidenceCarrier = { receipt_ref: TEST_REF };
      const middleware = createReceiptUrlResolver();
      const result = await middleware(carrier);

      expect(result).toBe(carrier);
      expect(mockResolve).not.toHaveBeenCalled();
    });
  });

  describe('idempotence', () => {
    it('does not fetch again when receipt_jws was populated by first pass', async () => {
      mockResolve.mockResolvedValue({ ok: true, jws: TEST_JWS });
      mockVerifyRef.mockReturnValue(true);

      const middleware = createReceiptUrlResolver();
      const carrier = makeCarrier();

      const first = await middleware(carrier);
      expect(first.receipt_jws).toBe(TEST_JWS);

      const second = await middleware(first);
      expect(second).toBe(first);
      expect(mockResolve).toHaveBeenCalledTimes(1);
    });
  });

  describe('carrier contract: non-strict failure', () => {
    it('returns original carrier unchanged on resolution failure', async () => {
      mockResolve.mockResolvedValue({
        ok: false,
        code: 'E_NET_SSRF_URL_REJECTED',
        error: 'Private IP',
      });

      const carrier = makeCarrier();
      const middleware = createReceiptUrlResolver();
      const result = await middleware(carrier);

      expect(result).toBe(carrier);
      expect(result.receipt_jws).toBeUndefined();
    });

    it('returns original carrier unchanged on ref verification failure', async () => {
      mockResolve.mockResolvedValue({ ok: true, jws: TEST_JWS });
      mockVerifyRef.mockReturnValue(false);

      const carrier = makeCarrier();
      const middleware = createReceiptUrlResolver();
      const result = await middleware(carrier);

      expect(result).toBe(carrier);
      expect(result.receipt_jws).toBeUndefined();
    });

    it('returns original carrier unchanged when resolver throws (non-strict)', async () => {
      mockResolve.mockRejectedValue(new Error('network explosion'));

      const carrier = makeCarrier();
      const middleware = createReceiptUrlResolver();
      const result = await middleware(carrier);

      expect(result).toBe(carrier);
    });
  });

  describe('carrier contract: strict failure', () => {
    it('throws on resolution failure in strict mode', async () => {
      mockResolve.mockResolvedValue({
        ok: false,
        code: 'E_RECEIPT_URL_TOO_LONG',
        error: 'URL too long',
      });

      const middleware = createReceiptUrlResolver({ strict: true });
      await expect(middleware(makeCarrier())).rejects.toThrow(/URL too long/);
    });

    it('throws on ref mismatch in strict mode', async () => {
      mockResolve.mockResolvedValue({ ok: true, jws: TEST_JWS });
      mockVerifyRef.mockReturnValue(false);

      const middleware = createReceiptUrlResolver({ strict: true });
      await expect(middleware(makeCarrier())).rejects.toThrow(/ref verification failed/);
    });

    it('strict mode error includes error code', async () => {
      mockResolve.mockResolvedValue({
        ok: false,
        code: 'E_RECEIPT_URL_READ_ERROR',
        error: 'Read failed',
      });

      const middleware = createReceiptUrlResolver({ strict: true });
      try {
        await middleware(makeCarrier());
        expect.fail('should have thrown');
      } catch (e: unknown) {
        expect((e as { code: string }).code).toBe('E_RECEIPT_URL_READ_ERROR');
      }
    });

    it('does not throw on success in strict mode', async () => {
      mockResolve.mockResolvedValue({ ok: true, jws: TEST_JWS });
      mockVerifyRef.mockReturnValue(true);

      const middleware = createReceiptUrlResolver({ strict: true });
      const result = await middleware(makeCarrier());
      expect(result.receipt_jws).toBe(TEST_JWS);
    });
  });

  describe('concurrency semaphore', () => {
    it('limits concurrent resolutions to maxConcurrent', async () => {
      let concurrentCount = 0;
      let maxObserved = 0;

      mockResolve.mockImplementation(async () => {
        concurrentCount++;
        maxObserved = Math.max(maxObserved, concurrentCount);
        await new Promise((r) => setTimeout(r, 50));
        concurrentCount--;
        return { ok: true, jws: TEST_JWS };
      });
      mockVerifyRef.mockReturnValue(true);

      const middleware = createReceiptUrlResolver({ maxConcurrent: 2 });
      const carriers = Array.from({ length: 6 }, () => makeCarrier());
      await Promise.all(carriers.map((c) => middleware(c)));

      expect(maxObserved).toBeLessThanOrEqual(2);
      expect(mockResolve).toHaveBeenCalledTimes(6);
    });

    it('releases semaphore on failure (does not deadlock)', async () => {
      mockResolve
        .mockResolvedValueOnce({ ok: false, code: 'E_NET_REQUEST_TIMEOUT', error: 'timeout' })
        .mockResolvedValueOnce({ ok: true, jws: TEST_JWS })
        .mockResolvedValueOnce({ ok: true, jws: TEST_JWS });
      mockVerifyRef.mockReturnValue(true);

      const middleware = createReceiptUrlResolver({ maxConcurrent: 1 });
      const results = await Promise.all([
        middleware(makeCarrier()),
        middleware(makeCarrier()),
        middleware(makeCarrier()),
      ]);

      expect(results[0].receipt_jws).toBeUndefined();
      expect(results[1].receipt_jws).toBe(TEST_JWS);
      expect(results[2].receipt_jws).toBe(TEST_JWS);
    });
  });

  describe('no negative caching (RURL-003)', () => {
    it('retries after failure without caching the error', async () => {
      mockResolve
        .mockResolvedValueOnce({ ok: false, code: 'E_NET_NETWORK_ERROR', error: 'transient' })
        .mockResolvedValueOnce({ ok: true, jws: TEST_JWS });
      mockVerifyRef.mockReturnValue(true);

      const middleware = createReceiptUrlResolver();

      const first = await middleware(makeCarrier());
      expect(first.receipt_jws).toBeUndefined();

      const second = await middleware(makeCarrier());
      expect(second.receipt_jws).toBe(TEST_JWS);
      expect(mockResolve).toHaveBeenCalledTimes(2);
    });
  });
});
