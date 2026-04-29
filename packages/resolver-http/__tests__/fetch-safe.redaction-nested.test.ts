// Adversarial redaction: a malicious upstream Error embeds secrets across
// multiple nested fields (cause, cause.cause, stack, custom payload). The
// resolver-http surfaced failure result MUST NOT carry any of those
// substrings in any field, including the cause chain.

import { vi, describe, it, expect, beforeEach } from 'vitest';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
  enqueue,
  resetMock,
  NET_CODES,
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

const SECRETS = [
  'Bearer abc123',
  'Cookie: session=secret-xyz',
  'Authorization: Basic dXNlcjpwYXNz',
  '-----BEGIN PRIVATE KEY-----MIIBVQIBAD',
  '"d":"private-jwk-d-field-secret-base64"',
  'malicious@example.com',
];

function flattenStrings(value: unknown, depth = 0, acc: string[] = []): string[] {
  if (depth > 6) return acc;
  if (typeof value === 'string') {
    acc.push(value);
    return acc;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      flattenStrings(v, depth + 1, acc);
    }
  }
  return acc;
}

describe('fetch-safe redaction (cause-chain traversal)', () => {
  it('synthetic upstream error with secrets in message + cause + cause.cause + stack + custom payload', async () => {
    const innerInner = new Error('Authorization: Basic dXNlcjpwYXNz from inner-inner');
    const inner: Error & { cause?: unknown } = new Error('Cookie: session=secret-xyz from inner');
    inner.cause = innerInner;
    const oneKB = 'A'.repeat(1024);

    enqueue('safeFetchJson', {
      ok: false,
      code: NET_CODES.E_NETWORK_ERROR,
      error: 'Bearer abc123 leaked from upstream',
      cause: inner,
      stack:
        'Error: outer\n    at Object.<anonymous>:1:1\n    at next ' +
        'Authorization: Basic dXNlcjpwYXNz line\n' +
        '-----BEGIN PRIVATE KEY-----MIIBVQIBAD wrapped\n',
      upstreamPayload: { body: oneKB, jwk: '"d":"private-jwk-d-field-secret-base64"' },
    });

    const result = await fetchJsonSafe('https://issuer.example.com/x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const allStrings = flattenStrings(result);
      // No secret may appear in ANY string field of the result, including
      // any nested cause chain that might have been preserved by mistake.
      for (const secret of SECRETS) {
        for (const s of allStrings) {
          expect(s).not.toContain(secret);
        }
      }
      // The 1 KiB payload body MUST NOT bleed in either
      for (const s of allStrings) {
        expect(s.includes(oneKB)).toBe(false);
      }
      // Sanity: result is a clean discriminated-union failure
      expect(result.code).toBe('fetch_network_error');
      expect(result.message).toBe('fetch_network_error at https://issuer.example.com');
    }
  });

  it('resolver-http does not leak upstream cause field even if asked to expose it', async () => {
    // Construct upstream with a deeply nested cause chain
    let chain: { message: string; cause?: unknown } = {
      message: 'Bearer leaf-secret-token',
    };
    for (let i = 0; i < 5; i++) {
      chain = { message: `wrapper-${i}`, cause: chain };
    }
    enqueue('safeFetchJson', {
      ok: false,
      code: NET_CODES.E_NETWORK_ERROR,
      error: 'top-level error',
      cause: chain,
    });

    const result = await fetchJsonSafe('https://issuer.example.com/x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Result must not carry cause / stack / upstreamPayload fields
      const keys = Object.keys(result).sort();
      // Allowed keys only: ok, code, message, status?
      for (const k of keys) {
        expect(['ok', 'code', 'message', 'status']).toContain(k);
      }
      // Safety belt: a flatten of all strings must not contain the leaf secret
      const allStrings = flattenStrings(result);
      for (const s of allStrings) {
        expect(s).not.toContain('leaf-secret-token');
      }
    }
  });
});
