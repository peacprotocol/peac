import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issue } from '@peac/protocol';
import { handleInspect } from '../../src/handlers/inspect.js';
import type { HandlerParams } from '../../src/handlers/types.js';
import type { InspectInput } from '../../src/schemas/inspect.js';
import { getDefaultPolicy } from '../../src/infra/policy.js';

function makeParams(input: InspectInput): HandlerParams<InspectInput> {
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

describe('handlers/inspect', () => {
  it('inspects a valid commerce receipt', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
    });

    const result = await handleInspect(makeParams({ jws, full_claims: false }));

    expect(result.isError).toBeUndefined();
    expect(result.structured.verified).toBe(false);
    expect(result.text).toContain('WARNING: Signature NOT verified');

    const meta = result.structured.payloadMeta as Record<string, unknown>;
    expect(meta.variant).toBe('commerce');
    expect(meta.issuer).toBe('https://api.example.com');
    expect(meta.audience).toBe('https://client.example.com');
  });

  it('includes full payload when requested and policy permits', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 500,
      cur: 'EUR',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
    });

    const params = makeParams({ jws, full_claims: true });
    params.policy.redaction.inspect_full_claims = true;
    const result = await handleInspect(params);

    expect(result.structured.fullPayload).toBeDefined();
    const payload = result.structured.fullPayload as Record<string, unknown>;
    expect(payload.iss).toBe('https://api.example.com');
    expect(payload.amt).toBe(500);
  });

  it('ignores full_claims when policy inspect_full_claims is false (default)', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
    });

    // Default policy has inspect_full_claims: false
    const result = await handleInspect(makeParams({ jws, full_claims: true }));
    expect(result.structured.fullPayload).toBeUndefined();
  });

  it('omits full payload when not requested', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
    });

    const result = await handleInspect(makeParams({ jws, full_claims: false }));
    expect(result.structured.fullPayload).toBeUndefined();
  });

  it('redacts payment when policy requires it', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
      evidence: { type: 'test', data: 'secret' },
    });

    const policy = getDefaultPolicy();
    policy.redaction.strip_payment = true;
    policy.redaction.inspect_full_claims = true;

    const result = await handleInspect({
      input: { jws, full_claims: true },
      policy,
      context: {
        version: '0.11.2',
        policyHash: 'testhash',
        protocolVersion: '2025-11-25',
      },
    });

    expect(result.structured.redacted).toBe(true);
    const payload = result.structured.fullPayload as Record<string, unknown>;
    expect(payload.payment).toBe('[REDACTED by policy]');
  });

  it('extracts timestamp metadata', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
    });

    const result = await handleInspect(makeParams({ jws, full_claims: false }));
    const meta = result.structured.payloadMeta as Record<string, unknown>;
    expect(meta.issuedAt).toBeDefined();
    expect(typeof meta.issuedAt).toBe('string');
  });

  it('shows header information', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
    });

    const result = await handleInspect(makeParams({ jws, full_claims: false }));
    const header = result.structured.header as Record<string, unknown>;
    expect(header.typ).toBe('peac-receipt/0.1');
    expect(header.alg).toBe('EdDSA');
  });

  it('handles malformed JWS gracefully', async () => {
    const result = await handleInspect(makeParams({ jws: 'not-valid', full_claims: false }));
    expect(result.isError).toBe(true);
  });

  it('handles single-segment JWS gracefully', async () => {
    const result = await handleInspect(makeParams({ jws: 'onlyone', full_claims: false }));
    expect(result.isError).toBe(true);
  });

  it('returns tool disabled error when inspect is disabled by policy', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
    });

    const params = makeParams({ jws, full_claims: false });
    params.policy.tools.peac_inspect = { enabled: false };

    const result = await handleInspect(params);
    expect(result.isError).toBe(true);
    expect(result.structured.code).toBe('E_MCP_TOOL_DISABLED');
  });

  it('returns input too large error when JWS exceeds limit', async () => {
    const { privateKey } = await generateKeypair();
    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
    });

    const params = makeParams({ jws, full_claims: false });
    params.policy.limits.max_jws_bytes = 10;

    const result = await handleInspect(params);
    expect(result.isError).toBe(true);
    expect(result.structured.code).toBe('E_MCP_INPUT_TOO_LARGE');
  });
});
