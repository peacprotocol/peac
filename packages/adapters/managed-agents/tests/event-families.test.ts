import { describe, it, expect } from 'vitest';
import {
  EVENT_FAMILIES,
  EventFamily,
  EVENT_TYPES,
  TYPE_PREFIX,
  EXTENSION_NAMESPACE,
} from '../src/index.js';

describe('event-families', () => {
  it('should have exactly 6 event families', () => {
    expect(Object.keys(EVENT_FAMILIES)).toHaveLength(6);
  });

  it('should map every EventFamily enum value to a registry entry', () => {
    for (const family of Object.values(EventFamily)) {
      expect(EVENT_FAMILIES[family]).toBeDefined();
      expect(EVENT_FAMILIES[family].type).toBeDefined();
      expect(EVENT_FAMILIES[family].kind).toBe('evidence');
    }
  });

  it('should use consistent type prefix for all families', () => {
    for (const entry of Object.values(EVENT_FAMILIES)) {
      expect(entry.type).toMatch(new RegExp(`^${TYPE_PREFIX.replace(/[/]/g, '\\/')}`));
    }
  });

  it('should have distinct type URIs for each family', () => {
    const types = Object.values(EVENT_FAMILIES).map((e) => e.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('should use reverse-DNS type URIs (org.peacprotocol/...)', () => {
    for (const entry of Object.values(EVENT_FAMILIES)) {
      expect(entry.type).toMatch(/^org\.peacprotocol\//);
    }
  });

  it('should export all 6 EVENT_TYPES constants', () => {
    expect(Object.keys(EVENT_TYPES)).toHaveLength(6);
    expect(EVENT_TYPES.SESSION).toBe('org.peacprotocol/managed-agent-session');
    expect(EVENT_TYPES.TASK).toBe('org.peacprotocol/managed-agent-task');
    expect(EVENT_TYPES.TOOL_USE).toBe('org.peacprotocol/managed-agent-tool-use');
    expect(EVENT_TYPES.MCP_CALL).toBe('org.peacprotocol/managed-agent-mcp-call');
    expect(EVENT_TYPES.PERMISSION).toBe('org.peacprotocol/managed-agent-permission');
    expect(EVENT_TYPES.OUTCOME).toBe('org.peacprotocol/managed-agent-outcome');
  });

  it('should use vendor-neutral extension namespace', () => {
    expect(EXTENSION_NAMESPACE).toBe('org.peacprotocol/managed-agent');
    expect(EXTENSION_NAMESPACE).not.toMatch(/anthropic|openai|google|aws/i);
  });
});
