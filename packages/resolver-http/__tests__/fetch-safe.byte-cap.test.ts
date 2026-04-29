// Byte caps: asserts verifier maxResponseBytes (256 KiB general; 64 KiB JWKS)
// is passed to net-node, NOT net-node's broader defaults (2 MiB / 512 KiB).
// Also asserts E_NET_RESPONSE_TOO_LARGE collapses to fetch_blocked_byte_cap.

import { vi, describe, it, expect, beforeEach } from 'vitest';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
  enqueue,
  resetMock,
  getLastOptions,
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

import { VERIFIER_LIMITS } from '@peac/kernel';

import { fetchJsonSafe, fetchJwksSafe, fetchRawSafe } from '../src/fetch-safe.js';

beforeEach(() => {
  resetMock();
});

describe('fetch-safe byte cap: verifier override fires, not net-node default', () => {
  it('JSON path passes VERIFIER_LIMITS.maxResponseBytes (256 KiB) to net-node', async () => {
    enqueue('safeFetchJson', { ok: true, status: 200, body: {} });
    await fetchJsonSafe('https://issuer.example.com/x');
    const opts = getLastOptions() as { maxResponseBytes?: number } | undefined;
    expect(opts?.maxResponseBytes).toBe(VERIFIER_LIMITS.maxResponseBytes);
    expect(opts?.maxResponseBytes).toBe(262144);
    // Net-node default (2 MiB) MUST NOT be what fires
    expect(opts?.maxResponseBytes).not.toBe(2 * 1024 * 1024);
  });

  it('JWKS path passes VERIFIER_LIMITS.maxJwksBytes (64 KiB) to net-node', async () => {
    enqueue('safeFetchJWKS', { ok: true, status: 200, body: { keys: [] } });
    await fetchJwksSafe('https://issuer.example.com/jwks');
    const opts = getLastOptions() as { maxResponseBytes?: number } | undefined;
    expect(opts?.maxResponseBytes).toBe(VERIFIER_LIMITS.maxJwksBytes);
    expect(opts?.maxResponseBytes).toBe(65536);
    // Net-node JWKS cap (512 KiB) MUST NOT be what fires
    expect(opts?.maxResponseBytes).not.toBe(512 * 1024);
  });

  it('raw path passes VERIFIER_LIMITS.maxResponseBytes (256 KiB)', async () => {
    enqueue('safeFetchRaw', { ok: true, status: 200, body: 'x' });
    await fetchRawSafe('https://issuer.example.com/r');
    const opts = getLastOptions() as { maxResponseBytes?: number } | undefined;
    expect(opts?.maxResponseBytes).toBe(262144);
  });

  it('caller override below verifier default is honored', async () => {
    enqueue('safeFetchJson', { ok: true, status: 200, body: {} });
    await fetchJsonSafe('https://issuer.example.com/x', { maxResponseBytes: 1024 });
    const opts = getLastOptions() as { maxResponseBytes?: number } | undefined;
    expect(opts?.maxResponseBytes).toBe(1024);
  });

  it('E_NET_RESPONSE_TOO_LARGE maps to fetch_blocked_byte_cap', async () => {
    enqueue('safeFetchJson', { ok: false, code: NET_CODES.E_RESPONSE_TOO_LARGE });
    const result = await fetchJsonSafe('https://issuer.example.com/x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_byte_cap');
  });

  it('raw path enforces byte cap on the post-fetch buffer too', async () => {
    // Construct an oversized body and pass a tight cap. Tests the
    // post-fetch verification in fetchRawSafe (defense-in-depth above
    // net-node's own cap, in case net-node ever reports ok with body
    // larger than requested).
    const big = new Uint8Array(2048);
    big.fill(0x41);
    enqueue('safeFetchRaw', { ok: true, status: 200, body: '', bytes: big });
    const result = await fetchRawSafe('https://issuer.example.com/r', { maxResponseBytes: 512 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_byte_cap');
  });
});
