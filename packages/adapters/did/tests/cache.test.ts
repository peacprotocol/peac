import { describe, it, expect, vi } from 'vitest';
import { CachingResolver } from '../src/cache.js';
import type { DIDResolver } from '../src/resolver.js';
import type { DIDResolutionResult } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function successResult(did: string): DIDResolutionResult {
  return {
    didDocument: {
      '@context': 'https://www.w3.org/ns/did/v1',
      id: did,
    },
    didResolutionMetadata: {},
    didDocumentMetadata: {},
  };
}

function failureResult(): DIDResolutionResult {
  return {
    didDocument: null,
    didResolutionMetadata: { error: 'notFound' },
    didDocumentMetadata: {},
  };
}

function mockResolver(
  results: Record<string, DIDResolutionResult>
): DIDResolver & { callCount: number } {
  let callCount = 0;
  return {
    methods: ['key'] as const,
    get callCount() {
      return callCount;
    },
    async resolve(did: string) {
      callCount++;
      return results[did] ?? failureResult();
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CachingResolver', () => {
  it('delegates to inner resolver on first call', async () => {
    const inner = mockResolver({ 'did:key:abc': successResult('did:key:abc') });
    const cached = new CachingResolver(inner);

    const result = await cached.resolve('did:key:abc');
    expect(result.didDocument).not.toBeNull();
    expect(inner.callCount).toBe(1);
  });

  it('returns cached result on second call', async () => {
    const inner = mockResolver({ 'did:key:abc': successResult('did:key:abc') });
    const cached = new CachingResolver(inner);

    await cached.resolve('did:key:abc');
    const result = await cached.resolve('did:key:abc');

    expect(result.didDocument).not.toBeNull();
    expect(inner.callCount).toBe(1); // Only one actual resolve
  });

  it('does not cache failed resolutions', async () => {
    const inner = mockResolver({});
    const cached = new CachingResolver(inner);

    await cached.resolve('did:key:missing');
    await cached.resolve('did:key:missing');

    expect(inner.callCount).toBe(2); // Both go through
  });

  it('expires entries after TTL', async () => {
    vi.useFakeTimers();
    try {
      const inner = mockResolver({ 'did:key:abc': successResult('did:key:abc') });
      const cached = new CachingResolver(inner, { ttlMs: 1000 });

      await cached.resolve('did:key:abc');
      expect(inner.callCount).toBe(1);

      // Advance past TTL
      vi.advanceTimersByTime(1500);

      await cached.resolve('did:key:abc');
      expect(inner.callCount).toBe(2); // Re-resolved after expiry
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts oldest entry when max entries reached', async () => {
    const inner = mockResolver({
      'did:key:a': successResult('did:key:a'),
      'did:key:b': successResult('did:key:b'),
      'did:key:c': successResult('did:key:c'),
    });
    const cached = new CachingResolver(inner, { maxEntries: 2 });

    await cached.resolve('did:key:a');
    await cached.resolve('did:key:b');
    expect(cached.size).toBe(2);

    await cached.resolve('did:key:c'); // Evicts 'a'
    expect(cached.size).toBe(2);

    // 'a' should require re-resolve
    await cached.resolve('did:key:a');
    expect(inner.callCount).toBe(4); // a, b, c, a-again
  });

  it('invalidate() removes specific entry', async () => {
    const inner = mockResolver({ 'did:key:abc': successResult('did:key:abc') });
    const cached = new CachingResolver(inner);

    await cached.resolve('did:key:abc');
    expect(cached.size).toBe(1);

    cached.invalidate('did:key:abc');
    expect(cached.size).toBe(0);

    await cached.resolve('did:key:abc');
    expect(inner.callCount).toBe(2);
  });

  it('clear() removes all entries', async () => {
    const inner = mockResolver({
      'did:key:a': successResult('did:key:a'),
      'did:key:b': successResult('did:key:b'),
    });
    const cached = new CachingResolver(inner);

    await cached.resolve('did:key:a');
    await cached.resolve('did:key:b');
    expect(cached.size).toBe(2);

    cached.clear();
    expect(cached.size).toBe(0);
  });

  it('preserves inner resolver methods', () => {
    const inner = mockResolver({});
    const cached = new CachingResolver(inner);
    expect(cached.methods).toEqual(['key']);
  });

  it('returns isolated copies (caller mutation does not poison cache)', async () => {
    const inner = mockResolver({ 'did:key:abc': successResult('did:key:abc') });
    const cached = new CachingResolver(inner);

    const first = await cached.resolve('did:key:abc');
    // Mutate the returned document
    first.didDocument!.id = 'MUTATED';

    const second = await cached.resolve('did:key:abc');
    // Cached copy should be unaffected
    expect(second.didDocument!.id).toBe('did:key:abc');
    expect(inner.callCount).toBe(1); // Still served from cache
  });
});
