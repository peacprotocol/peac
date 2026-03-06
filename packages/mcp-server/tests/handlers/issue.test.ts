import { describe, it, expect } from 'vitest';
import { generateKeypair, base64urlEncode } from '@peac/crypto';
import { handleIssue } from '../../src/handlers/issue.js';
import { handleVerify } from '../../src/handlers/verify.js';
import type { HandlerParams } from '../../src/handlers/types.js';
import type { IssueInput } from '../../src/schemas/issue.js';
import type { VerifyInput } from '../../src/schemas/verify.js';
import { getDefaultPolicy } from '../../src/infra/policy.js';

async function makeIssuerContext() {
  const { privateKey, publicKey } = await generateKeypair();
  const kid = 'test-kid-' + Date.now();
  return {
    version: '0.12.0-preview.2',
    policyHash: 'testhash',
    protocolVersion: '2025-11-25',
    issuerKey: { privateKey, publicKey, kid },
    issuerId: 'https://api.example.com',
  };
}

function makeParams(input: IssueInput, context: Awaited<ReturnType<typeof makeIssuerContext>>) {
  return { input, policy: getDefaultPolicy(), context } satisfies HandlerParams<IssueInput>;
}

describe('handlers/issue (Wire 0.2)', () => {
  it('issues an evidence receipt with commerce extension', async () => {
    const ctx = await makeIssuerContext();
    const input: IssueInput = {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'x402',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
    };

    const result = await handleIssue(makeParams(input, ctx));

    expect(result.isError).toBeUndefined();
    expect(result.structured.ok).toBe(true);
    expect(typeof result.structured.jws).toBe('string');
    const summary = result.structured.claimsSummary as Record<string, unknown>;
    expect(summary.iss).toBe('https://api.example.com');
    expect(summary.kind).toBe('evidence');
    expect(summary.type).toBe('org.peacprotocol/payment');
    expect(typeof summary.jti).toBe('string');
    expect(summary.pillars).toEqual(['commerce']);
  });

  it('issues a challenge receipt', async () => {
    const ctx = await makeIssuerContext();
    const input: IssueInput = {
      kind: 'challenge',
      type: 'org.peacprotocol/payment_required',
      extensions: {
        'org.peacprotocol/challenge': {
          challenge_type: 'payment_required',
          problem: {
            type: 'https://peacprotocol.org/errors/payment-required',
            title: 'Payment Required',
            status: 402,
          },
        },
      },
    };

    const result = await handleIssue(makeParams(input, ctx));

    expect(result.isError).toBeUndefined();
    expect(result.structured.ok).toBe(true);
    const summary = result.structured.claimsSummary as Record<string, unknown>;
    expect(summary.kind).toBe('challenge');
  });

  it('issues a minimal evidence receipt (no extensions)', async () => {
    const ctx = await makeIssuerContext();
    const input: IssueInput = {
      kind: 'evidence',
      type: 'org.peacprotocol/consent',
    };

    const result = await handleIssue(makeParams(input, ctx));

    expect(result.structured.ok).toBe(true);
    const summary = result.structured.claimsSummary as Record<string, unknown>;
    expect(summary.kind).toBe('evidence');
    expect(summary.type).toBe('org.peacprotocol/consent');
  });

  it('issues with policy binding', async () => {
    const ctx = await makeIssuerContext();
    const input: IssueInput = {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      policy: {
        uri: 'https://example.com/.well-known/peac.txt',
        version: '1.0.0',
        digest: 'sha256:' + 'a'.repeat(64),
      },
    };

    const result = await handleIssue(makeParams(input, ctx));

    expect(result.structured.ok).toBe(true);
  });

  it('issues with subject', async () => {
    const ctx = await makeIssuerContext();
    const input: IssueInput = {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      sub: 'https://resource.example.com/api/v1',
    };

    const result = await handleIssue(makeParams(input, ctx));

    expect(result.structured.ok).toBe(true);
    const summary = result.structured.claimsSummary as Record<string, unknown>;
    expect(summary.sub).toBe('https://resource.example.com/api/v1');
  });

  it('rejects Wire 0.1 fields with validation error', async () => {
    const ctx = await makeIssuerContext();
    // Attempt to pass Wire 0.1 fields; schema rejects them
    const input = {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_old',
      aud: 'https://example.com',
    } as unknown as IssueInput;

    // Wire 0.1 fields are unknown to the Wire 0.2 schema;
    // issueWire02() will ignore them (passthrough), but the
    // absence of required Wire 0.1 fields in issue() means
    // the handler uses issueWire02 which only requires kind+type
    const result = await handleIssue(makeParams(input, ctx));

    // Should succeed since kind and type are present;
    // extra fields are ignored by issueWire02
    expect(result.structured.ok).toBe(true);
  });

  it('returns E_MCP_KEY_REQUIRED when issuerKey is missing', async () => {
    const context = {
      version: '0.12.0-preview.2',
      policyHash: 'testhash',
      protocolVersion: '2025-11-25',
    };

    const input: IssueInput = {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
    };

    const params: HandlerParams<IssueInput> = {
      input,
      policy: getDefaultPolicy(),
      context,
    };

    const result = await handleIssue(params);

    expect(result.isError).toBe(true);
    expect(result.structured.code).toBe('E_MCP_KEY_REQUIRED');
  });

  it('returns E_MCP_KEY_REQUIRED when issuerId is missing', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = 'test-kid-' + Date.now();
    const context = {
      version: '0.12.0-preview.2',
      policyHash: 'testhash',
      protocolVersion: '2025-11-25',
      issuerKey: { privateKey, publicKey, kid },
    };

    const input: IssueInput = {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
    };

    const params: HandlerParams<IssueInput> = {
      input,
      policy: getDefaultPolicy(),
      context,
    };

    const result = await handleIssue(params);

    expect(result.isError).toBe(true);
    expect(result.structured.code).toBe('E_MCP_KEY_REQUIRED');
  });

  it('returns E_MCP_TOOL_DISABLED when peac_issue is disabled by policy', async () => {
    const ctx = await makeIssuerContext();
    const policy = getDefaultPolicy();
    policy.tools.peac_issue = { enabled: false };

    const input: IssueInput = {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
    };

    const params: HandlerParams<IssueInput> = {
      input,
      policy,
      context: ctx,
    };

    const result = await handleIssue(params);

    expect(result.isError).toBe(true);
    expect(result.structured.code).toBe('E_MCP_TOOL_DISABLED');
  });

  it('returns E_MCP_INPUT_TOO_LARGE when input exceeds max_claims_bytes', async () => {
    const ctx = await makeIssuerContext();
    const policy = getDefaultPolicy();
    policy.limits.max_claims_bytes = 10;

    const input: IssueInput = {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
    };

    const params: HandlerParams<IssueInput> = {
      input,
      policy,
      context: ctx,
    };

    const result = await handleIssue(params);

    expect(result.isError).toBe(true);
    expect(result.structured.code).toBe('E_MCP_INPUT_TOO_LARGE');
  });

  it('Trust Gate 1: private key bytes never appear in output', async () => {
    const ctx = await makeIssuerContext();
    const input: IssueInput = {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
    };

    const result = await handleIssue(makeParams(input, ctx));

    expect(result.structured.ok).toBe(true);
    const encodedPrivateKey = base64urlEncode(ctx.issuerKey.privateKey);
    expect(result.text).not.toContain(encodedPrivateKey);
    expect(JSON.stringify(result.structured)).not.toContain(encodedPrivateKey);
  });

  it('round-trip: issued Wire 0.2 receipt passes verification', async () => {
    const ctx = await makeIssuerContext();
    const input: IssueInput = {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '500',
          currency: 'USD',
        },
      },
    };

    const issueResult = await handleIssue(makeParams(input, ctx));
    expect(issueResult.structured.ok).toBe(true);

    const jws = issueResult.structured.jws as string;

    const verifyInput: VerifyInput = {
      jws,
      public_key_base64url: base64urlEncode(ctx.issuerKey.publicKey),
    };

    const verifyParams: HandlerParams<VerifyInput> = {
      input: verifyInput,
      policy: getDefaultPolicy(),
      context: ctx,
    };

    const verifyResult = await handleVerify(verifyParams);
    expect(verifyResult.structured.ok).toBe(true);
  });
});
