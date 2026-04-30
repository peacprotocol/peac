import { describe, it, expect, beforeEach } from 'vitest';
import {
  createShadowExecutor,
  type ProtocolPointerFetchFn,
  type ResolverHttpPointerFetchFn,
} from '../src/lib/shadow-execute.js';
import { resetShadowSinkForTests, getMismatches } from '../src/lib/shadow-mismatch-sink.js';

const URL_A = 'https://issuer.example.com/r/abc123';
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

function mockProtocolFetch(impl: ProtocolPointerFetchFn): ProtocolPointerFetchFn {
  return impl;
}

function mockResolverHttpFetch(impl: ResolverHttpPointerFetchFn): ResolverHttpPointerFetchFn {
  return impl;
}

describe('createShadowExecutor', () => {
  beforeEach(() => {
    resetShadowSinkForTests({ PEAC_INTERNAL_SHADOW_BUFFER_SIZE: '64' });
  });

  it('returns aligned verdict and records nothing when both implementations succeed identically', async () => {
    const executor = createShadowExecutor({
      protocolFetch: mockProtocolFetch(async () => ({
        ok: true,
        actualDigest: DIGEST_A,
        contentType: 'application/jose',
      })),
      resolverHttpFetch: mockResolverHttpFetch(async () => ({
        ok: true,
        actualDigest: DIGEST_A,
        contentType: 'application/jose',
      })),
    });

    const outcome = await executor(URL_A, DIGEST_A);

    expect(outcome.verdict.classMatches).toBe(true);
    expect(outcome.verdict.digestMatches).toBe(true);
    expect(outcome.verdict.successShapeMatches).toBe(true);
    expect(outcome.verdict.contentTypeWarningClassMatches).toBe(true);
    expect(outcome.verdict.mismatchClasses).toEqual([]);
    expect(outcome.recordedEntry).toBeUndefined();
    expect(getMismatches()).toEqual([]);
  });

  it('records a mismatch when protocol succeeds and resolver-http fails', async () => {
    const executor = createShadowExecutor({
      protocolFetch: mockProtocolFetch(async () => ({
        ok: true,
        actualDigest: DIGEST_A,
        contentType: 'application/jose',
      })),
      resolverHttpFetch: mockResolverHttpFetch(async () => ({
        ok: false,
        code: 'fetch_timeout',
      })),
    });

    const outcome = await executor(URL_A, DIGEST_A);

    expect(outcome.verdict.mismatchClasses).toContain('parity_class_mismatch');
    expect(outcome.recordedEntry).toBeDefined();
    expect(outcome.recordedEntry?.legacySummary.ok).toBe(true);
    expect(outcome.recordedEntry?.shadowSummary.ok).toBe(false);
    expect(outcome.recordedEntry?.shadowSummary.code).toBe('fetch_timeout');
    expect(outcome.recordedEntry?.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(getMismatches().length).toBe(1);
  });

  it('records a digest-only mismatch when both succeed but digests differ', async () => {
    const executor = createShadowExecutor({
      protocolFetch: mockProtocolFetch(async () => ({
        ok: true,
        actualDigest: DIGEST_A,
        contentType: 'application/jose',
      })),
      resolverHttpFetch: mockResolverHttpFetch(async () => ({
        ok: true,
        actualDigest: DIGEST_B,
        contentType: 'application/jose',
      })),
    });

    const outcome = await executor(URL_A, DIGEST_A);
    expect(outcome.verdict.classMatches).toBe(true);
    expect(outcome.verdict.digestMatches).toBe(false);
    expect(outcome.verdict.mismatchClasses).toContain('parity_digest_mismatch');
    expect(outcome.recordedEntry).toBeDefined();
  });

  it('records a content-type warning class mismatch on success', async () => {
    const executor = createShadowExecutor({
      protocolFetch: mockProtocolFetch(async () => ({
        ok: true,
        actualDigest: DIGEST_A,
        contentType: 'text/html',
        contentTypeWarning: 'Unexpected Content-Type: text/html; expected ...',
      })),
      resolverHttpFetch: mockResolverHttpFetch(async () => ({
        ok: true,
        actualDigest: DIGEST_A,
        contentType: 'text/html',
      })),
    });

    const outcome = await executor(URL_A, DIGEST_A);
    expect(outcome.verdict.contentTypeWarningClassMatches).toBe(false);
    expect(outcome.verdict.mismatchClasses).toContain('parity_content_type_warning_mismatch');
  });

  it('records a success-shape mismatch when content-type presence differs', async () => {
    const executor = createShadowExecutor({
      protocolFetch: mockProtocolFetch(async () => ({
        ok: true,
        actualDigest: DIGEST_A,
        contentType: 'application/jose',
      })),
      resolverHttpFetch: mockResolverHttpFetch(async () => ({
        ok: true,
        actualDigest: DIGEST_A,
      })),
    });

    const outcome = await executor(URL_A, DIGEST_A);
    expect(outcome.verdict.successShapeMatches).toBe(false);
    expect(outcome.verdict.mismatchClasses).toContain('parity_success_shape_mismatch');
  });

  it('runs both implementations in parallel (Promise.all)', async () => {
    const order: string[] = [];
    const executor = createShadowExecutor({
      protocolFetch: mockProtocolFetch(async () => {
        order.push('protocol-start');
        await new Promise((r) => setTimeout(r, 10));
        order.push('protocol-end');
        return { ok: true, actualDigest: DIGEST_A };
      }),
      resolverHttpFetch: mockResolverHttpFetch(async () => {
        order.push('shadow-start');
        await new Promise((r) => setTimeout(r, 10));
        order.push('shadow-end');
        return { ok: true, actualDigest: DIGEST_A };
      }),
    });
    await executor(URL_A, DIGEST_A);
    expect(order.indexOf('protocol-start')).toBeLessThan(order.indexOf('protocol-end'));
    expect(order.indexOf('shadow-start')).toBeLessThan(order.indexOf('shadow-end'));
    // Both starts happen before either end (parallel).
    const earlierEnd = Math.min(order.indexOf('protocol-end'), order.indexOf('shadow-end'));
    expect(order.indexOf('protocol-start')).toBeLessThan(earlierEnd);
    expect(order.indexOf('shadow-start')).toBeLessThan(earlierEnd);
  });

  it('records the same requestHash across two invocations of the same input', async () => {
    const protocolFetch: ProtocolPointerFetchFn = async () => ({
      ok: true,
      actualDigest: DIGEST_A,
    });
    const resolverHttpFetch: ResolverHttpPointerFetchFn = async () => ({
      ok: false,
      code: 'fetch_timeout',
    });
    const executor = createShadowExecutor({ protocolFetch, resolverHttpFetch });

    const a = await executor(URL_A, DIGEST_A);
    const b = await executor(URL_A, DIGEST_A);
    expect(a.recordedEntry?.requestHash).toBe(b.recordedEntry?.requestHash);
  });

  it('produces different requestHash for different (url, expectedDigest) pairs', async () => {
    const protocolFetch: ProtocolPointerFetchFn = async () => ({
      ok: false,
      reason: 'pointer_fetch_failed',
      message: 'x',
    });
    const resolverHttpFetch: ResolverHttpPointerFetchFn = async () => ({
      ok: true,
      actualDigest: DIGEST_A,
    });
    const executor = createShadowExecutor({ protocolFetch, resolverHttpFetch });

    const a = await executor(URL_A, DIGEST_A);
    const b = await executor(URL_A, DIGEST_B);
    expect(a.recordedEntry?.requestHash).not.toBe(b.recordedEntry?.requestHash);
  });
});
