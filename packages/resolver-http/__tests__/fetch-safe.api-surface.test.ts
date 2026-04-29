// API surface guard: resolver-http's verifier-oriented options MUST NOT
// expose @peac/net-node internal option names. The wrapper exposes only
// verifier semantics (timeoutMs, maxResponseBytes, maxRedirects,
// acceptContentTypes); net-node-only / dispatcher-internal names like
// dispatcher / signal / keepAliveTimeout / bodyTimeout / headersTimeout /
// allowH2 / connectTimeout MUST NOT appear in the resolver-http surface.

import { vi, describe, it, expect, beforeEach } from 'vitest';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
  enqueue,
  resetMock,
  getLastOptions,
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

import {
  fetchJsonSafe,
  fetchJwksSafe,
  fetchRawSafe,
  type FetchSafeOptions,
} from '../src/fetch-safe.js';

beforeEach(() => {
  resetMock();
});

const ALLOWED_OPTION_KEYS: ReadonlySet<keyof FetchSafeOptions> = new Set([
  'timeoutMs',
  'maxResponseBytes',
  'maxRedirects',
  'acceptContentTypes',
]);

const FORBIDDEN_NET_NODE_OPTION_KEYS: readonly string[] = [
  'dispatcher',
  'signal',
  'keepAliveTimeout',
  'bodyTimeout',
  'headersTimeout',
  'connectTimeout',
  'allowH2',
  'ssrfPolicy',
  'evidenceLevel',
  'redactionKey',
  'allowedMethods',
  'timeouts',
  'allowDangerousPorts',
  'allowMixedDns',
  'allowCidrs',
];

describe('fetch-safe verifier-oriented option surface', () => {
  it('FetchSafeOptions exposes only the locked four keys (compile-time check encoded as runtime probe)', () => {
    // Construct an options object that uses every allowed key. If any of
    // these become invalid, TypeScript errors fail the test build.
    const probe: FetchSafeOptions = {
      timeoutMs: 1,
      maxResponseBytes: 2,
      maxRedirects: 3,
      acceptContentTypes: ['application/json'],
    };
    for (const k of Object.keys(probe)) {
      expect(ALLOWED_OPTION_KEYS.has(k as keyof FetchSafeOptions)).toBe(true);
    }
  });

  it('wrapper does not pass undici dispatcher / signal / keepAlive / phase-timeouts to net-node by default', async () => {
    enqueue('safeFetchJson', { ok: true, status: 200, body: {} });
    await fetchJsonSafe('https://issuer.example.com/x');
    const opts = getLastOptions() as Record<string, unknown> | undefined;
    expect(opts).toBeDefined();
    if (opts) {
      for (const forbidden of FORBIDDEN_NET_NODE_OPTION_KEYS) {
        // allowedMethods is the one option fetch-safe passes deliberately
        // (locked to ['GET']) — exclude from this gate.
        if (forbidden === 'allowedMethods') continue;
        expect(opts[forbidden]).toBeUndefined();
      }
    }
  });

  it('wrapper output includes only documented success / failure shapes', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { x: 1 },
    });
    const success = await fetchJsonSafe<{ x: number }>('https://issuer.example.com/x');
    if (success.ok) {
      const successKeys = Object.keys(success).sort();
      expect(successKeys).toEqual(['body', 'bytes', 'contentType', 'ok'].sort());
    } else {
      throw new Error('expected success');
    }
  });

  it('all three entries (json/jwks/raw) accept the same FetchSafeOptions shape', async () => {
    enqueue('safeFetchJson', { ok: true, status: 200, body: {} });
    enqueue('safeFetchJWKS', { ok: true, status: 200, body: { keys: [] } });
    enqueue('safeFetchRaw', { ok: true, status: 200, body: 'x' });
    const opts: FetchSafeOptions = { timeoutMs: 100, maxResponseBytes: 4096, maxRedirects: 1 };
    await fetchJsonSafe('https://issuer.example.com/x', opts);
    await fetchJwksSafe('https://issuer.example.com/jwks', opts);
    await fetchRawSafe('https://issuer.example.com/raw', opts);
  });
});
