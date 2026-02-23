import { describe, it, expect } from 'vitest';
import { assertNotMcpReservedKey, isMcpReservedKey } from '../src/index';

describe('assertNotMcpReservedKey', () => {
  // Reserved keys (MUST throw)
  it('throws for dev.mcp/anything (2nd label is "mcp")', () => {
    expect(() => assertNotMcpReservedKey('dev.mcp/anything')).toThrow(/reserved/i);
  });

  it('throws for io.modelcontextprotocol/data (2nd label is "modelcontextprotocol")', () => {
    expect(() =>
      assertNotMcpReservedKey('io.modelcontextprotocol/data')
    ).toThrow(/reserved/i);
  });

  it('throws for dev.mcp/receipt_ref', () => {
    expect(() => assertNotMcpReservedKey('dev.mcp/receipt_ref')).toThrow(/reserved/i);
  });

  it('throws case-insensitively for dev.MCP/data', () => {
    expect(() => assertNotMcpReservedKey('dev.MCP/data')).toThrow(/reserved/i);
  });

  // NOT reserved (MUST NOT throw)
  it('allows org.peacprotocol/receipt_ref (2nd label is "peacprotocol")', () => {
    expect(() =>
      assertNotMcpReservedKey('org.peacprotocol/receipt_ref')
    ).not.toThrow();
  });

  it('allows com.example.mcp/data (2nd label is "example", not "mcp")', () => {
    expect(() =>
      assertNotMcpReservedKey('com.example.mcp/data')
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

  it('allows single-label prefix', () => {
    expect(() => assertNotMcpReservedKey('mcp/data')).not.toThrow();
  });
});

describe('isMcpReservedKey', () => {
  it('returns true for reserved keys', () => {
    expect(isMcpReservedKey('dev.mcp/anything')).toBe(true);
    expect(isMcpReservedKey('io.modelcontextprotocol/x')).toBe(true);
  });

  it('returns false for non-reserved keys', () => {
    expect(isMcpReservedKey('org.peacprotocol/receipt_ref')).toBe(false);
    expect(isMcpReservedKey('com.example.mcp/data')).toBe(false);
  });
});
