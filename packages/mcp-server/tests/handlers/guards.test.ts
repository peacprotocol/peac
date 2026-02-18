import { describe, it, expect } from 'vitest';
import {
  checkJwsSize,
  checkToolEnabled,
  checkInputSizes,
  checkObjectDepth,
  measureEnvelopeBytes,
  truncateResponse,
} from '../../src/handlers/guards.js';
import { getDefaultPolicy } from '../../src/infra/policy.js';

describe('handlers/guards', () => {
  describe('checkJwsSize', () => {
    it('returns undefined for JWS within limits', () => {
      const policy = getDefaultPolicy();
      expect(checkJwsSize('a.b.c', policy)).toBeUndefined();
    });

    it('returns error result for JWS exceeding limit', () => {
      const policy = getDefaultPolicy();
      policy.limits.max_jws_bytes = 10;
      const result = checkJwsSize('a'.repeat(100), policy);
      expect(result).toBeDefined();
      expect(result!.isError).toBe(true);
      expect(result!.structured.code).toBe('E_MCP_INPUT_TOO_LARGE');
    });
  });

  describe('checkToolEnabled', () => {
    it('returns undefined when tool is not in policy', () => {
      const policy = getDefaultPolicy();
      expect(checkToolEnabled('peac_verify', policy)).toBeUndefined();
    });

    it('returns undefined when tool is explicitly enabled', () => {
      const policy = getDefaultPolicy();
      policy.tools.peac_verify = { enabled: true };
      expect(checkToolEnabled('peac_verify', policy)).toBeUndefined();
    });

    it('returns error when tool is disabled', () => {
      const policy = getDefaultPolicy();
      policy.tools.peac_verify = { enabled: false };
      const result = checkToolEnabled('peac_verify', policy);
      expect(result).toBeDefined();
      expect(result!.isError).toBe(true);
      expect(result!.structured.code).toBe('E_MCP_TOOL_DISABLED');
    });
  });

  describe('checkInputSizes', () => {
    it('returns undefined when total input is within limits', () => {
      const policy = getDefaultPolicy();
      const input = { jws: 'a'.repeat(100), public_key_base64url: 'b'.repeat(100) };
      expect(checkInputSizes(input, policy)).toBeUndefined();
    });

    it('returns error when total string input exceeds 2x max_jws_bytes', () => {
      const policy = getDefaultPolicy();
      policy.limits.max_jws_bytes = 50;
      // limit = 50 * 2 = 100 bytes
      const input = { field1: 'a'.repeat(60), field2: 'b'.repeat(60) };
      const result = checkInputSizes(input, policy);
      expect(result).toBeDefined();
      expect(result!.isError).toBe(true);
      expect(result!.structured.code).toBe('E_MCP_INPUT_TOO_LARGE');
    });

    it('ignores non-string values', () => {
      const policy = getDefaultPolicy();
      policy.limits.max_jws_bytes = 50;
      const input = { num: 999999, bool: true, str: 'short' };
      expect(checkInputSizes(input as Record<string, unknown>, policy)).toBeUndefined();
    });

    it('sums nested string values recursively', () => {
      const policy = getDefaultPolicy();
      policy.limits.max_jws_bytes = 50;
      // limit = 100 bytes. 30 + 30 + 30 = 90 top-level only (pass), but
      // with nested 30 more = 120 (fail)
      const input = {
        top: 'a'.repeat(30),
        nested: { deep: 'b'.repeat(30), deeper: { leaf: 'c'.repeat(30) } },
        arr: ['d'.repeat(30)],
      };
      const result = checkInputSizes(input as Record<string, unknown>, policy);
      expect(result).toBeDefined();
      expect(result!.structured.code).toBe('E_MCP_INPUT_TOO_LARGE');
    });

    it('handles cyclic object references without infinite loop', () => {
      const policy = getDefaultPolicy();
      policy.limits.max_jws_bytes = 50;
      const obj: Record<string, unknown> = { a: 'short' };
      obj.self = obj; // cyclic reference
      // Should not throw or infinite-loop -- cycle guard skips visited objects
      const result = checkInputSizes(obj, policy);
      // The string content is small, so it passes the string-sum check.
      // The serialized-size fallback may throw on JSON.stringify (cyclic),
      // but checkInputSizes catches that and returns undefined.
      expect(result).toBeUndefined();
    });

    it('rejects large non-string structures via serialized-size fallback', () => {
      const policy = getDefaultPolicy();
      policy.limits.max_jws_bytes = 50;
      // limit = 100 bytes. Build an input with no strings but large serialized size.
      // 30 numbers at ~2-5 bytes each in JSON = ~120-200 bytes serialized
      const input: Record<string, unknown> = {};
      for (let i = 0; i < 30; i++) {
        input[`n${i}`] = 99999;
      }
      const serialized = Buffer.byteLength(JSON.stringify(input), 'utf8');
      if (serialized > 100) {
        const result = checkInputSizes(input, policy);
        expect(result).toBeDefined();
        expect(result!.structured.code).toBe('E_MCP_INPUT_TOO_LARGE');
      }
    });
  });

  describe('checkObjectDepth', () => {
    it('returns true for flat objects', () => {
      expect(checkObjectDepth({ a: 1, b: 'two' })).toBe(true);
    });

    it('returns true for objects within max depth', () => {
      const obj = { a: { b: { c: { d: 'deep' } } } };
      expect(checkObjectDepth(obj, 10)).toBe(true);
    });

    it('returns false for objects exceeding max depth', () => {
      const obj = { a: { b: { c: 'deep' } } };
      expect(checkObjectDepth(obj, 2)).toBe(false);
    });

    it('handles arrays in depth check', () => {
      const obj = { a: [{ b: [{ c: 'deep' }] }] };
      expect(checkObjectDepth(obj, 10)).toBe(true);
      expect(checkObjectDepth(obj, 3)).toBe(false);
    });

    it('returns true for primitives', () => {
      expect(checkObjectDepth('string')).toBe(true);
      expect(checkObjectDepth(42)).toBe(true);
      expect(checkObjectDepth(null)).toBe(true);
      expect(checkObjectDepth(undefined)).toBe(true);
    });
  });

  describe('measureEnvelopeBytes', () => {
    it('measures full JSON-RPC envelope size including id and newline', () => {
      const result = {
        content: [{ type: 'text', text: 'hello' }],
        structuredContent: { ok: true },
        isError: false,
      };
      const bytes = measureEnvelopeBytes(result, 1);
      // Must include jsonrpc, id, result wrapper, newline -- strictly larger than just content
      const contentOnly = Buffer.byteLength(JSON.stringify(result), 'utf8');
      expect(bytes).toBeGreaterThan(contentOnly);
      // Verify the newline is counted: same call without newline would be 1 less
      const envelope = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: result.content,
          structuredContent: result.structuredContent,
          isError: result.isError,
        },
      };
      const rawBytes = Buffer.byteLength(JSON.stringify(envelope), 'utf8');
      expect(bytes).toBe(rawBytes + 1); // +1 for \n
    });

    it('envelope overhead can push response over cap', () => {
      // Construct a response whose content alone is under the cap,
      // but the full JSON-RPC envelope pushes it over.
      const text = 'x'.repeat(200);
      const result = {
        content: [{ type: 'text', text }],
        structuredContent: { data: text },
        isError: false,
      };
      const envelopeBytes = measureEnvelopeBytes(result, 42);
      const contentOnlyBytes = Buffer.byteLength(
        JSON.stringify({ content: result.content, structuredContent: result.structuredContent }),
        'utf8'
      );
      // The envelope adds jsonrpc + id + result wrapper + newline overhead
      expect(envelopeBytes).toBeGreaterThan(contentOnlyBytes);
      // The overhead is non-trivial (at least ~35 bytes for {"jsonrpc":"2.0","id":42,"result":...}\n)
      expect(envelopeBytes - contentOnlyBytes).toBeGreaterThanOrEqual(30);
    });

    it('uses conservative UUID-length id by default', () => {
      const result = {
        content: [{ type: 'text', text: 'test' }],
        structuredContent: { ok: true },
      };
      const withDefault = measureEnvelopeBytes(result);
      // Default placeholder is a UUID-length string (38 bytes in JSON: 36 chars + quotes)
      const withExplicitUuid = measureEnvelopeBytes(result, '00000000-0000-0000-0000-000000000000');
      expect(withDefault).toBe(withExplicitUuid);
    });

    it('id length affects envelope size', () => {
      const result = {
        content: [{ type: 'text', text: 'test' }],
        structuredContent: { ok: true },
      };
      const withShortId = measureEnvelopeBytes(result, 1);
      const withLongId = measureEnvelopeBytes(result, 'a-very-long-request-id-string');
      expect(withLongId).toBeGreaterThan(withShortId);
    });
  });

  describe('truncateResponse', () => {
    it('returns text unchanged when within limit', () => {
      const policy = getDefaultPolicy();
      const text = 'short text';
      const result = truncateResponse(text, policy);
      expect(result.text).toBe(text);
      expect(result.truncated).toBe(false);
      expect(result.originalBytes).toBe(new TextEncoder().encode(text).length);
      expect(result.returnedBytes).toBe(result.originalBytes);
    });

    it('truncates text exceeding limit', () => {
      const policy = getDefaultPolicy();
      policy.limits.max_response_bytes = 200;
      const text = 'x'.repeat(1000);
      const result = truncateResponse(text, policy);
      expect(result.text.length).toBeLessThan(text.length);
      expect(result.text).toContain('[TRUNCATED');
      expect(result.truncated).toBe(true);
      expect(result.originalBytes).toBe(1000);
      expect(result.returnedBytes).toBeLessThan(result.originalBytes);
    });
  });
});
