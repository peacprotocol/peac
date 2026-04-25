import { describe, it, expect } from 'vitest';
import {
  isV1AgentCard,
  normalizeAgentCard,
  selectBestInterface,
  type A2AAgentCard,
  type A2ASupportedInterface,
} from '../src/index';

describe('isV1AgentCard', () => {
  it('returns true for v1.0.0 card with supportedInterfaces[0].url', () => {
    const card: A2AAgentCard = {
      name: 'Test Agent',
      supportedInterfaces: [
        { url: 'https://agent.example.com', protocolBinding: 'http+json', protocolVersion: '1.0' },
      ],
    };
    expect(isV1AgentCard(card)).toBe(true);
  });

  it('returns false for a card with empty supportedInterfaces', () => {
    const card: A2AAgentCard = {
      name: 'Test Agent',
      supportedInterfaces: [],
    };
    expect(isV1AgentCard(card)).toBe(false);
  });

  it('returns false for a card without supportedInterfaces (legacy v0.3.0 shape, no longer accepted)', () => {
    // A card with only a top-level `url` (the v0.3.0 shape) is not a
    // valid v1.0.0 Agent Card. v0.3.0 compatibility was removed in
    // v0.13.0 (DD-186); isV1AgentCard MUST NOT claim this shape is v1.
    const card = {
      name: 'Legacy Agent',
      url: 'https://legacy.example.com',
    } as unknown as A2AAgentCard;
    expect(isV1AgentCard(card)).toBe(false);
  });

  it('returns false when supportedInterfaces[0].url is empty', () => {
    const card: A2AAgentCard = {
      name: 'Broken Agent',
      supportedInterfaces: [{ url: '', protocolBinding: 'http+json', protocolVersion: '1.0' }],
    };
    expect(isV1AgentCard(card)).toBe(false);
  });
});

describe('normalizeAgentCard', () => {
  it('normalizes v1.0.0 card with supportedInterfaces', () => {
    const card: A2AAgentCard = {
      name: 'V1 Agent',
      supportedInterfaces: [
        { url: 'https://v1.example.com', protocolBinding: 'http+json', protocolVersion: '1.0' },
      ],
    };
    const result = normalizeAgentCard(card);
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://v1.example.com');
    expect(result!.name).toBe('V1 Agent');
    expect(result!.original).toBe(card);
  });

  it('rejects v0.3.0 card with only top-level url (DD-186 removal at v0.13.0)', () => {
    // v0.3.0 cards carried `url` at the top level. v0.13.0 removes this
    // compatibility path: normalizeAgentCard returns null instead of
    // synthesizing a supportedInterfaces entry from the legacy url.
    const card = {
      name: 'Legacy Agent',
      url: 'https://legacy.example.com',
    } as unknown as A2AAgentCard;
    expect(normalizeAgentCard(card)).toBeNull();
  });

  it('returns null for card with neither url nor supportedInterfaces', () => {
    const card: A2AAgentCard = { name: 'Broken Agent' };
    expect(normalizeAgentCard(card)).toBeNull();
  });

  it('ignores a legacy top-level url when supportedInterfaces is present', () => {
    // A hybrid card (v0.3.0 url plus v1.0.0 supportedInterfaces) is
    // treated as v1.0.0 by the normalizer. The top-level url is no
    // longer consulted.
    const card = {
      name: 'Hybrid Agent',
      url: 'https://old.example.com',
      supportedInterfaces: [
        { url: 'https://new.example.com', protocolBinding: 'http+json', protocolVersion: '1.0' },
      ],
    } as A2AAgentCard;
    const result = normalizeAgentCard(card);
    expect(result!.url).toBe('https://new.example.com');
  });

  it('normalizes v1.0.0 card with multiple interfaces', () => {
    const card: A2AAgentCard = {
      name: 'Multi Agent',
      supportedInterfaces: [
        { url: 'https://http.example.com', protocolBinding: 'http+json', protocolVersion: '1.0' },
        { url: 'https://grpc.example.com', protocolBinding: 'grpc+proto', protocolVersion: '1.0' },
      ],
    };
    const result = normalizeAgentCard(card);
    expect(result!.supportedInterfaces).toHaveLength(2);
    expect(result!.url).toBe('https://http.example.com');
  });

  it('preserves capabilities and extensions from original card', () => {
    const card: A2AAgentCard = {
      name: 'Ext Agent',
      supportedInterfaces: [
        { url: 'https://agent.example.com', protocolBinding: 'http+json', protocolVersion: '1.0' },
      ],
      capabilities: {
        extendedAgentCard: true,
        extensions: [{ uri: 'org.peacprotocol', description: 'PEAC', required: false }],
      },
    };
    const result = normalizeAgentCard(card);
    expect(result!.original.capabilities?.extendedAgentCard).toBe(true);
  });
});

describe('selectBestInterface', () => {
  it('selects highest protocol version', () => {
    const interfaces: A2ASupportedInterface[] = [
      { url: 'https://a.example.com', protocolBinding: 'http+json', protocolVersion: '0.3' },
      { url: 'https://b.example.com', protocolBinding: 'http+json', protocolVersion: '1.0' },
    ];
    const best = selectBestInterface(interfaces);
    expect(best!.url).toBe('https://b.example.com');
  });

  it('returns null for empty array', () => {
    expect(selectBestInterface([])).toBeNull();
  });

  it('returns single interface', () => {
    const interfaces: A2ASupportedInterface[] = [
      { url: 'https://only.example.com', protocolBinding: 'http+json', protocolVersion: '1.0' },
    ];
    expect(selectBestInterface(interfaces)!.url).toBe('https://only.example.com');
  });
});
