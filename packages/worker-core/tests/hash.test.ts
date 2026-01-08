/**
 * @peac/worker-core - SHA-256 replay key hashing tests
 */

import { describe, it, expect } from 'vitest';
import { hashReplayKey } from '../src/hash.js';
import type { ReplayContext } from '../src/types.js';

describe('hashReplayKey', () => {
  it('should return a hex string', async () => {
    const ctx: ReplayContext = {
      issuer: 'https://issuer.example.com',
      keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
      nonce: 'abc123',
      ttlSeconds: 480,
    };

    const hash = await hashReplayKey(ctx);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce consistent hashes for same input', async () => {
    const ctx: ReplayContext = {
      issuer: 'https://issuer.example.com',
      keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
      nonce: 'abc123',
      ttlSeconds: 480,
    };

    const hash1 = await hashReplayKey(ctx);
    const hash2 = await hashReplayKey(ctx);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different nonces', async () => {
    const ctx1: ReplayContext = {
      issuer: 'https://issuer.example.com',
      keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
      nonce: 'abc123',
      ttlSeconds: 480,
    };

    const ctx2: ReplayContext = {
      ...ctx1,
      nonce: 'xyz789',
    };

    const hash1 = await hashReplayKey(ctx1);
    const hash2 = await hashReplayKey(ctx2);

    expect(hash1).not.toBe(hash2);
  });

  it('should produce different hashes for different issuers', async () => {
    const ctx1: ReplayContext = {
      issuer: 'https://issuer1.example.com',
      keyid: 'https://issuer1.example.com/.well-known/jwks.json#key-1',
      nonce: 'abc123',
      ttlSeconds: 480,
    };

    const ctx2: ReplayContext = {
      issuer: 'https://issuer2.example.com',
      keyid: 'https://issuer2.example.com/.well-known/jwks.json#key-1',
      nonce: 'abc123',
      ttlSeconds: 480,
    };

    const hash1 = await hashReplayKey(ctx1);
    const hash2 = await hashReplayKey(ctx2);

    expect(hash1).not.toBe(hash2);
  });

  it('should produce different hashes for different keyids', async () => {
    const ctx1: ReplayContext = {
      issuer: 'https://issuer.example.com',
      keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
      nonce: 'abc123',
      ttlSeconds: 480,
    };

    const ctx2: ReplayContext = {
      ...ctx1,
      keyid: 'https://issuer.example.com/.well-known/jwks.json#key-2',
    };

    const hash1 = await hashReplayKey(ctx1);
    const hash2 = await hashReplayKey(ctx2);

    expect(hash1).not.toBe(hash2);
  });

  it('should not include ttlSeconds in hash (ttl is metadata)', async () => {
    const ctx1: ReplayContext = {
      issuer: 'https://issuer.example.com',
      keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
      nonce: 'abc123',
      ttlSeconds: 480,
    };

    const ctx2: ReplayContext = {
      ...ctx1,
      ttlSeconds: 600,
    };

    const hash1 = await hashReplayKey(ctx1);
    const hash2 = await hashReplayKey(ctx2);

    // Same issuer/keyid/nonce should produce same hash regardless of TTL
    expect(hash1).toBe(hash2);
  });
});
