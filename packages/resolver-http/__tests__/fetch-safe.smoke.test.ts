// Smoke test for fetch-safe composition.
// Round-trip JSON success path; happy-path bytes/contentType assertions.

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

describe('fetch-safe smoke: happy path', () => {
  it('fetchJsonSafe returns parsed body, byte count, content-type on 200', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: { hello: 'world' },
      responseBytes: 42,
    });
    const result = await fetchJsonSafe<{ hello: string }>(
      'https://issuer.example.com/.well-known/x'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toEqual({ hello: 'world' });
      expect(result.bytes).toBe(42);
      expect(result.contentType).toBe('application/json; charset=utf-8');
    }
  });

  it('fetchJwksSafe returns parsed JWKS body', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { keys: [{ kty: 'OKP', crv: 'Ed25519', kid: 'k1', x: 'abc' }] },
      responseBytes: 90,
    });
    const result = await fetchJwksSafe('https://issuer.example.com/jwks');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toEqual({
        keys: [{ kty: 'OKP', crv: 'Ed25519', kid: 'k1', x: 'abc' }],
      });
      expect(result.bytes).toBe(90);
    }
  });

  it('fetchRawSafe returns raw bytes', async () => {
    const wireBytes = new TextEncoder().encode('hello.world.signature');
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      bytes: wireBytes,
    });
    const result = await fetchRawSafe('https://issuer.example.com/receipt');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(result.body)).toBe('hello.world.signature');
      expect(result.bytes).toBe(wireBytes.byteLength);
      expect(result.contentType).toBe('application/jose');
    }
  });
});
