/**
 * @peac/pref facade tests (v0.12.14+).
 *
 * Asserts:
 *   - Facade produces the same resolved decision as @peac/mappings-content-signals
 *     canonical path for the supported input matrix.
 *   - Digest is a full-length SHA-256 (64 hex), not the pre-v0.12.14 12-hex truncation.
 *   - `PrefResolver` emits a single `PEAC_DEPRECATED_PREF` `DeprecationWarning`
 *     per process.
 *   - The package performs no in-process network I/O; `fetchRobots` rejects
 *     with `PEAC_DEPRECATED_PREF_NETWORK`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseContentUsage,
  parseRobotsTxt,
  parseTdmrep,
  resolveSignals,
  getDecisionForPurpose,
} from '@peac/mappings-content-signals';
import { PrefResolver, fetchRobots, robotsToAIPref } from '../src/index.js';
import { __resetDeprecationWarningForTests } from '../src/resolver.js';

describe('PrefResolver: Content-Usage header parity with @peac/mappings-content-signals', () => {
  beforeEach(() => __resetDeprecationWarningForTests());

  it('maps train-ai=n + search=y to legacy AIPrefSnapshot (allow-search, deny-train)', async () => {
    const headerValue = 'train-ai=n, search=y';

    // Canonical path
    const entries = parseContentUsage(headerValue).entries;
    const resolved = resolveSignals(entries);
    expect(getDecisionForPurpose(resolved, 'ai-training')).toBe('deny');
    expect(getDecisionForPurpose(resolved, 'ai-search')).toBe('allow');

    // Facade path
    const resolver = new PrefResolver();
    const policy = await resolver.resolve({
      uri: 'https://example.com/',
      headers: { 'content-usage': headerValue },
    });
    expect(policy.status).toBe('active');
    expect(policy.source).toBe('header');
    expect(policy.snapshot?.['train-ai']).toBe(false);
    expect(policy.snapshot?.crawl).toBe(true);
  });

  it('returns not_found + defaults when no content signals are supplied', async () => {
    const resolver = new PrefResolver();
    const policy = await resolver.resolve({ uri: 'https://example.com/' });
    expect(policy.status).toBe('not_found');
    expect(policy.source).toBe('default');
    expect(policy.snapshot?.crawl).toBe(true);
    expect(policy.snapshot?.['train-ai']).toBe(true);
  });

  it('accepts pre-fetched robotsTxt bytes', async () => {
    const robotsTxt = ['User-agent: GPTBot', 'Disallow: /', '', 'User-agent: *', 'Allow: /'].join(
      '\n'
    );

    const canonicalResolved = resolveSignals(parseRobotsTxt(robotsTxt));
    // Canonical path says ai-training denied for GPTBot-targeted rule.
    expect(getDecisionForPurpose(canonicalResolved, 'ai-training')).toBe('deny');

    const resolver = new PrefResolver();
    const policy = await resolver.resolve({ uri: 'https://example.com/', robotsTxt });
    expect(policy.status).toBe('active');
    expect(policy.source).toBe('robots');
    expect(policy.snapshot?.['train-ai']).toBe(false);
  });

  it('accepts pre-fetched tdmrep JSON', async () => {
    const tdmrep = JSON.stringify({
      location: 'https://example.com/',
      'tdm-reservation': 1,
    });
    const resolver = new PrefResolver();
    const policy = await resolver.resolve({ uri: 'https://example.com/', tdmrep });
    expect(policy.status).toBe('active');
    expect(policy.source).toBe('tdmrep');
    expect(policy.snapshot?.crawl).toBe(false);
    expect(policy.snapshot?.['train-ai']).toBe(false);
  });

  it('maps tdmrep reservation 0 to allow', async () => {
    const tdmrep = JSON.stringify({
      location: 'https://example.com/',
      'tdm-reservation': 0,
    });
    const resolver = new PrefResolver();
    const policy = await resolver.resolve({ uri: 'https://example.com/', tdmrep });
    expect(policy.source).toBe('tdmrep');
    expect(policy.snapshot?.crawl).toBe(true);
    expect(policy.snapshot?.['train-ai']).toBe(true);
  });
});

describe('PrefResolver: digest discipline', () => {
  beforeEach(() => __resetDeprecationWarningForTests());

  it('produces a full 64-character hex digest (RFC 8785 JCS + SHA-256)', async () => {
    const resolver = new PrefResolver();
    const policy = await resolver.resolve({
      uri: 'https://example.com/',
      headers: { 'content-usage': 'train-ai=n' },
    });
    expect(policy.digest).toBeDefined();
    expect(policy.digest?.alg).toBe('JCS-SHA256');
    expect(policy.digest?.val).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic: same snapshot produces identical digest', async () => {
    const resolver = new PrefResolver();
    const p1 = await resolver.resolve({
      uri: 'https://example.com/a',
      headers: { 'content-usage': 'train-ai=n, search=y' },
    });
    const p2 = await resolver.resolve({
      uri: 'https://example.com/b',
      headers: { 'content-usage': 'train-ai=n, search=y' },
    });
    expect(p1.digest?.val).toBe(p2.digest?.val);
  });

  it('differs when snapshot bytes differ', async () => {
    const resolver = new PrefResolver();
    const denyTrain = await resolver.resolve({
      uri: 'https://example.com/',
      headers: { 'content-usage': 'train-ai=n' },
    });
    const allowTrain = await resolver.resolve({
      uri: 'https://example.com/',
      headers: { 'content-usage': 'train-ai=y' },
    });
    expect(denyTrain.digest?.val).not.toBe(allowTrain.digest?.val);
  });
});

describe('PrefResolver: deprecation warning', () => {
  let emitWarningSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetDeprecationWarningForTests();
    emitWarningSpy = vi.spyOn(process, 'emitWarning').mockImplementation(() => {
      /* suppress */
    });
  });

  afterEach(() => emitWarningSpy.mockRestore());

  it('fires PEAC_DEPRECATED_PREF exactly once per process on instantiation', () => {
    void new PrefResolver();
    void new PrefResolver();
    void new PrefResolver();
    expect(emitWarningSpy).toHaveBeenCalledTimes(1);
    const [message, options] = emitWarningSpy.mock.calls[0];
    expect(String(message)).toMatch(/@peac\/pref is deprecated/);
    expect(options).toMatchObject({
      code: 'PEAC_DEPRECATED_PREF',
      type: 'DeprecationWarning',
    });
  });
});

