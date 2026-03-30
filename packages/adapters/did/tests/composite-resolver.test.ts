import { describe, it, expect } from 'vitest';
import { createCompositeResolver } from '../src/resolver.js';
import { DidKeyResolver } from '../src/did-key.js';
import type { DIDResolver } from '../src/resolver.js';

describe('createCompositeResolver', () => {
  it('delegates to the correct method-specific resolver', async () => {
    const keyResolver = new DidKeyResolver();
    const composite = createCompositeResolver([keyResolver]);

    const result = await composite.resolve(
      'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    );
    expect(result.didDocument).not.toBeNull();
    expect(result.didDocument!.id).toBe('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
  });

  it('returns methodNotSupported for unregistered methods', async () => {
    const keyResolver = new DidKeyResolver();
    const composite = createCompositeResolver([keyResolver]);

    const result = await composite.resolve('did:web:example.com');
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe('methodNotSupported');
  });

  it('returns invalidDid for malformed DIDs', async () => {
    const composite = createCompositeResolver([new DidKeyResolver()]);
    const result = await composite.resolve('not-a-did');
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('aggregates methods from multiple resolvers', () => {
    const mockWebResolver: DIDResolver = {
      methods: ['web'] as const,
      async resolve() {
        return {
          didDocument: null,
          didResolutionMetadata: { error: 'notImplemented' },
          didDocumentMetadata: {},
        };
      },
    };

    const composite = createCompositeResolver([new DidKeyResolver(), mockWebResolver]);
    expect(composite.methods).toContain('key');
    expect(composite.methods).toContain('web');
  });

  it('tries resolvers in order (first match wins)', async () => {
    const calls: string[] = [];

    const resolver1: DIDResolver = {
      methods: ['key'] as const,
      async resolve(did) {
        calls.push('resolver1');
        return {
          didDocument: { '@context': 'https://www.w3.org/ns/did/v1', id: did },
          didResolutionMetadata: {},
          didDocumentMetadata: {},
        };
      },
    };

    const resolver2: DIDResolver = {
      methods: ['key'] as const,
      async resolve() {
        calls.push('resolver2');
        return {
          didDocument: null,
          didResolutionMetadata: { error: 'shouldNotReach' },
          didDocumentMetadata: {},
        };
      },
    };

    const composite = createCompositeResolver([resolver1, resolver2]);
    await composite.resolve('did:key:z6MkTest');
    expect(calls).toEqual(['resolver1']);
  });
});
