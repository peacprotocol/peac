import { describe, it, expect, vi } from 'vitest';
import { DidWebResolver } from '../src/did-web.js';
import type { DidWebResolverOptions, HardenedFetchResult } from '../src/did-web.js';
import type { DIDDocument } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchFn(response: HardenedFetchResult): DidWebResolverOptions['fetchFn'] {
  return vi.fn().mockResolvedValue(response);
}

function validDoc(id: string): DIDDocument {
  return {
    '@context': 'https://www.w3.org/ns/did/v1',
    id,
    verificationMethod: [
      {
        id: `${id}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: id,
        publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      },
    ],
  };
}

function successResponse(did: string, contentType = 'application/did+json'): HardenedFetchResult {
  return { ok: true, data: validDoc(did), contentType };
}

function resolver(
  fetchFn: DidWebResolverOptions['fetchFn'],
  opts?: Partial<DidWebResolverOptions>
) {
  return new DidWebResolver({ fetchFn, ...opts });
}

// ---------------------------------------------------------------------------
// URL Transformation
// ---------------------------------------------------------------------------

describe('did:web URL transformation', () => {
  it('did:web:example.com -> /.well-known/did.json', async () => {
    const fetchFn = mockFetchFn(successResponse('did:web:example.com'));
    const r = resolver(fetchFn);
    await r.resolve('did:web:example.com');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://example.com/.well-known/did.json',
      expect.any(Object)
    );
  });

  it('did:web:example.com:path:to -> /path/to/did.json', async () => {
    const fetchFn = mockFetchFn(successResponse('did:web:example.com:path:to'));
    const r = resolver(fetchFn);
    await r.resolve('did:web:example.com:path:to');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://example.com/path/to/did.json',
      expect.any(Object)
    );
  });

  it('handles percent-encoded port (%3A)', async () => {
    const fetchFn = mockFetchFn(successResponse('did:web:example.com%3A8443'));
    const r = resolver(fetchFn);
    await r.resolve('did:web:example.com%3A8443');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://example.com:8443/.well-known/did.json',
      expect.any(Object)
    );
  });
});

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

describe('did:web resolution', () => {
  it('returns DID Document on success', async () => {
    const did = 'did:web:example.com';
    const r = resolver(mockFetchFn(successResponse(did)));
    const result = await r.resolve(did);
    expect(result.didDocument).not.toBeNull();
    expect(result.didDocument!.id).toBe(did);
  });

  it('returns notFound on fetch failure', async () => {
    const r = resolver(mockFetchFn({ ok: false, error: 'timeout' }));
    const result = await r.resolve('did:web:unreachable.example.com');
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe('notFound');
  });

  it('returns notFound on fetch exception', async () => {
    const r = resolver(vi.fn().mockRejectedValue(new Error('network')));
    const result = await r.resolve('did:web:error.example.com');
    expect(result.didResolutionMetadata.error).toBe('notFound');
  });
});

// ---------------------------------------------------------------------------
// Content-Type Enforcement
// ---------------------------------------------------------------------------

describe('did:web content-type', () => {
  it('accepts application/did+json', async () => {
    const did = 'did:web:example.com';
    const r = resolver(mockFetchFn(successResponse(did, 'application/did+json')));
    const result = await r.resolve(did);
    expect(result.didDocument).not.toBeNull();
  });

  it('accepts application/json', async () => {
    const did = 'did:web:example.com';
    const r = resolver(mockFetchFn(successResponse(did, 'application/json')));
    const result = await r.resolve(did);
    expect(result.didDocument).not.toBeNull();
  });

  it('accepts application/json with charset parameter', async () => {
    const did = 'did:web:example.com';
    const r = resolver(mockFetchFn(successResponse(did, 'application/json; charset=utf-8')));
    const result = await r.resolve(did);
    expect(result.didDocument).not.toBeNull();
  });

  it('rejects text/html', async () => {
    const did = 'did:web:example.com';
    const r = resolver(mockFetchFn({ ok: true, data: validDoc(did), contentType: 'text/html' }));
    const result = await r.resolve(did);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('allows missing content-type (permissive for servers that omit it)', async () => {
    const did = 'did:web:example.com';
    const r = resolver(mockFetchFn({ ok: true, data: validDoc(did) }));
    const result = await r.resolve(did);
    expect(result.didDocument).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Redirect Detection (finalUrl)
// ---------------------------------------------------------------------------

describe('did:web redirect detection', () => {
  it('rejects when finalUrl differs from requested URL', async () => {
    const did = 'did:web:example.com';
    const r = resolver(
      mockFetchFn({
        ok: true,
        data: validDoc(did),
        contentType: 'application/json',
        finalUrl: 'https://evil.com/.well-known/did.json',
      })
    );
    const result = await r.resolve(did);
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('accepts when finalUrl matches requested URL', async () => {
    const did = 'did:web:example.com';
    const r = resolver(
      mockFetchFn({
        ok: true,
        data: validDoc(did),
        contentType: 'application/json',
        finalUrl: 'https://example.com/.well-known/did.json',
      })
    );
    const result = await r.resolve(did);
    expect(result.didDocument).not.toBeNull();
  });

  it('accepts when finalUrl is not provided (legacy fetcher)', async () => {
    const did = 'did:web:example.com';
    const r = resolver(mockFetchFn(successResponse(did)));
    const result = await r.resolve(did);
    expect(result.didDocument).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Exact id Match (DD-203)
// ---------------------------------------------------------------------------

describe('did:web id match', () => {
  it('rejects mismatched id', async () => {
    const r = resolver(
      mockFetchFn({
        ok: true,
        data: validDoc('did:web:other.com'),
        contentType: 'application/json',
      })
    );
    const result = await r.resolve('did:web:example.com');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });
});

// ---------------------------------------------------------------------------
// IP Literal Rejection
// ---------------------------------------------------------------------------

describe('did:web IP rejection', () => {
  it('rejects IPv4', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: {} }));
    const result = await r.resolve('did:web:192.168.1.1');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects IPv6', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: {} }));
    const result = await r.resolve('did:web:[::1]');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });
});

// ---------------------------------------------------------------------------
// Authority Validation (Fix 2: strict)
// ---------------------------------------------------------------------------

describe('did:web authority validation', () => {
  it('rejects userinfo in authority', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: {} }));
    const result = await r.resolve('did:web:user%40evil.com');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects query in authority', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: {} }));
    const result = await r.resolve('did:web:example.com%3Ffoo%3Dbar');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects fragment in authority', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: {} }));
    const result = await r.resolve('did:web:example.com%23fragment');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects encoded slash in authority (path traversal)', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: {} }));
    const result = await r.resolve('did:web:example.com%2F..%2Fetc');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects empty method-specific id', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: {} }));
    const result = await r.resolve('did:web:');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects invalid percent encoding', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: {} }));
    const result = await r.resolve('did:web:example%ZZcom');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });
});

// ---------------------------------------------------------------------------
// Path Segment Validation
// ---------------------------------------------------------------------------

describe('did:web path validation', () => {
  it('rejects empty path segment', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: {} }));
    // double colon creates an empty segment
    const result = await r.resolve('did:web:example.com::path');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects encoded slash in path segment', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: {} }));
    const result = await r.resolve('did:web:example.com:path%2Ftraversal');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects query in path segment', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: {} }));
    const result = await r.resolve('did:web:example.com:path%3Ffoo');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects fragment in path segment', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: {} }));
    const result = await r.resolve('did:web:example.com:path%23frag');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });
});

// ---------------------------------------------------------------------------
// Domain Allowlist
// ---------------------------------------------------------------------------

describe('did:web domain allowlist', () => {
  it('allows listed domain', async () => {
    const did = 'did:web:trusted.example.com';
    const r = resolver(mockFetchFn(successResponse(did)), {
      allowedDomains: ['trusted.example.com'],
    });
    const result = await r.resolve(did);
    expect(result.didDocument).not.toBeNull();
  });

  it('rejects unlisted domain', async () => {
    const r = resolver(mockFetchFn(successResponse('did:web:evil.com')), {
      allowedDomains: ['trusted.example.com'],
    });
    const result = await r.resolve('did:web:evil.com');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('case-insensitive allowlist comparison', async () => {
    const did = 'did:web:Trusted.Example.COM';
    const r = resolver(mockFetchFn(successResponse(did)), {
      allowedDomains: ['trusted.example.com'],
    });
    const result = await r.resolve(did);
    expect(result.didDocument).not.toBeNull();
  });

  it('trailing-dot normalized allowlist comparison', async () => {
    const did = 'did:web:trusted.example.com';
    const r = resolver(mockFetchFn(successResponse(did)), {
      allowedDomains: ['trusted.example.com.'],
    });
    const result = await r.resolve(did);
    expect(result.didDocument).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Format Validation
// ---------------------------------------------------------------------------

describe('did:web format validation', () => {
  it('rejects non-did:web', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: {} }));
    const result = await r.resolve('did:key:z6Mk...');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects non-object response', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: 'string', contentType: 'application/json' }));
    const result = await r.resolve('did:web:example.com');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects array response', async () => {
    const r = resolver(mockFetchFn({ ok: true, data: [], contentType: 'application/json' }));
    const result = await r.resolve('did:web:example.com');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('rejects document without id', async () => {
    const r = resolver(
      mockFetchFn({ ok: true, data: { '@context': 'test' }, contentType: 'application/json' })
    );
    const result = await r.resolve('did:web:example.com');
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });
});

// ---------------------------------------------------------------------------
// Fetch Options
// ---------------------------------------------------------------------------

describe('did:web fetch options', () => {
  it('passes timeout, size limit, no-redirects', async () => {
    const did = 'did:web:example.com';
    const fetchFn = mockFetchFn(successResponse(did));
    const r = resolver(fetchFn, { timeoutMs: 3000 });
    await r.resolve(did);
    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        timeoutMs: 3000,
        maxResponseBytes: 256 * 1024,
        maxRedirects: 0,
      })
    );
  });

  it('defaults to 5000ms timeout', async () => {
    const did = 'did:web:example.com';
    const fetchFn = mockFetchFn(successResponse(did));
    const r = resolver(fetchFn);
    await r.resolve(did);
    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeoutMs: 5000 })
    );
  });
});
