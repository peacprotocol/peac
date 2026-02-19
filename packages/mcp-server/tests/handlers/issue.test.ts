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
    version: '0.10.12',
    policyHash: 'testhash',
    protocolVersion: '2025-11-25',
    issuerKey: { privateKey, publicKey, kid },
    issuerId: 'https://api.example.com',
  };
}

describe('handlers/issue', () => {
  it('issues a receipt with all required fields', async () => {
    const context = await makeIssuerContext();
    const input: IssueInput = {
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test_' + Date.now(),
      env: 'test',
    };

    const params: HandlerParams<IssueInput> = {
      input,
      policy: getDefaultPolicy(),
      context,
    };

    const result = await handleIssue(params);

    expect(result.isError).toBeUndefined();
    expect(result.structured.ok).toBe(true);
    expect(typeof result.structured.jws).toBe('string');
    const summary = result.structured.claimsSummary as Record<string, unknown>;
    expect(summary.iss).toBe('https://api.example.com');
    expect(summary.amt).toBe(100);
    expect(summary.cur).toBe('USD');
  });

  it('computes exp from ttl_seconds', async () => {
    const context = await makeIssuerContext();
    const input: IssueInput = {
      aud: 'https://client.example.com',
      amt: 50,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_ttl_' + Date.now(),
      env: 'test',
      ttl_seconds: 3600,
    };

    const params: HandlerParams<IssueInput> = {
      input,
      policy: getDefaultPolicy(),
      context,
    };

    const result = await handleIssue(params);

    expect(result.structured.ok).toBe(true);
    const summary = result.structured.claimsSummary as Record<string, unknown>;
    expect(typeof summary.exp).toBe('number');
    expect(typeof summary.iat).toBe('number');
    expect(
      Math.abs((summary.exp as number) - ((summary.iat as number) + 3600))
    ).toBeLessThanOrEqual(2);
  });

  it('issues without exp when no ttl_seconds provided', async () => {
    const context = await makeIssuerContext();
    const input: IssueInput = {
      aud: 'https://client.example.com',
      amt: 75,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_nottl_' + Date.now(),
      env: 'test',
    };

    const params: HandlerParams<IssueInput> = {
      input,
      policy: getDefaultPolicy(),
      context,
    };

    const result = await handleIssue(params);

    expect(result.structured.ok).toBe(true);
    const summary = result.structured.claimsSummary as Record<string, unknown>;
    expect(summary.exp).toBeUndefined();
  });

  it('enforces TTL cap from policy', async () => {
    const context = await makeIssuerContext();
    const policy = getDefaultPolicy();
    policy.limits.max_ttl_seconds = 3600;

    const input: IssueInput = {
      aud: 'https://client.example.com',
      amt: 10,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_cap_' + Date.now(),
      env: 'test',
      ttl_seconds: 7200,
    };

    const params: HandlerParams<IssueInput> = {
      input,
      policy,
      context,
    };

    const result = await handleIssue(params);

    expect(result.isError).toBe(true);
    expect(result.structured.code).toBe('E_MCP_INVALID_INPUT');
  });

  it('returns E_MCP_KEY_REQUIRED when issuerKey is missing', async () => {
    const context = {
      version: '0.10.12',
      policyHash: 'testhash',
      protocolVersion: '2025-11-25',
    };

    const input: IssueInput = {
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_nokey_' + Date.now(),
      env: 'test',
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
      version: '0.10.12',
      policyHash: 'testhash',
      protocolVersion: '2025-11-25',
      issuerKey: { privateKey, publicKey, kid },
    };

    const input: IssueInput = {
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_noid_' + Date.now(),
      env: 'test',
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
    const context = await makeIssuerContext();
    const policy = getDefaultPolicy();
    policy.tools.peac_issue = { enabled: false };

    const input: IssueInput = {
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_disabled_' + Date.now(),
      env: 'test',
    };

    const params: HandlerParams<IssueInput> = {
      input,
      policy,
      context,
    };

    const result = await handleIssue(params);

    expect(result.isError).toBe(true);
    expect(result.structured.code).toBe('E_MCP_TOOL_DISABLED');
  });

  it('returns E_MCP_INPUT_TOO_LARGE when input exceeds max_claims_bytes', async () => {
    const context = await makeIssuerContext();
    const policy = getDefaultPolicy();
    policy.limits.max_claims_bytes = 10;

    const input: IssueInput = {
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_large_' + Date.now(),
      env: 'test',
    };

    const params: HandlerParams<IssueInput> = {
      input,
      policy,
      context,
    };

    const result = await handleIssue(params);

    expect(result.isError).toBe(true);
    expect(result.structured.code).toBe('E_MCP_INPUT_TOO_LARGE');
  });

  it('Trust Gate 1: private key bytes never appear in output', async () => {
    const context = await makeIssuerContext();
    const input: IssueInput = {
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_tg1_' + Date.now(),
      env: 'test',
    };

    const params: HandlerParams<IssueInput> = {
      input,
      policy: getDefaultPolicy(),
      context,
    };

    const result = await handleIssue(params);

    expect(result.structured.ok).toBe(true);
    const encodedPrivateKey = base64urlEncode(context.issuerKey.privateKey);
    expect(result.text).not.toContain(encodedPrivateKey);
    expect(JSON.stringify(result.structured)).not.toContain(encodedPrivateKey);
  });

  it('round-trip: issued receipt passes verification', async () => {
    const context = await makeIssuerContext();
    const input: IssueInput = {
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_roundtrip_' + Date.now(),
      env: 'test',
    };

    const issueParams: HandlerParams<IssueInput> = {
      input,
      policy: getDefaultPolicy(),
      context,
    };

    const issueResult = await handleIssue(issueParams);
    expect(issueResult.structured.ok).toBe(true);

    const jws = issueResult.structured.jws as string;

    const verifyInput: VerifyInput = {
      jws,
      public_key_base64url: base64urlEncode(context.issuerKey.publicKey),
    };

    const verifyParams: HandlerParams<VerifyInput> = {
      input: verifyInput,
      policy: getDefaultPolicy(),
      context,
    };

    const verifyResult = await handleVerify(verifyParams);
    expect(verifyResult.structured.ok).toBe(true);
  });
});
