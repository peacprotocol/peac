import { describe, it, expect, beforeEach } from 'vitest';
import {
  isV1AgentCard,
  normalizeAgentCard,
  selectBestInterface,
  normalizeTaskState,
  _resetDeprecationWarning,
  A2A_V1_TASK_STATE,
  type A2AAgentCard,
  type A2ASupportedInterface,
} from '../src/index';

describe('isV1AgentCard', () => {
  it('returns true for v1.0.0 card with supportedInterfaces', () => {
    const card: A2AAgentCard = {
      name: 'Test Agent',
      supportedInterfaces: [
        { url: 'https://agent.example.com', protocolBinding: 'http+json', protocolVersion: '1.0' },
      ],
    };
    expect(isV1AgentCard(card)).toBe(true);
  });

  it('returns false for v0.3.0 card with top-level url', () => {
    const card: A2AAgentCard = {
      name: 'Test Agent',
      url: 'https://agent.example.com',
    };
    expect(isV1AgentCard(card)).toBe(false);
  });

  it('returns false for card with empty supportedInterfaces', () => {
    const card: A2AAgentCard = {
      name: 'Test Agent',
      supportedInterfaces: [],
    };
    expect(isV1AgentCard(card)).toBe(false);
  });
});

describe('normalizeAgentCard', () => {
  beforeEach(() => {
    _resetDeprecationWarning();
  });

  it('normalizes v1.0.0 card with supportedInterfaces', () => {
    const card: A2AAgentCard = {
      name: 'V1 Agent',
      supportedInterfaces: [
        { url: 'https://v1.example.com', protocolBinding: 'http+json', protocolVersion: '1.0' },
      ],
    };
    const result = normalizeAgentCard(card);
    expect(result).not.toBeNull();
    expect(result!.version).toBe('1.0.0');
    expect(result!.url).toBe('https://v1.example.com');
    expect(result!.name).toBe('V1 Agent');
    expect(result!.original).toBe(card);
  });

  it('normalizes v0.3.0 card with top-level url', () => {
    const card: A2AAgentCard = {
      name: 'Legacy Agent',
      url: 'https://legacy.example.com',
    };
    const result = normalizeAgentCard(card);
    expect(result).not.toBeNull();
    expect(result!.version).toBe('0.3.0');
    expect(result!.url).toBe('https://legacy.example.com');
    expect(result!.supportedInterfaces).toHaveLength(1);
    expect(result!.supportedInterfaces[0]!.protocolVersion).toBe('0.3.0');
  });

  it('returns null for card with neither url nor supportedInterfaces', () => {
    const card: A2AAgentCard = { name: 'Broken Agent' };
    expect(normalizeAgentCard(card)).toBeNull();
  });

  it('prefers supportedInterfaces over url when both present', () => {
    const card: A2AAgentCard = {
      name: 'Both Agent',
      url: 'https://old.example.com',
      supportedInterfaces: [
        { url: 'https://new.example.com', protocolBinding: 'http+json', protocolVersion: '1.0' },
      ],
    };
    const result = normalizeAgentCard(card);
    expect(result!.version).toBe('1.0.0');
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

describe('normalizeTaskState', () => {
  beforeEach(() => {
    _resetDeprecationWarning();
  });

  it('converts v0.3.0 kebab-case to v1.0.0 prefixed form', () => {
    expect(normalizeTaskState('submitted')).toBe(A2A_V1_TASK_STATE.SUBMITTED);
    expect(normalizeTaskState('working')).toBe(A2A_V1_TASK_STATE.WORKING);
    expect(normalizeTaskState('completed')).toBe(A2A_V1_TASK_STATE.COMPLETED);
    expect(normalizeTaskState('failed')).toBe(A2A_V1_TASK_STATE.FAILED);
    expect(normalizeTaskState('canceled')).toBe(A2A_V1_TASK_STATE.CANCELED);
    expect(normalizeTaskState('rejected')).toBe(A2A_V1_TASK_STATE.REJECTED);
    expect(normalizeTaskState('input-required')).toBe(A2A_V1_TASK_STATE.INPUT_REQUIRED);
    expect(normalizeTaskState('auth-required')).toBe(A2A_V1_TASK_STATE.AUTH_REQUIRED);
  });

  it('passes through v1.0.0 values unchanged', () => {
    expect(normalizeTaskState('TASK_STATE_WORKING')).toBe('TASK_STATE_WORKING');
    expect(normalizeTaskState('TASK_STATE_COMPLETED')).toBe('TASK_STATE_COMPLETED');
  });

  it('passes through unknown values unchanged', () => {
    expect(normalizeTaskState('custom-state')).toBe('custom-state');
  });
});
