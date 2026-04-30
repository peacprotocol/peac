// Content-type policy: when caller passes acceptContentTypes, fetch-safe
// matches case-insensitively against the type/subtype prefix (parameters
// like charset are stripped).

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

import { fetchJsonSafe } from '../src/fetch-safe.js';

beforeEach(() => {
  resetMock();
});

describe('fetch-safe content-type policy', () => {
  it('passes when acceptContentTypes is omitted', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: {},
    });
    const result = await fetchJsonSafe('https://issuer.example.com/x');
    expect(result.ok).toBe(true);
  });

  it('passes when content-type matches (case-insensitive, parameter stripped)', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'Application/JSON; charset=utf-8',
      body: { ok: true },
    });
    const result = await fetchJsonSafe<{ ok: boolean }>('https://issuer.example.com/x', {
      acceptContentTypes: ['application/json'],
    });
    expect(result.ok).toBe(true);
  });

  it('fails fetch_invalid_content_type when content-type does not match', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: {},
    });
    const result = await fetchJsonSafe('https://issuer.example.com/x', {
      acceptContentTypes: ['application/json'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_invalid_content_type');
  });

  it('fails fetch_invalid_content_type when content-type header is absent', async () => {
    enqueue('safeFetchJson', { ok: true, status: 200, body: {} });
    const result = await fetchJsonSafe('https://issuer.example.com/x', {
      acceptContentTypes: ['application/json'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_invalid_content_type');
  });

  it('content-type allowlist accepts multiple entries (e.g. JOSE + JSON)', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: {},
    });
    const result = await fetchJsonSafe('https://issuer.example.com/x', {
      acceptContentTypes: ['application/json', 'application/jose'],
    });
    expect(result.ok).toBe(true);
  });
});
