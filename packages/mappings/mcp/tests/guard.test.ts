import { describe, it, expect } from 'vitest';
import { assertNotMcpReservedKey, isMcpReservedKey } from '../src/index';

describe('assertNotMcpReservedKey', () => {
  // Reserved keys (MUST throw): second label is "mcp" or "modelcontextprotocol"
  it('throws for dev.mcp/anything (2nd label = mcp)', () => {
    expect(() => assertNotMcpReservedKey('dev.mcp/anything')).toThrow(/reserved/i);
  });

  it('throws for io.modelcontextprotocol/data (2nd label = modelcontextprotocol)', () => {
    expect(() => assertNotMcpReservedKey('io.modelcontextprotocol/data')).toThrow(/reserved/i);
  });

  it('throws for com.mcp.tools/data (2nd label = mcp)', () => {
    expect(() => assertNotMcpReservedKey('com.mcp.tools/data')).toThrow(/reserved/i);
  });

  it('throws for tools.mcp.com/data (2nd label = mcp)', () => {
    expect(() => assertNotMcpReservedKey('tools.mcp.com/data')).toThrow(/reserved/i);
  });

  it('throws for api.modelcontextprotocol.org/x (2nd label = modelcontextprotocol)', () => {
    expect(() => assertNotMcpReservedKey('api.modelcontextprotocol.org/x')).toThrow(/reserved/i);
  });

  it('throws case-insensitively for dev.MCP/data', () => {
    expect(() => assertNotMcpReservedKey('dev.MCP/data')).toThrow(/reserved/i);
  });

  // NOT reserved (MUST NOT throw): second label is not a reserved word
  it('allows mcp.dev/anything (2nd label = dev)', () => {
    expect(() => assertNotMcpReservedKey('mcp.dev/anything')).not.toThrow();
  });

  it('allows modelcontextprotocol.io/data (2nd label = io)', () => {
    expect(() => assertNotMcpReservedKey('modelcontextprotocol.io/data')).not.toThrow();
  });

  it('allows com.example.mcp/data (2nd label = example)', () => {
    expect(() => assertNotMcpReservedKey('com.example.mcp/data')).not.toThrow();
  });

  it('allows org.peacprotocol/receipt_ref (2nd label = peacprotocol)', () => {
    expect(() => assertNotMcpReservedKey('org.peacprotocol/receipt_ref')).not.toThrow();
  });

  it('allows org.peacprotocol/receipt_jws', () => {
    expect(() => assertNotMcpReservedKey('org.peacprotocol/receipt_jws')).not.toThrow();
  });

  it('allows keys without slash (no prefix)', () => {
    expect(() => assertNotMcpReservedKey('simple_key')).not.toThrow();
  });

  it('allows single-label prefix (mcp/data)', () => {
    expect(() => assertNotMcpReservedKey('mcp/data')).not.toThrow();
  });
});

describe('isMcpReservedKey', () => {
  it('returns true for reserved keys (2nd label is mcp or modelcontextprotocol)', () => {
    expect(isMcpReservedKey('dev.mcp/anything')).toBe(true);
    expect(isMcpReservedKey('io.modelcontextprotocol/data')).toBe(true);
    expect(isMcpReservedKey('com.mcp.tools/x')).toBe(true);
    expect(isMcpReservedKey('tools.mcp.com/x')).toBe(true);
  });

  it('returns false for non-reserved keys', () => {
    expect(isMcpReservedKey('mcp.dev/anything')).toBe(false);
    expect(isMcpReservedKey('modelcontextprotocol.io/data')).toBe(false);
    expect(isMcpReservedKey('org.peacprotocol/receipt_ref')).toBe(false);
    expect(isMcpReservedKey('com.example.mcp/data')).toBe(false);
  });
});