describe('@peac/pref: no network I/O', () => {
  it('fetchRobots rejects with PEAC_DEPRECATED_PREF_NETWORK (no socket opened)', async () => {
    await expect(fetchRobots('https://example.com/')).rejects.toMatchObject({
      code: 'PEAC_DEPRECATED_PREF_NETWORK',
    });
  });
});

describe('robotsToAIPref (legacy shape; defers to @peac/mappings-content-signals)', () => {
  it('maps GPTBot Disallow: / to train-ai=false', () => {
    const robotsTxt = 'User-agent: GPTBot\nDisallow: /\n';
    const snapshot = robotsToAIPref(robotsTxt);
    expect(snapshot?.['train-ai']).toBe(false);
  });

  it('returns null when no AI-relevant signals', () => {
    const robotsTxt = 'User-agent: Googlebot\nDisallow: /private/\n';
    const snapshot = robotsToAIPref(robotsTxt);
    expect(snapshot).toBeNull();
  });
});

describe('PrefResolver: byte-for-byte canonical parity', () => {
  beforeEach(() => __resetDeprecationWarningForTests());

  const VECTORS: Array<{
    name: string;
    header: string;
    aiTraining: 'allow' | 'deny' | 'unspecified';
    aiSearch: 'allow' | 'deny' | 'unspecified';
  }> = [
    {
      name: 'explicit deny-train / allow-search',
      header: 'train-ai=n, search=y',
      aiTraining: 'deny',
      aiSearch: 'allow',
    },
    {
      name: 'explicit allow-train / deny-search',
      header: 'train-ai=y, search=n',
      aiTraining: 'allow',
      aiSearch: 'deny',
    },
    {
      name: 'only train-ai specified',
      header: 'train-ai=n',
      aiTraining: 'deny',
      aiSearch: 'unspecified',
    },
    {
      name: 'only search specified',
      header: 'search=y',
      aiTraining: 'unspecified',
      aiSearch: 'allow',
    },
  ];

  for (const v of VECTORS) {
    it(`facade decisions match @peac/mappings-content-signals canonical path: ${v.name}`, async () => {
      // Canonical path
      const canonical = resolveSignals(parseContentUsage(v.header).entries);
      expect(getDecisionForPurpose(canonical, 'ai-training')).toBe(v.aiTraining);
      expect(getDecisionForPurpose(canonical, 'ai-search')).toBe(v.aiSearch);

      // Facade path
      const resolver = new PrefResolver();
      const policy = await resolver.resolve({
        uri: 'https://example.com/',
        headers: { 'content-usage': v.header },
      });

      // Derive expected legacy snapshot from canonical decisions via the
      // same purpose->legacy-field mapping the facade applies internally.
      // When a canonical decision is 'unspecified', the facade leaves the
      // corresponding legacy field unset (defaults are only used when the
      // input had zero entries; these vectors all have at least one).
      const expectedSnapshot: Record<string, boolean> = {};
      if (v.aiTraining !== 'unspecified') expectedSnapshot['train-ai'] = v.aiTraining === 'allow';
      if (v.aiSearch !== 'unspecified') expectedSnapshot.crawl = v.aiSearch === 'allow';

      expect(policy.snapshot).toEqual(expectedSnapshot);
    });
  }
});
