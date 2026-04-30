// Discovery shape validation tests.
// issuer + jwks_uri must be non-empty strings; jwks_uri must parse as URL;
// extra fields tolerated; success vector returns the parsed object.

import { vi, describe, it, expect, beforeEach } from 'vitest';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
  enqueue,
  resetMock,
} from './_helpers/mock-net-node.js';

vi.mock('@peac/net-node', async () => {
  const actual = await vi.importActual<typeof import('@peac/net-node')>('@peac/net-node');
  return {
    ...actual,
    safeFetchJson: mockSafeFetchJson,
    safeFetchJWKS: mockSafeFetchJWKS,
    safeFetchRaw: mockSafeFetchRaw,
  };
});

import { fetchIssuerConfig } from '../src/discovery.js';

beforeEach(() => {
  resetMock();
});

const VALID = {
  issuer: 'https://issuer.example.com',
  jwks_uri: 'https://issuer.example.com/.well-known/jwks.json',
  version: 'peac-issuer/1',
};

describe('discovery shape validation', () => {
  it('valid issuer-config returns success with parsed body', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: VALID,
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.issuer).toBe('https://issuer.example.com');
      expect(result.body.jwks_uri).toBe('https://issuer.example.com/.well-known/jwks.json');
    }
  });

  it('extra unknown fields are tolerated', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { ...VALID, extra: 'ignored', another: 42 },
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.issuer).toBe(VALID.issuer);
      expect(result.body.jwks_uri).toBe(VALID.jwks_uri);
    }
  });

  it('missing issuer field surfaces discovery_invalid_shape', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { jwks_uri: VALID.jwks_uri },
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('discovery_invalid_shape');
  });

  it('missing jwks_uri field surfaces discovery_invalid_shape', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { issuer: VALID.issuer },
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('discovery_invalid_shape');
  });

  it('empty-string issuer surfaces discovery_invalid_shape', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { issuer: '', jwks_uri: VALID.jwks_uri },
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('discovery_invalid_shape');
  });

  it('empty-string jwks_uri surfaces discovery_invalid_shape', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { issuer: VALID.issuer, jwks_uri: '' },
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('discovery_invalid_shape');
  });

  it('jwks_uri that does not parse as URL surfaces discovery_invalid_shape', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { issuer: VALID.issuer, jwks_uri: 'not a url at all' },
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('discovery_invalid_shape');
  });

  it('non-HTTPS jwks_uri is NOT rejected at discovery (deferred to JWKS fetch)', async () => {
    // Per plan Fix #6: discovery does not pre-reject non-HTTPS jwks_uri;
    // the eventual JWKS fetch will reject with fetch_blocked_https_only.
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { issuer: VALID.issuer, jwks_uri: 'http://issuer.example.com/jwks' },
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(true);
  });

  it('non-object body surfaces discovery_invalid_shape', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: 'a string body',
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('discovery_invalid_shape');
  });

  it('null body surfaces discovery_invalid_shape', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: null,
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('discovery_invalid_shape');
  });

  it('array body surfaces discovery_invalid_shape', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: [VALID],
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('discovery_invalid_shape');
  });

  it('error message contains origin only, no path/query/secret', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { jwks_uri: VALID.jwks_uri },
    });
    const result = await fetchIssuerConfig('https://issuer.example.com?secret=abc&token=def');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('https://issuer.example.com');
      expect(result.message).not.toContain('secret');
      expect(result.message).not.toContain('token');
      expect(result.message).not.toContain('/.well-known');
    }
  });

  it('uses canonical configPath from kernel ISSUER_CONFIG (trailing slash tolerant)', async () => {
    // Both bare and trailing-slash issuer should produce the same canonical config URL.
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: VALID,
    });
    const r1 = await fetchIssuerConfig('https://issuer.example.com');
    expect(r1.ok).toBe(true);

    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: VALID,
    });
    const r2 = await fetchIssuerConfig('https://issuer.example.com/');
    expect(r2.ok).toBe(true);
  });
});
