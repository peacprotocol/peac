import { describe, it, expect } from 'vitest';
import {
  McpServerError,
  KeyLoadError,
  PolicyLoadError,
  JwksLoadError,
  sanitizeOutput,
} from '../../src/infra/errors.js';

describe('infra/errors', () => {
  describe('McpServerError', () => {
    it('sets name and code', () => {
      const err = new McpServerError('E_MCP_HANDLER_ERROR', 'test');
      expect(err.name).toBe('McpServerError');
      expect(err.code).toBe('E_MCP_HANDLER_ERROR');
      expect(err.message).toBe('test');
    });

    it('is an instance of Error', () => {
      const err = new McpServerError('E_MCP_HANDLER_ERROR', 'test');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('KeyLoadError', () => {
    it('has correct code and name', () => {
      const err = new KeyLoadError('bad key');
      expect(err.code).toBe('E_MCP_KEY_LOAD');
      expect(err.name).toBe('KeyLoadError');
      expect(err).toBeInstanceOf(McpServerError);
    });
  });

  describe('PolicyLoadError', () => {
    it('has correct code and name', () => {
      const err = new PolicyLoadError('bad policy');
      expect(err.code).toBe('E_MCP_POLICY_LOAD');
      expect(err.name).toBe('PolicyLoadError');
      expect(err).toBeInstanceOf(McpServerError);
    });
  });

  describe('JwksLoadError', () => {
    it('has correct code and name', () => {
      const err = new JwksLoadError('bad jwks');
      expect(err.code).toBe('E_MCP_JWKS_LOAD');
      expect(err.name).toBe('JwksLoadError');
      expect(err).toBeInstanceOf(McpServerError);
    });
  });

  describe('sanitizeOutput', () => {
    it('replaces matching patterns with [REDACTED]', () => {
      const result = sanitizeOutput('key=abc123secret value=safe', [/abc123secret/g]);
      expect(result).toBe('key=[REDACTED] value=safe');
    });

    it('handles multiple patterns', () => {
      const result = sanitizeOutput('token=xyz password=abc', [/xyz/g, /abc/g]);
      expect(result).toBe('token=[REDACTED] password=[REDACTED]');
    });

    it('returns input unchanged when no matches', () => {
      expect(sanitizeOutput('safe text', [/secret/g])).toBe('safe text');
    });

    it('handles empty input', () => {
      expect(sanitizeOutput('', [/x/g])).toBe('');
    });
  });
});
