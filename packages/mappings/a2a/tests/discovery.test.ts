import { describe, it, expect, vi } from 'vitest';
import {
  discoverAgentCard,
  hasPeacExtension,
  getPeacExtension,
  discoverPeacCapabilities,
  PEAC_EXTENSION_URI,
} from '../src/index';
import type { A2AAgentCard } from '../src/index';

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------

function createMockFetch(
  responses: Map<string, { status: number; body: string; contentType?: string }>
): typeof globalThis.fetch {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const entry = responses.get(url);

    if (!entry) {
      return new Response('Not Found', { status: 404 });
    }

    return new Response(entry.body, {
      status: entry.status,
      headers: {
        'content-type': entry.contentType ?? 'application/json',
        'content-length': String(new TextEncoder().encode(entry.body).byteLength),
      },
    });
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const VALID_AGENT_CARD: A2AAgentCard = {
  name: 'Test Agent',
  url: 'https://agent.example.com',
  capabilities: {
    extensions: [
      {
        uri: PEAC_EXTENSION_URI,
        description: 'PEAC traceability',
        required: false,
      },
    ],
  },
};

const AGENT_CARD_NO_PEAC: A2AAgentCard = {
  name: 'Other Agent',
  url: 'https://other.example.com',
  capabilities: {
    extensions: [
      {
        uri: 'https://example.com/ext/other',
        description: 'Other extension',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// discoverAgentCard tests
// ---------------------------------------------------------------------------

describe('discoverAgentCard', () => {
  it('discovers agent card at /.well-known/agent-card.json', async () => {
    const mockFetch = createMockFetch(
      new Map([
        [
          'https://agent.example.com/.well-known/agent-card.json',
          { status: 200, body: JSON.stringify(VALID_AGENT_CARD) },
        ],
      ])
    );

    const card = await discoverAgentCard('https://agent.example.com', {
      fetch: mockFetch,
    });
    expect(card).not.toBeNull();
    expect(card!.name).toBe('Test Agent');
  });

  it('falls back to /.well-known/agent.json', async () => {
    const mockFetch = createMockFetch(
      new Map([
        [
          'https://agent.example.com/.well-known/agent.json',
          { status: 200, body: JSON.stringify(VALID_AGENT_CARD) },
        ],
      ])
    );

    const card = await discoverAgentCard('https://agent.example.com', {
      fetch: mockFetch,
    });
    expect(card).not.toBeNull();
    expect(card!.name).toBe('Test Agent');
  });

  it('returns null when no agent card found', async () => {
    const mockFetch = createMockFetch(new Map());
    const card = await discoverAgentCard('https://agent.example.com', {
      fetch: mockFetch,
    });
    expect(card).toBeNull();
  });

  it('rejects non-JSON content type', async () => {
    const mockFetch = createMockFetch(
      new Map([
        [
          'https://agent.example.com/.well-known/agent-card.json',
          {
            status: 200,
            body: JSON.stringify(VALID_AGENT_CARD),
            contentType: 'text/html',
          },
        ],
      ])
    );

    const card = await discoverAgentCard('https://agent.example.com', {
      fetch: mockFetch,
    });
    expect(card).toBeNull();
  });

  it('rejects oversized response', async () => {
    const hugeBody = JSON.stringify({
      name: 'x'.repeat(300_000),
      url: 'https://example.com',
    });

    const mockFetch = createMockFetch(
      new Map([
        ['https://agent.example.com/.well-known/agent-card.json', { status: 200, body: hugeBody }],
      ])
    );

    const card = await discoverAgentCard('https://agent.example.com', {
      fetch: mockFetch,
    });
    expect(card).toBeNull();
  });

  it('rejects HTTP scheme in production mode', async () => {
    const mockFetch = createMockFetch(new Map());

    const card = await discoverAgentCard('http://agent.example.com', {
      fetch: mockFetch,
    });
    expect(card).toBeNull();
  });

  it('allows HTTP for localhost with allowInsecureLocalhost', async () => {
    const mockFetch = createMockFetch(
      new Map([
        [
          'http://localhost/.well-known/agent-card.json',
          { status: 200, body: JSON.stringify(VALID_AGENT_CARD) },
        ],
      ])
    );

    const card = await discoverAgentCard('http://localhost', {
      fetch: mockFetch,
      allowInsecureLocalhost: true,
    });
    expect(card).not.toBeNull();
  });

  it('rejects private IP addresses (SSRF protection)', async () => {
    const mockFetch = createMockFetch(new Map());

    // 10.x.x.x is private
    const card = await discoverAgentCard('https://10.0.0.1', {
      fetch: mockFetch,
    });
    expect(card).toBeNull();
  });

  it('rejects 192.168.x.x private addresses', async () => {
    const mockFetch = createMockFetch(new Map());

    const card = await discoverAgentCard('https://192.168.1.1', {
      fetch: mockFetch,
    });
    expect(card).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hasPeacExtension tests
// ---------------------------------------------------------------------------

describe('hasPeacExtension', () => {
  it('returns true when PEAC extension present', () => {
    expect(hasPeacExtension(VALID_AGENT_CARD)).toBe(true);
  });

  it('returns false when PEAC extension absent', () => {
    expect(hasPeacExtension(AGENT_CARD_NO_PEAC)).toBe(false);
  });

  it('returns false when no capabilities', () => {
    expect(hasPeacExtension({ name: 'X', url: 'https://x.com' })).toBe(false);
  });

  it('returns false when no extensions array', () => {
    expect(hasPeacExtension({ name: 'X', url: 'https://x.com', capabilities: {} })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPeacExtension tests
// ---------------------------------------------------------------------------

describe('getPeacExtension', () => {
  it('returns extension entry when present', () => {
    const ext = getPeacExtension(VALID_AGENT_CARD);
    expect(ext).not.toBeNull();
    expect(ext!.uri).toBe(PEAC_EXTENSION_URI);
    expect(ext!.description).toBe('PEAC traceability');
  });

  it('returns null when not present', () => {
    expect(getPeacExtension(AGENT_CARD_NO_PEAC)).toBeNull();
  });

  it('returns null for card without capabilities', () => {
    expect(getPeacExtension({ name: 'X', url: 'https://x.com' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// discoverPeacCapabilities tests (3-step algorithm)
// ---------------------------------------------------------------------------

const AGENT_CARD_WITH_PARAMS: A2AAgentCard = {
  name: 'Full Agent',
  url: 'https://agent.example.com',
  capabilities: {
    extensions: [
      {
        uri: PEAC_EXTENSION_URI,
        description: 'PEAC traceability',
        required: false,
        params: {
          supported_kinds: ['peac-receipt/0.1'],
          carrier_formats: ['embed', 'reference'],
          jwks_uri: 'https://agent.example.com/.well-known/jwks.json',
        },
      },
    ],
  },
};

const PEAC_WELL_KNOWN = {
  supported_kinds: ['peac-receipt/0.1'],
  carrier_formats: ['embed'],
  jwks_uri: 'https://issuer.example.com/.well-known/jwks.json',
};

describe('discoverPeacCapabilities', () => {
  it('step 1: discovers from Agent Card with PEAC extension', async () => {
    const mockFetch = createMockFetch(
      new Map([
        [
          'https://agent.example.com/.well-known/agent-card.json',
          { status: 200, body: JSON.stringify(AGENT_CARD_WITH_PARAMS) },
        ],
      ])
    );

    const result = await discoverPeacCapabilities('https://agent.example.com', {
      fetch: mockFetch,
    });

    expect(result).not.toBeNull();
    expect(result!.source).toBe('agent_card');
    expect(result!.kinds).toEqual(['peac-receipt/0.1']);
    expect(result!.carrier_formats).toEqual(['embed', 'reference']);
    expect(result!.jwks_uri).toBe('https://agent.example.com/.well-known/jwks.json');
  });

  it('step 2: falls back to /.well-known/peac.json', async () => {
    const mockFetch = createMockFetch(
      new Map([
        [
          'https://issuer.example.com/.well-known/peac.json',
          { status: 200, body: JSON.stringify(PEAC_WELL_KNOWN) },
        ],
      ])
    );

    const result = await discoverPeacCapabilities('https://issuer.example.com', {
      fetch: mockFetch,
    });

    expect(result).not.toBeNull();
    expect(result!.source).toBe('well_known');
    expect(result!.kinds).toEqual(['peac-receipt/0.1']);
    expect(result!.jwks_uri).toBe('https://issuer.example.com/.well-known/jwks.json');
  });

  it('step 3: falls back to header probe', async () => {
    const mockFetch: typeof globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (init?.method === 'HEAD' && url === 'https://api.example.com') {
        return new Response(null, {
          status: 200,
          headers: { 'PEAC-Receipt': 'eyJhbGciOi...' },
        });
      }
      return new Response('Not Found', { status: 404 });
    };

    const result = await discoverPeacCapabilities('https://api.example.com', {
      fetch: mockFetch,
    });

    expect(result).not.toBeNull();
    expect(result!.source).toBe('header_probe');
    expect(result!.kinds).toEqual(['peac-receipt/0.1']);
  });

  it('returns null when no PEAC support found', async () => {
    const mockFetch = createMockFetch(new Map());

    const result = await discoverPeacCapabilities('https://nopeac.example.com', {
      fetch: mockFetch,
    });

    expect(result).toBeNull();
  });

  it('prefers Agent Card over well-known', async () => {
    const mockFetch = createMockFetch(
      new Map([
        [
          'https://agent.example.com/.well-known/agent-card.json',
          { status: 200, body: JSON.stringify(AGENT_CARD_WITH_PARAMS) },
        ],
        [
          'https://agent.example.com/.well-known/peac.json',
          { status: 200, body: JSON.stringify(PEAC_WELL_KNOWN) },
        ],
      ])
    );

    const result = await discoverPeacCapabilities('https://agent.example.com', {
      fetch: mockFetch,
    });

    expect(result!.source).toBe('agent_card');
  });

  it('returns defaults when Agent Card has no params', async () => {
    const mockFetch = createMockFetch(
      new Map([
        [
          'https://agent.example.com/.well-known/agent-card.json',
          { status: 200, body: JSON.stringify(VALID_AGENT_CARD) },
        ],
      ])
    );

    const result = await discoverPeacCapabilities('https://agent.example.com', {
      fetch: mockFetch,
    });

    expect(result!.source).toBe('agent_card');
    expect(result!.kinds).toEqual(['peac-receipt/0.1']);
    expect(result!.carrier_formats).toEqual(['embed']);
    expect(result!.jwks_uri).toBeUndefined();
  });

  it('rejects private IP in well-known discovery', async () => {
    const mockFetch = createMockFetch(new Map());

    const result = await discoverPeacCapabilities('https://10.0.0.5', {
      fetch: mockFetch,
    });

    expect(result).toBeNull();
  });

  it('rejects non-JSON content type in well-known', async () => {
    const mockFetch = createMockFetch(
      new Map([
        [
          'https://issuer.example.com/.well-known/peac.json',
          {
            status: 200,
            body: JSON.stringify(PEAC_WELL_KNOWN),
            contentType: 'text/html',
          },
        ],
      ])
    );

    const result = await discoverPeacCapabilities('https://issuer.example.com', {
      fetch: mockFetch,
    });

    expect(result).toBeNull();
  });
});
