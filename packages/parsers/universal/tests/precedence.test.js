import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UniversalParser } from '../src/index.js';

describe('Precedence Tests (Deny-Safe Merge)', () => {
  it('agent-permissions deny overrides all other allows', async () => {
    const mockOrigin = 'https://example.com';

    const mockResponses = new Map([
      [
        'https://example.com/.well-known/agent-permissions.json',
        JSON.stringify({
          agent_permissions: {
            GPTBot: { crawl: false, train: false },
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
    const policy = await parser.parseAll(mockOrigin, mockFetch);

    assert.equal(policy.agents?.GPTBot?.crawl, false, 'agent-permissions crawl deny should win');
    assert.equal(policy.agents?.GPTBot?.train, false, 'agent-permissions train deny should win');
  });

  it('AIPREF deny overrides ai.txt/robots.txt/peac.txt allows', async () => {
    const mockOrigin = 'https://example.com';

    const mockResponses = new Map([
      [
        'https://example.com/.well-known/aipref.json',
        JSON.stringify({
          crawl: 'no',
          'train-ai': 'no',
        }),
      ],
      ['https://example.com/ai.txt', 'User-Agent: *\nAllow: /'],
      ['https://example.com/robots.txt', 'User-agent: *\nAllow: /'],
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
    const policy = await parser.parseAll(mockOrigin, mockFetch);

    assert.equal(policy.globalCrawl, false, 'AIPREF crawl deny should win');
    assert.equal(policy.globalTrain, false, 'AIPREF train deny should win');
  });

  it('ai.txt deny overrides robots.txt allow', async () => {
    const mockOrigin = 'https://example.com';

    const mockResponses = new Map([
      ['https://example.com/ai.txt', 'User-Agent: GPTBot\nDisallow: /'],
      ['https://example.com/robots.txt', 'User-agent: GPTBot\nAllow: /'],
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
    const policy = await parser.parseAll(mockOrigin, mockFetch);

    assert.equal(
      policy.agents?.GPTBot?.crawl,
      false,
      'ai.txt deny should override robots.txt allow'
    );
  });

  it('robots.txt deny overrides ACP allow', async () => {
    const mockOrigin = 'https://example.com';

    const mockResponses = new Map([
      ['https://example.com/robots.txt', 'User-agent: *\nDisallow: /'],
      [
        'https://example.com/.well-known/acp.json',
        JSON.stringify({
          allow_training: true,
          allow_indexing: true,
        }),
      ],
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
    const policy = await parser.parseAll(mockOrigin, mockFetch);

    assert.equal(policy.globalCrawl, false, 'robots.txt deny should override ACP allow');
  });

  it('multiple denies accumulate (all sources agree deny)', async () => {
    const mockOrigin = 'https://example.com';

    const mockResponses = new Map([
      [
        'https://example.com/.well-known/agent-permissions.json',
        JSON.stringify({
          agent_permissions: {
            GPTBot: { crawl: false, train: false },
          },
        }),
      ],
      [
        'https://example.com/.well-known/aipref.json',
        JSON.stringify({
          crawl: 'no',
          'train-ai': 'no',
        }),
      ],
      ['https://example.com/ai.txt', 'User-Agent: GPTBot\nDisallow: /'],
      ['https://example.com/robots.txt', 'User-agent: GPTBot\nDisallow: /'],
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
    const policy = await parser.parseAll(mockOrigin, mockFetch);

    assert.equal(policy.agents?.GPTBot?.crawl, false, 'All sources agree deny');
    assert.equal(policy.agents?.GPTBot?.train, false, 'All sources agree deny');
    assert.equal(policy.globalCrawl, false, 'Global deny from all sources');
    assert.equal(policy.globalTrain, false, 'Global deny from all sources');
  });

  it('all allows with no denies produces allow policy', async () => {
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
    const policy = await parser.parseAll(mockOrigin, mockFetch);

    assert.equal(policy.agents?.GPTBot?.crawl, true, 'All sources allow crawl');
    assert.equal(policy.agents?.GPTBot?.train, true, 'All sources allow train');
    assert.equal(policy.globalCrawl, true, 'Global allow from all sources');
    assert.equal(policy.globalTrain, true, 'Global allow from all sources');
  });

  it('mixed signals with any deny results in deny', async () => {
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
      [
        'https://example.com/.well-known/aipref.json',
        JSON.stringify({
          crawl: 'yes',
          'train-ai': 'yes',
        }),
      ],
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
    const policy = await parser.parseAll(mockOrigin, mockFetch);

    assert.equal(policy.agents?.GPTBot?.crawl, true, 'No deny for crawl, allow wins');
    assert.equal(policy.agents?.GPTBot?.train, false, 'One deny for train, deny wins');
  });

  it('priority order: agent-permissions > AIPREF > ai.txt > peac.txt > robots.txt > ACP', async () => {
    const mockOrigin = 'https://example.com';

    const mockResponses = new Map([
      [
        'https://example.com/.well-known/agent-permissions.json',
        JSON.stringify({
          agent_permissions: {
            TestBot: { crawl: false },
          },
        }),
      ],
      [
        'https://example.com/.well-known/aipref.json',
        JSON.stringify({
          crawl: 'yes',
        }),
      ],
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
    const policy = await parser.parseAll(mockOrigin, mockFetch);

    assert.equal(
      policy.agents?.TestBot?.crawl,
      false,
      'Higher priority deny (agent-permissions) wins over lower priority allow (AIPREF)'
    );
  });
});
