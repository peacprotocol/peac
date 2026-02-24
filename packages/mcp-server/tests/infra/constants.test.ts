import { describe, it, expect } from 'vitest';
import {
  SERVER_NAME,
  SERVER_VERSION,
  MCP_PROTOCOL_VERSION,
  DEFAULT_MAX_JWS_BYTES,
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_TOOL_TIMEOUT_MS,
} from '../../src/infra/constants.js';

describe('infra/constants', () => {
  it('exports server name', () => {
    expect(SERVER_NAME).toBe('peac-mcp-server');
  });

  it('exports version matching package.json', () => {
    expect(SERVER_VERSION).toBe('0.11.2');
  });

  it('exports MCP protocol version', () => {
    expect(MCP_PROTOCOL_VERSION).toBe('2025-11-25');
  });

  it('exports sensible default limits', () => {
    expect(DEFAULT_MAX_JWS_BYTES).toBe(16_384);
    expect(DEFAULT_MAX_RESPONSE_BYTES).toBe(65_536);
    expect(DEFAULT_TOOL_TIMEOUT_MS).toBe(30_000);
  });
});
