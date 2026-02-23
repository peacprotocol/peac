import { describe, it, expect } from 'vitest';
import { assertNotMcpReservedKey, isMcpReservedKey } from '../src/index';

describe('assertNotMcpReservedKey', () => {
  // Reserved keys (MUST throw): reserved label is NOT the last label
  it('throws for mcp.dev/anything (mcp is non-last label)', () => {
    expect(() => assertNotMcpReservedKey('mcp.dev/anything')).toThrow(/reserved/i);
  });

  it('throws for tools.mcp.com/data (mcp is non-last label)', () => {
    expect(() => assertNotMcpReservedKey('tools.mcp.com/data')).toThrow(/reserved/i);
  });

  it('throws for api.modelcontextprotocol.org/x (modelcontextprotocol is non-last label)', () => {
    expect(() =>
      assertNotMcpReservedKey('api.modelcontextprotocol.org/x')
    ).toThrow(/reserved/i);
  });

  it('throws for modelcontextprotocol.io/data (modelcontextprotocol is non-last label)', () => {
    expect(() =>
      assertNotMcpReservedKey('modelcontextprotocol.io/data')
    ).toThrow(/reserved/i);
  });

  it('throws case-insensitively for MCP.dev/data', () => {
    expect(() => assertNotMcpReservedKey('MCP.dev/data')).toThrow(/reserved/i);
  });

  it('throws for mcp.example.com/receipt_ref', () => {
    expect(() => assertNotMcpReservedKey('mcp.example.com/receipt_ref')).toThrow(/reserved/i);
  });

  // NOT reserved (MUST NOT throw): reserved label IS the last label, or absent
  it('allows dev.mcp/anything (mcp is last label)', () => {
    expect(() => assertNotMcpReservedKey('dev.mcp/anything')).not.toThrow();
  });

  it('allows io.modelcontextprotocol/data (modelcontextprotocol is last label)', () => {
    expect(() =>
      assertNotMcpReservedKey('io.modelcontextprotocol/data')
    ).not.toThrow();
  });

  it('allows com.example.mcp/data (mcp is last label)', () => {
    expect(() =>
      assertNotMcpReservedKey('com.example.mcp/data')
    ).not.toThrow();
  });

  it('allows org.peacprotocol/receipt_ref (no reserved labels)', () => {
    expect(() =>
      assertNotMcpReservedKey('org.peacprotocol/receipt_ref')
    ).not.toThrow();
  });

  it('allows org.peacprotocol/receipt_jws', () => {
    expect(() =>
      assertNotMcpReservedKey('org.peacprotocol/receipt_jws')
    ).not.toThrow();
  });

  it('allows keys without slash (no prefix)', () => {
    expect(() => assertNotMcpReservedKey('simple_key')).not.toThrow();
  });

  it('allows single-label prefix (mcp/data)', () => {
    expect(() => assertNotMcpReservedKey('mcp/data')).not.toThrow();
  });
});

describe('isMcpReservedKey', () => {
  it('returns true for reserved keys', () => {
    expect(isMcpReservedKey('mcp.dev/anything')).toBe(true);
    expect(isMcpReservedKey('tools.mcp.com/x')).toBe(true);
    expect(isMcpReservedKey('api.modelcontextprotocol.org/x')).toBe(true);
  });

  it('returns false for non-reserved keys', () => {
    expect(isMcpReservedKey('dev.mcp/anything')).toBe(false);
    expect(isMcpReservedKey('io.modelcontextprotocol/data')).toBe(false);
    expect(isMcpReservedKey('org.peacprotocol/receipt_ref')).toBe(false);
    expect(isMcpReservedKey('com.example.mcp/data')).toBe(false);
  });
});
