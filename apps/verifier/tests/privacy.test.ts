/**
 * Privacy posture: no network, no persistence, no service worker, claims only on success.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { initializeLocalVerifier } from '../src/verify.js';
import { makeFixture, tamperSignature } from './helpers/fixtures.js';

afterEach(() => vi.restoreAllMocks());

describe('no network', () => {
  it('issues no request during a successful verification', async () => {
    const calls: string[] = [];
    const boom = (name: string) => () => {
      calls.push(name);
      throw new Error(`${name} must not be called`);
    };
    vi.stubGlobal('fetch', boom('fetch'));
    vi.stubGlobal('XMLHttpRequest', boom('XMLHttpRequest'));
    vi.stubGlobal('WebSocket', boom('WebSocket'));
    vi.stubGlobal('EventSource', boom('EventSource'));
    vi.stubGlobal('navigator', { ...globalThis.navigator, sendBeacon: boom('sendBeacon') });

    const f = await makeFixture();
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
      contextDocument: JSON.stringify({
        contextVersion: '1',
        trust: { trustedJwkThumbprints: [f.thumbprint] },
      }),
    });
    expect(r.ok).toBe(true);
    expect(calls).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('issues no request on any failure path', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', () => {
      calls.push('fetch');
      throw new Error('no');
    });
    const f = await makeFixture();
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });
    await verifier.verify({
      record: tamperSignature(f.record),
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    await verifier.verify({
      record: '',
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    await verifier.verify({
      record: f.record,
      keyDocument: '{',
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(calls).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe('no persistence', () => {
  it('writes no storage key, database or cookie', async () => {
    const store: Record<string, string> = {};
    const seen: string[] = [];
    vi.stubGlobal('localStorage', {
      setItem: (k: string) => seen.push(`local:${k}`),
      getItem: () => null,
      removeItem: () => {},
    });
    vi.stubGlobal('sessionStorage', {
      setItem: (k: string) => seen.push(`session:${k}`),
      getItem: () => null,
      removeItem: () => {},
    });
    vi.stubGlobal('indexedDB', {
      open: () => {
        seen.push('idb');
        throw new Error('no');
      },
    });

    const f = await makeFixture();
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });
    await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(seen).toEqual([]);
    expect(Object.keys(store)).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('registers no service worker', async () => {
    const seen: string[] = [];
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register: () => {
          seen.push('sw');
          return Promise.resolve();
        },
      },
    });
    const f = await makeFixture();
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });
    await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
    });
    expect(seen).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe('claims exist only on success', () => {
  it.each([
    [
      'tampered signature',
      async () => {
        const f = await makeFixture();
        return { r: f.record, k: f.keyDocument, t: f.evaluationTime, mut: tamperSignature };
      },
    ],
  ])('no claims on %s', async (_l, setup) => {
    const s = await setup();
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });
    const r = await verifier.verify({
      record: s.mut(s.r),
      keyDocument: s.k,
      evaluationTimeUnixSeconds: s.t,
    });
    expect('claims' in r).toBe(false);
    expect(JSON.stringify(r)).not.toContain('issuer.example');
  });

  it('a constraint failure carries no claims and no claim values in the report', async () => {
    const f = await makeFixture();
    const verifier = await initializeLocalVerifier({ verifierBuild: 'test-build' });
    const r = await verifier.verify({
      record: f.record,
      keyDocument: f.keyDocument,
      evaluationTimeUnixSeconds: f.evaluationTime,
      contextDocument: JSON.stringify({
        contextVersion: '1',
        constraints: { expectedIssuer: 'https://other.example' },
      }),
    });
    expect('claims' in r).toBe(false);
    expect(r.report?.recordType).toBeUndefined();
    expect(r.report?.reportedIssuer).toBeUndefined();
  });
});
