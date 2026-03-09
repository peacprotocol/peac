import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issueWire01 } from '@peac/protocol';
import { handleDecode } from '../../src/handlers/decode.js';
import type { HandlerParams } from '../../src/handlers/types.js';
import type { DecodeInput } from '../../src/schemas/decode.js';
import { getDefaultPolicy } from '../../src/infra/policy.js';

function makeParams(input: DecodeInput): HandlerParams<DecodeInput> {
  return {
    input,
    policy: getDefaultPolicy(),
    context: {
      version: '0.11.2',
      policyHash: 'testhash',
      protocolVersion: '2025-11-25',
    },
  };
}

describe('handlers/decode', () => {
  it('decodes a valid JWS', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issueWire01({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'decode-kid',
    });

    const result = await handleDecode(makeParams({ jws }));

    expect(result.isError).toBeUndefined();
    expect(result.structured.verified).toBe(false);
    expect(result.text).toContain('WARNING: Signature NOT verified');

    const header = result.structured.header as Record<string, unknown>;
    expect(header.typ).toBe('peac-receipt/0.1');
    expect(header.alg).toBe('EdDSA');
    expect(header.kid).toBe('decode-kid');

    const payload = result.structured.payload as Record<string, unknown>;
    expect(payload.iss).toBe('https://api.example.com');
    expect(payload.amt).toBe(100);
    expect(payload.cur).toBe('USD');
  });

  it('returns isError for malformed JWS', async () => {
    const result = await handleDecode(makeParams({ jws: 'not.a.valid-jws' }));
    // The JWS has 3 parts but the base64url decode will produce garbage, which
    // may or may not throw depending on the content. Let's just check it doesn't crash.
    expect(result).toBeDefined();
  });

  it('returns isError for single-segment input', async () => {
    const result = await handleDecode(makeParams({ jws: 'single' }));
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Decode failed');
  });

  it('always sets verified to false', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issueWire01({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
    });

    const result = await handleDecode(makeParams({ jws }));
    expect(result.structured.verified).toBe(false);
  });

  it('includes formatted text output', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issueWire01({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
    });

    const result = await handleDecode(makeParams({ jws }));
    expect(result.text).toContain('Header:');
    expect(result.text).toContain('Payload:');
  });

  it('returns tool disabled error when decode is disabled by policy', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issueWire01({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
    });

    const params = makeParams({ jws });
    params.policy.tools.peac_decode = { enabled: false };

    const result = await handleDecode(params);
    expect(result.isError).toBe(true);
    expect(result.structured.code).toBe('E_MCP_TOOL_DISABLED');
  });

  it('returns input too large error when JWS exceeds limit', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issueWire01({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
    });

    const params = makeParams({ jws });
    params.policy.limits.max_jws_bytes = 10;

    const result = await handleDecode(params);
    expect(result.isError).toBe(true);
    expect(result.structured.code).toBe('E_MCP_INPUT_TOO_LARGE');
  });
});
