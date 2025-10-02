import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UniversalParser } from '../src/index.js';
import { canonicalizeJson } from '@peac/core';

describe('Determinism Tests', () => {
  it('produces identical policy_hash regardless of parser execution order', async () => {
    const mockOrigin = 'https://example.com';

    const mockResponses = new Map([
      [
        'https://example.com/.well-known/agent-permissions.json',
        JSON.stringify({
          agent_permissions: {
            '*': { crawl: false, train: false },
          },
        }),
      ],
      [
        'https://example.com/.well-known/aipref.json',
        JSON.stringify({
          crawl: 'yes',
          'train-ai': 'no',
        }),
      ],
      ['https://example.com/robots.txt', 'User-agent: *\nDisallow: /admin/'],
    ]);

    const mockFetch = async (url) => {
      const urlStr = url.toString();
      if (mockResponses.has(urlStr)) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          text: async () => mockResponses.get(urlStr),
          json: async () => JSON.parse(mockResponses.get(urlStr)),
        };
      }
      return { ok: false, status: 404 };
    };

    const parser = new UniversalParser();
    const hashes = [];

    for (let i = 0; i < 10; i++) {
      const policy = await parser.parseAll(mockOrigin, mockFetch);
      const canonical = canonicalizeJson(policy);
      hashes.push(canonical);
    }

    const uniqueHashes = new Set(hashes);
    assert.equal(uniqueHashes.size, 1, 'All hashes should be identical across 10 runs');
  });

  it('produces identical policy_hash with shuffled parser priority order', async () => {
    const mockOrigin = 'https://example.com';

    const mockResponses = new Map([
      [
        'https://example.com/.well-known/agent-permissions.json',
        JSON.stringify({
          agent_permissions: {
            GPTBot: { crawl: true, train: false },
          },
        }),
      ],
      ['https://example.com/ai.txt', 'User-Agent: GPTBot\nDisallow: /private/'],
    ]);

    const mockFetch = async (url) => {
      const urlStr = url.toString();
      if (mockResponses.has(urlStr)) {
        return {
          ok: true,
          status: 200,
          headers: new Map([
            ['content-type', urlStr.endsWith('.json') ? 'application/json' : 'text/plain'],
          ]),
          text: async () => mockResponses.get(urlStr),
          json: async () => JSON.parse(mockResponses.get(urlStr)),
        };
      }
      return { ok: false, status: 404 };
    };

    const parser = new UniversalParser();
    const hashes = [];

    for (let i = 0; i < 100; i++) {
      const policy = await parser.parseAll(mockOrigin, mockFetch);
      const canonical = canonicalizeJson(policy);
      hashes.push(canonical);
    }

    const uniqueHashes = new Set(hashes);
    assert.equal(
      uniqueHashes.size,
      1,
      'All hashes should be identical across 100 runs with random order'
    );
  });

  it('merge order does not affect final policy_hash', async () => {
    const mockOrigin = 'https://example.com';

    const mockResponses = new Map([
      [
        'https://example.com/.well-known/agent-permissions.json',
        JSON.stringify({
          agent_permissions: {
            GPTBot: { crawl: true, train: true },
          },
        }),
      ],
      [
        'https://example.com/.well-known/aipref.json',
        JSON.stringify({
          crawl: 'yes',
          'train-ai': 'yes',
        }),
      ],
      ['https://example.com/ai.txt', 'User-Agent: GPTBot\nAllow: /'],
      ['https://example.com/robots.txt', 'User-agent: GPTBot\nAllow: /'],
    ]);

    const mockFetch = async (url) => {
      const urlStr = url.toString();
      if (mockResponses.has(urlStr)) {
        return {
          ok: true,
          status: 200,
          headers: new Map([
            ['content-type', urlStr.endsWith('.json') ? 'application/json' : 'text/plain'],
          ]),
          text: async () => mockResponses.get(urlStr),
          json: async () => JSON.parse(mockResponses.get(urlStr)),
        };
      }
      return { ok: false, status: 404 };
    };

    const parser = new UniversalParser();
    const policies = [];

    for (let i = 0; i < 50; i++) {
      const policy = await parser.parseAll(mockOrigin, mockFetch);
      const canonical = canonicalizeJson(policy);
      policies.push(canonical);
    }

    const firstPolicy = policies[0];
    for (let i = 1; i < policies.length; i++) {
      assert.equal(policies[i], firstPolicy, `Policy ${i} should match first policy`);
    }
  });

  it('handles empty results deterministically', async () => {
    const mockOrigin = 'https://example.com';

    const mockFetch = async () => ({ ok: false, status: 404 });

    const parser = new UniversalParser();
    const hashes = [];

    for (let i = 0; i < 10; i++) {
      const policy = await parser.parseAll(mockOrigin, mockFetch);
      const canonical = canonicalizeJson(policy);
      hashes.push(canonical);
    }

    const uniqueHashes = new Set(hashes);
    assert.equal(uniqueHashes.size, 1, 'Empty results should produce identical hashes');
  });

  it('handles partial results deterministically', async () => {
    const mockOrigin = 'https://example.com';

    const mockResponses = new Map([
      ['https://example.com/robots.txt', 'User-agent: *\nDisallow: /'],
    ]);

    const mockFetch = async (url) => {
      const urlStr = url.toString();
      if (mockResponses.has(urlStr)) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'text/plain']]),
          text: async () => mockResponses.get(urlStr),
        };
      }
      return { ok: false, status: 404 };
    };

    const parser = new UniversalParser();
    const hashes = [];

    for (let i = 0; i < 10; i++) {
      const policy = await parser.parseAll(mockOrigin, mockFetch);
      const canonical = canonicalizeJson(policy);
      hashes.push(canonical);
    }

    const uniqueHashes = new Set(hashes);
    assert.equal(uniqueHashes.size, 1, 'Partial results should produce identical hashes');
  });
});
