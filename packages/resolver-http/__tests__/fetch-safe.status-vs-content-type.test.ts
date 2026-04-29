// Status precedence over content-type (Commit 2.1 Fix #2).
//
// For a successful upstream response, classify HTTP status BEFORE enforcing
// acceptContentTypes. A 4xx with text/html body is more usefully reported as
// fetch_status_4xx than as fetch_invalid_content_type. The control case
// (status 2xx with mismatched content-type) still surfaces
// fetch_invalid_content_type.

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

import { fetchJsonSafe, fetchJwksSafe, fetchRawSafe } from '../src/fetch-safe.js';

beforeEach(() => {
  resetMock();
});

describe('fetch-safe status precedence over content-type (JSON path)', () => {
  it('401 text/html surfaces fetch_status_4xx, not fetch_invalid_content_type', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 401,
      contentType: 'text/html; charset=utf-8',
      body: { ignored: true },
    });
    const result = await fetchJsonSafe('https://issuer.example.com/x', {
      acceptContentTypes: ['application/json'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('fetch_status_4xx');
      expect(result.code).not.toBe('fetch_invalid_content_type');
      expect(result.status).toBe(401);
    }
  });

  it('500 text/plain surfaces fetch_status_5xx, not fetch_invalid_content_type', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 500,
      contentType: 'text/plain',
      body: { ignored: true },
    });
    const result = await fetchJsonSafe('https://issuer.example.com/x', {
      acceptContentTypes: ['application/json'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('fetch_status_5xx');
      expect(result.code).not.toBe('fetch_invalid_content_type');
      expect(result.status).toBe(500);
    }
  });

  it('200 text/html with acceptContentTypes:[application/json] STILL surfaces fetch_invalid_content_type (control case)', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'text/html',
      body: { x: 1 },
    });
    const result = await fetchJsonSafe('https://issuer.example.com/x', {
      acceptContentTypes: ['application/json'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('fetch_invalid_content_type');
    }
  });

  it('200 application/json with matching acceptContentTypes succeeds (control case)', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { x: 1 },
    });
    const result = await fetchJsonSafe<{ x: number }>('https://issuer.example.com/x', {
      acceptContentTypes: ['application/json'],
    });
    expect(result.ok).toBe(true);
  });
});

describe('fetch-safe status precedence over content-type (JWKS path)', () => {
  it('401 text/html on JWKS path surfaces fetch_status_4xx, not fetch_invalid_content_type', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 401,
      contentType: 'text/html',
      body: { keys: [] },
    });
    const result = await fetchJwksSafe('https://issuer.example.com/jwks', {
      acceptContentTypes: ['application/json'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('fetch_status_4xx');
      expect(result.code).not.toBe('fetch_invalid_content_type');
    }
  });

  it('500 text/plain on JWKS path surfaces fetch_status_5xx, not fetch_invalid_content_type', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 503,
      contentType: 'text/plain',
      body: { keys: [] },
    });
    const result = await fetchJwksSafe('https://issuer.example.com/jwks', {
      acceptContentTypes: ['application/json'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('fetch_status_5xx');
    }
  });
});

describe('fetch-safe status precedence over content-type (raw path)', () => {
  it('401 text/html on raw path surfaces fetch_status_4xx, not fetch_invalid_content_type', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 404,
      contentType: 'text/html',
      body: 'not found',
    });
    const result = await fetchRawSafe('https://issuer.example.com/r', {
      acceptContentTypes: ['application/jose'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('fetch_status_4xx');
      expect(result.code).not.toBe('fetch_invalid_content_type');
    }
  });

  it('500 text/plain on raw path surfaces fetch_status_5xx', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 502,
      contentType: 'text/plain',
      body: 'bad gateway',
    });
    const result = await fetchRawSafe('https://issuer.example.com/r', {
      acceptContentTypes: ['application/jose'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('fetch_status_5xx');
    }
  });
});
