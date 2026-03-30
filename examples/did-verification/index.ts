/**
 * DID Verification Example
 *
 * Demonstrates:
 * 1. did:key resolution (zero network I/O)
 * 2. did:web resolution setup with caller-provided hardened fetch
 * 3. Composite resolver with caching
 * 4. Ed25519 key extraction for verifyLocal()
 */

import {
  DidKeyResolver,
  DidWebResolver,
  CachingResolver,
  createCompositeResolver,
  extractVerificationKey,
} from '@peac/adapter-did';
import type { HardenedFetchFn } from '@peac/adapter-did';

// ---------------------------------------------------------------------------
// 1. did:key: zero network I/O
// ---------------------------------------------------------------------------

async function demoDIDKey() {
  console.log('--- did:key resolution ---');

  const resolver = new DidKeyResolver();
  const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

  const result = await resolver.resolve(did);

  if (!result.didDocument) {
    console.error('Resolution failed:', result.didResolutionMetadata.error);
    return;
  }

  const publicKey = extractVerificationKey(result.didDocument);
  console.log('DID:', did);
  console.log('Key:', Buffer.from(publicKey!).toString('hex'));
  console.log('Ready for verifyLocal()');
}

// ---------------------------------------------------------------------------
// 2. did:web: caller-provided hardened fetch
// ---------------------------------------------------------------------------

async function demoDIDWebSetup() {
  console.log('\n--- did:web resolver setup ---');

  // In production, use safeFetchJson from @peac/net-node:
  //   import { safeFetchJson } from '@peac/net-node';
  //   const webResolver = new DidWebResolver({ fetchFn: safeFetchJson });
  //
  // The fetch function must enforce:
  //   - HTTPS only
  //   - No redirects (maxRedirects: 0)
  //   - Private-IP / DNS-rebinding protections
  //   - Timeout (default 5000ms)
  //   - Response size limit (256 KB)

  // Mock hardened fetch for this example (no real network call)
  const mockFetch: HardenedFetchFn = async (url, _options) => {
    console.log('  Would fetch:', url);
    return {
      ok: false,
      error: 'example: no real fetch',
      contentType: 'application/did+json',
    };
  };

  const webResolver = new DidWebResolver({
    fetchFn: mockFetch,
    allowedDomains: ['trusted.example.com'],
    timeoutMs: 3000,
  });

  const result = await webResolver.resolve('did:web:trusted.example.com');
  console.log('Result:', result.didResolutionMetadata.error ?? 'success');
  console.log('(Expected: notFound in this example since fetch is mocked)');
}

// ---------------------------------------------------------------------------
// 3. Composite resolver with caching
// ---------------------------------------------------------------------------

async function demoCompositeWithCaching() {
  console.log('\n--- composite resolver with caching ---');

  const keyResolver = new DidKeyResolver();
  const cachedKey = new CachingResolver(keyResolver, {
    ttlMs: 60_000,
    maxEntries: 100,
  });

  const resolver = createCompositeResolver([cachedKey]);

  const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

  // First resolve: delegates to inner
  await resolver.resolve(did);
  console.log('First resolve: cache miss (inner resolver called)');

  // Second resolve: served from cache
  await resolver.resolve(did);
  console.log('Second resolve: cache hit (no inner call)');

  console.log('Cache size:', cachedKey.size);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  await demoDIDKey();
  await demoDIDWebSetup();
  await demoCompositeWithCaching();
  console.log('\nExample complete.');
}

main().catch(console.error);
