import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';

import { createReplayGuard, issueWire02, verifyLocal } from '../src/index.js';

const rec = (iss: string, jti: string, iat: number) => ({ iss, jti, iat });

describe('createReplayGuard', () => {
  it('fresh on first sight, replayed on the second (same key)', () => {
    const g = createReplayGuard({ windowSeconds: 3600, now: () => 1000 });
    expect(g.check(rec('https://a', 'j1', 1000))).toBe('fresh');
    expect(g.check(rec('https://a', 'j1', 1000))).toBe('replayed');
  });

  it('outside-window for iat too old, and the record is not stored', () => {
    const t = 1000;
    const g = createReplayGuard({
      windowSeconds: 100,
      maxClockSkewSeconds: 0,
      maxEntries: 1,
      now: () => t,
    });
    expect(g.check(rec('https://a', 'old', 800))).toBe('outside-window');
    expect(g.check(rec('https://a', 'j1', 1000))).toBe('fresh'); // slot not consumed
    expect(g.check(rec('https://a', 'j1', 1000))).toBe('replayed');
  });

  it('outside-window for iat too far in the future (> now + maxClockSkewSeconds)', () => {
    const g = createReplayGuard({ windowSeconds: 100, maxClockSkewSeconds: 30, now: () => 1000 });
    expect(g.check(rec('https://a', 'j1', 1031))).toBe('outside-window');
  });

  it('boundary now - windowSeconds is accepted (inclusive)', () => {
    const g = createReplayGuard({ windowSeconds: 100, maxClockSkewSeconds: 0, now: () => 1000 });
    expect(g.check(rec('https://a', 'j1', 900))).toBe('fresh');
  });

  it('boundary now + maxClockSkewSeconds is accepted (inclusive)', () => {
    const g = createReplayGuard({ windowSeconds: 100, maxClockSkewSeconds: 30, now: () => 1000 });
    expect(g.check(rec('https://a', 'j1', 1030))).toBe('fresh');
  });

  it('length-prefixed keys: (a, bc) and (ab, c) do not collide', () => {
    const g = createReplayGuard({ windowSeconds: 3600, now: () => 1000 });
    expect(g.check(rec('a', 'bc', 1000))).toBe('fresh');
    expect(g.check(rec('ab', 'c', 1000))).toBe('fresh');
  });

  it('TTL purge removes expired entries; a later fresh insert does not retain them', () => {
    let t = 1000;
    const g = createReplayGuard({
      windowSeconds: 100,
      maxClockSkewSeconds: 0,
      maxEntries: 10,
      now: () => t,
    });
    expect(g.check(rec('i', 'j1', 1000))).toBe('fresh'); // expiresAt = 1000 + 100 + 0 = 1100
    t = 1201; // past expiry
    expect(g.check(rec('i', 'j2', 1201))).toBe('fresh'); // triggers purge of j1
    expect(g.check(rec('i', 'j1', 1201))).toBe('fresh'); // j1 was purged -> fresh again
  });

  it('expired same-key followed by a fresh in-window record returns fresh', () => {
    let t = 1000;
    const g = createReplayGuard({ windowSeconds: 100, maxClockSkewSeconds: 0, now: () => t });
    g.check(rec('i', 'j1', 1000));
    t = 5000;
    expect(g.check(rec('i', 'j1', 5000))).toBe('fresh'); // old entry purged; new one in-window
  });

  it('evicts the oldest retained entry past maxEntries', () => {
    const g = createReplayGuard({ windowSeconds: 10_000, maxEntries: 2, now: () => 5000 });
    expect(g.check(rec('i', 'j1', 5000))).toBe('fresh');
    expect(g.check(rec('i', 'j2', 5000))).toBe('fresh');
    expect(g.check(rec('i', 'j3', 5000))).toBe('fresh'); // evicts j1
    expect(g.check(rec('i', 'j1', 5000))).toBe('fresh'); // j1 was evicted -> fresh again
    expect(g.check(rec('i', 'j3', 5000))).toBe('replayed'); // j3 still present
  });

  it('a replay does not refresh recency or TTL', () => {
    const g = createReplayGuard({ windowSeconds: 10_000, maxEntries: 2, now: () => 5000 });
    g.check(rec('i', 'j1', 5000));
    g.check(rec('i', 'j2', 5000));
    g.check(rec('i', 'j1', 5000)); // replay j1 -> must not move it to newest
    g.check(rec('i', 'j3', 5000)); // evicts oldest (j1)
    expect(g.check(rec('i', 'j1', 5000))).toBe('fresh'); // j1 evicted, not refreshed
  });

  it('out-of-window record with the same key does not poison future in-window checks', () => {
    const t = 1000;
    const g = createReplayGuard({ windowSeconds: 100, maxClockSkewSeconds: 0, now: () => t });
    expect(g.check(rec('i', 'j1', 800))).toBe('outside-window'); // not stored
    expect(g.check(rec('i', 'j1', 1000))).toBe('fresh'); // now in-window -> fresh
  });

  it('injected clock drives window + TTL deterministically', () => {
    let t = 1000;
    const g = createReplayGuard({ windowSeconds: 100, maxClockSkewSeconds: 0, now: () => t });
    expect(g.check(rec('i', 'j1', 1000))).toBe('fresh');
    t = 2000;
    expect(g.check(rec('i', 'j1', 1000))).toBe('outside-window'); // iat now too old
  });

  it('rejects invalid options at construction', () => {
    expect(() => createReplayGuard({ windowSeconds: 0 })).toThrow();
    expect(() => createReplayGuard({ windowSeconds: -1 })).toThrow();
    expect(() => createReplayGuard({ windowSeconds: 1.5 })).toThrow();
    expect(() => createReplayGuard({ windowSeconds: 10, maxEntries: 0 })).toThrow();
    expect(() => createReplayGuard({ windowSeconds: 10, maxClockSkewSeconds: -1 })).toThrow();
    // unsafe integers (beyond Number.MAX_SAFE_INTEGER) are rejected
    expect(() => createReplayGuard({ windowSeconds: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
    expect(() =>
      createReplayGuard({ windowSeconds: 10, maxEntries: Number.MAX_SAFE_INTEGER + 1 })
    ).toThrow();
    expect(() =>
      createReplayGuard({ windowSeconds: 10, maxClockSkewSeconds: Number.MAX_SAFE_INTEGER + 1 })
    ).toThrow();
  });

  it('fails closed on invalid runtime input and does not mutate state', () => {
    const g = createReplayGuard({ windowSeconds: 100, maxEntries: 1, now: () => 1000 });
    expect(() => g.check(rec('i', '', 1000))).toThrow(); // empty jti
    expect(() => g.check(rec('', 'j1', 1000))).toThrow(); // empty iss
    expect(() => g.check(rec('i', 'j1', Number.NaN))).toThrow(); // NaN iat
    expect(() => g.check(rec('i', 'j1', Infinity))).toThrow(); // Infinity iat
    expect(() => g.check(rec('i', 'j1', 1.5))).toThrow(); // fractional iat
    expect(() => g.check(rec('i', 'j1', Number.MAX_SAFE_INTEGER + 1))).toThrow(); // unsafe iat
    // store was not mutated by any failed call (the single slot is still free):
    expect(g.check(rec('i', 'ok', 1000))).toBe('fresh');
    expect(g.check(rec('i', 'ok', 1000))).toBe('replayed');
  });

  it('fails closed when now() returns a non-finite value', () => {
    const g = createReplayGuard({ windowSeconds: 100, now: () => Number.NaN });
    expect(() => g.check(rec('i', 'j1', 1000))).toThrow();
  });

  it('fails closed when now() returns an unsafe integer', () => {
    const g = createReplayGuard({ windowSeconds: 100, now: () => Number.MAX_SAFE_INTEGER + 1 });
    expect(() => g.check(rec('i', 'j1', 1000))).toThrow();
  });

  it('fails closed if expiry arithmetic exceeds the safe integer range, without storing the record', () => {
    const t = Number.MAX_SAFE_INTEGER - 10;
    const g = createReplayGuard({ windowSeconds: 100, maxClockSkewSeconds: 0, now: () => t });
    // expiresAt = t + 100 exceeds MAX_SAFE_INTEGER -> throws before any store mutation.
    expect(() => g.check(rec('i', 'j1', t))).toThrow();
    // If j1 had been stored, a repeat check would short-circuit as 'replayed' before the
    // expiry step; instead it throws again, proving the record was not stored.
    expect(() => g.check(rec('i', 'j1', t))).toThrow();
  });

  it('clamps a backward clock to the last observed second', () => {
    let t = 1000;
    const g = createReplayGuard({ windowSeconds: 100, maxClockSkewSeconds: 0, now: () => t });
    expect(g.check(rec('i', 'j1', 1000))).toBe('fresh');
    t = 200; // wall clock jumps backward; guard clamps to 1000
    // iat=1000 is still in-window relative to the clamped now (1000), and j1 is a replay:
    expect(g.check(rec('i', 'j1', 1000))).toBe('replayed');
    // a record at the regressed raw time is judged against the clamped now, so it is too old:
    expect(g.check(rec('i', 'j2', 200))).toBe('outside-window');
  });

  it('conservative TTL: an older-iat entry is retained until the conservative horizon, but window-first still rejects it', () => {
    let t = 1000;
    const g = createReplayGuard({ windowSeconds: 100, maxClockSkewSeconds: 50, now: () => t });
    // insert at t=1000 with an older in-window iat=960 -> expiresAt = 1000 + 100 + 50 = 1150
    expect(g.check(rec('i', 'j1', 960))).toBe('fresh');
    t = 1120; // past iat+window (1060) but before conservative expiry (1150): entry still retained
    // window-first: a replay of j1 (iat 960) is now outside-window (960 < 1120 - 100), so it is
    // rejected as outside-window regardless of still being retained:
    expect(g.check(rec('i', 'j1', 960))).toBe('outside-window');
  });
});

describe('createReplayGuard composition with verifyLocal', () => {
  it('classifies a verified record as fresh, then replayed', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      // Generic reverse-DNS type with no mapped extension group, so default-strict
      // verifyLocal accepts it without an extension block.
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.example/replay-guard-smoke',
      privateKey,
      kid: '2026-03-07T00:00:00Z',
      jti: 'replay-guard-smoke-1',
    });

    const result = await verifyLocal(jws, publicKey);
    expect(result.valid).toBe(true);
    if (!result.valid) return;

    const { iss, jti, iat } = result.claims;
    // Generous window so the freshly-issued record (real iat) is in-window under the real clock.
    const g = createReplayGuard({ windowSeconds: 86_400, maxClockSkewSeconds: 300 });
    expect(g.check({ iss, jti, iat })).toBe('fresh');
    expect(g.check({ iss, jti, iat })).toBe('replayed');
  });
});
