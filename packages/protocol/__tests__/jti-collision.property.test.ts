/**
 * Property-based tests for jti uniqueness and replay detection (DD-158)
 *
 * Verifies:
 * 1. issueWire02() generates unique jti values across many issuances
 * 2. Duplicate jti detection: replay cache correctly identifies re-seen values
 * 3. Sliding-window replay cache eviction semantics
 *
 * Tests the internal PEAC JTI path via issueWire02() (DD-158 review).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issueWire02, verifyLocal } from '../src/index';

// ---------------------------------------------------------------------------
// Shared keypair
// ---------------------------------------------------------------------------

let testKeypair: { privateKey: Uint8Array; publicKey: Uint8Array };

const testKid = '2026-03-07T00:00:00Z';
const testIss = 'https://api.example.com';
const testType = 'org.peacprotocol/commerce';

beforeAll(async () => {
  testKeypair = await generateKeypair();
});

// ---------------------------------------------------------------------------
// Helper: extract jti from issued receipt
// ---------------------------------------------------------------------------

async function extractJti(jws: string): Promise<string> {
  const result = await verifyLocal(jws, testKeypair.publicKey);
  if (!result.valid) throw new Error(`Unexpected verify failure: ${result.code}`);
  return result.claims.jti;
}

// ---------------------------------------------------------------------------
// Property 1: Sampled uniqueness smoke test via issueWire02
// ---------------------------------------------------------------------------

describe('Property: jti sampled uniqueness via issueWire02', () => {
  it('1,000 issuances produce 1,000 unique jti values', async () => {
    const count = 1_000;
    const jtis = new Set<string>();

    for (let i = 0; i < count; i++) {
      const { jws } = await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type: testType,
        privateKey: testKeypair.privateKey,
        kid: testKid,
      });
      const jti = await extractJti(jws);
      jtis.add(jti);
    }

    expect(jtis.size).toBe(count);
  });

  it('jti values match UUIDv7 format', async () => {
    const count = 50;
    // UUIDv7: 8-4-4-4-12 hex with version nibble '7' at position 15
    const uuidv7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    for (let i = 0; i < count; i++) {
      const { jws } = await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type: testType,
        privateKey: testKeypair.privateKey,
        kid: testKid,
      });
      const jti = await extractJti(jws);
      expect(jti).toMatch(uuidv7Pattern);
    }
  });
});

// ---------------------------------------------------------------------------
// Property 2: Duplicate detection via Set
// ---------------------------------------------------------------------------

describe('Property: duplicate jti detection', () => {
  it('re-inserting issued jti values is always detected', async () => {
    const count = 100;
    const jtis: string[] = [];

    for (let i = 0; i < count; i++) {
      const { jws } = await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type: testType,
        privateKey: testKeypair.privateKey,
        kid: testKid,
      });
      jtis.push(await extractJti(jws));
    }

    const seen = new Set(jtis);
    expect(seen.size).toBe(count);

    // Re-insert each one: always detected as duplicate
    for (const id of jtis) {
      const sizeBefore = seen.size;
      seen.add(id);
      expect(seen.size).toBe(sizeBefore);
    }
  });
});

// ---------------------------------------------------------------------------
// Property 3: Sliding-window replay cache
// ---------------------------------------------------------------------------

describe('Property: sliding-window replay cache semantics', () => {
  it('window correctly tracks recent JTIs and evicts old ones', async () => {
    const windowSize = 200;
    const cache = new Set<string>();
    const queue: string[] = [];

    // Fill the window with issued JTIs
    for (let i = 0; i < windowSize; i++) {
      const { jws } = await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type: testType,
        privateKey: testKeypair.privateKey,
        kid: testKid,
      });
      const jti = await extractJti(jws);
      cache.add(jti);
      queue.push(jti);
    }

    expect(cache.size).toBe(windowSize);

    // The first ID should be in the cache (replay detected)
    expect(cache.has(queue[0])).toBe(true);

    // Add new IDs, evicting old ones from the window
    const evictCount = 80;
    const evicted: string[] = [];

    for (let i = 0; i < evictCount; i++) {
      const { jws } = await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type: testType,
        privateKey: testKeypair.privateKey,
        kid: testKid,
      });
      const newJti = await extractJti(jws);

      // New ID must not be in cache (no collision)
      expect(cache.has(newJti)).toBe(false);
      cache.add(newJti);
      queue.push(newJti);

      // Evict oldest
      const old = queue.shift()!;
      cache.delete(old);
      evicted.push(old);
    }

    // Cache size maintained
    expect(cache.size).toBe(windowSize);

    // Evicted IDs are no longer detected as replays
    for (const id of evicted) {
      expect(cache.has(id)).toBe(false);
    }

    // Recent IDs (still in window) are detected as replays
    for (const id of queue.slice(-10)) {
      expect(cache.has(id)).toBe(true);
    }
  });
});
