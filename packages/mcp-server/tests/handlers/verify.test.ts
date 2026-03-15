import { describe, it, expect } from 'vitest';
import { generateKeypair, base64urlEncode } from '@peac/crypto';
import { issueWire02 } from '@peac/protocol';
import { handleVerify } from '../../src/handlers/verify.js';
import type { HandlerParams } from '../../src/handlers/types.js';
import type { VerifyInput } from '../../src/schemas/verify.js';
import { getDefaultPolicy } from '../../src/infra/policy.js';

function makeContext() {
  return {
    version: '0.11.2',
    policyHash: 'testhash',
    protocolVersion: '2025-11-25',
  };
}

function makeParams(input: VerifyInput): HandlerParams<VerifyInput> {
  return {
    input,
    policy: getDefaultPolicy(),
    context: makeContext(),
  };
}

describe('handlers/verify', () => {
  it('verifies a valid commerce receipt', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = new Date().toISOString();
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid,
    });

    const result = await handleVerify(
      makeParams({
        jws,
        public_key_base64url: base64urlEncode(publicKey),
      })
    );

    expect(result.isError).toBeUndefined();
    expect(result.structured.ok).toBe(true);
    expect(result.structured.variant).toBe('wire-02');
    expect(result.structured.keySource).toBe('inline');
    expect(result.text).toContain('PASSED');
  });

  it('rejects tampered receipt', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = new Date().toISOString();
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid,
    });

    // Tamper with the payload
    const parts = jws.split('.');
    const tamperedJws = `${parts[0]}.${parts[1]}x.${parts[2]}`;

    const result = await handleVerify(
      makeParams({
        jws: tamperedJws,
        public_key_base64url: base64urlEncode(publicKey),
      })
    );

    expect(result.structured.ok).toBe(false);
    expect(result.text).toContain('FAILED');
  });

  it('verifies with issuer binding', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = new Date().toISOString();
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid,
    });

    const result = await handleVerify(
      makeParams({
        jws,
        public_key_base64url: base64urlEncode(publicKey),
        issuer: 'https://api.example.com',
      })
    );

    expect(result.structured.ok).toBe(true);
  });

  it('fails with wrong issuer', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = new Date().toISOString();
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid,
    });

    const result = await handleVerify(
      makeParams({
        jws,
        public_key_base64url: base64urlEncode(publicKey),
        issuer: 'https://wrong-issuer.com',
      })
    );

    expect(result.structured.ok).toBe(false);
    expect(result.structured.code).toBe('E_INVALID_ISSUER');
  });

  it('audience option is ignored for Wire 0.2 receipts (no aud claim)', async () => {
    // Wire 0.2 does not include aud in claims; audience binding is not checked.
    const { privateKey, publicKey } = await generateKeypair();
    const kid = new Date().toISOString();
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid,
    });

    const result = await handleVerify(
      makeParams({
        jws,
        public_key_base64url: base64urlEncode(publicKey),
        audience: 'https://wrong-audience.com',
      })
    );

    // Wire 0.2 verifyLocal does not check audience; verification passes
    expect(result.structured.ok).toBe(true);
  });

  it('fails with wrong public key', async () => {
    const issuerPair = await generateKeypair();
    const wrongPair = await generateKeypair();
    const kid = new Date().toISOString();
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey: issuerPair.privateKey,
      kid,
    });

    const result = await handleVerify(
      makeParams({
        jws,
        public_key_base64url: base64urlEncode(wrongPair.publicKey),
      })
    );

    expect(result.structured.ok).toBe(false);
    expect(result.structured.code).toBe('E_INVALID_SIGNATURE');
  });

  it('fails when no key is provided', async () => {
    const { privateKey } = await generateKeypair();
    const kid = new Date().toISOString();
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid,
    });

    const result = await handleVerify(makeParams({ jws }));

    expect(result.isError).toBe(true);
    expect(result.structured.ok).toBe(false);
    expect(result.structured.code).toBe('E_MCP_KEY_RESOLUTION');
  });

  it('resolves key from inline JWKS', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = 'inline-jwks-key';
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid,
    });

    const jwks = JSON.stringify({
      keys: [{ kty: 'OKP', crv: 'Ed25519', x: base64urlEncode(publicKey), kid: 'inline-jwks-key' }],
    });

    const result = await handleVerify(makeParams({ jws, jwks }));
    expect(result.structured.ok).toBe(true);
    expect(result.structured.keySource).toBe('inline-jwks');
  });

  it('resolves key from server JWKS context', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = 'server-jwks-key';
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid,
    });

    const params = makeParams({ jws });
    params.context.jwksKeys = [{ kid: 'server-jwks-key', publicKey }];

    const result = await handleVerify(params);
    expect(result.structured.ok).toBe(true);
    expect(result.structured.keySource).toBe('server-jwks');
  });

  it('handles malformed JWS gracefully', async () => {
    const result = await handleVerify(
      makeParams({
        jws: 'not-a-valid-jws',
        public_key_base64url: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      })
    );

    expect(result.structured.ok).toBe(false);
  });

  it('includes checks array in output', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = new Date().toISOString();
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid,
    });

    const result = await handleVerify(
      makeParams({
        jws,
        public_key_base64url: base64urlEncode(publicKey),
      })
    );

    const checks = result.structured.checks as Array<{ name: string; passed: boolean }>;
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((c) => c.passed)).toBe(true);
  });

  it('returns tool disabled error when verify is disabled by policy', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = new Date().toISOString();
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid,
    });

    const params = makeParams({
      jws,
      public_key_base64url: base64urlEncode(publicKey),
    });
    params.policy.tools.peac_verify = { enabled: false };

    const result = await handleVerify(params);
    expect(result.isError).toBe(true);
    expect(result.structured.code).toBe('E_MCP_TOOL_DISABLED');
  });

  it('returns input too large error when JWS exceeds limit', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = new Date().toISOString();
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid,
    });

    const params = makeParams({
      jws,
      public_key_base64url: base64urlEncode(publicKey),
    });
    params.policy.limits.max_jws_bytes = 10;

    const result = await handleVerify(params);
    expect(result.isError).toBe(true);
    expect(result.structured.code).toBe('E_MCP_INPUT_TOO_LARGE');
  });

  it('rejects inline JWKS keys with non-EdDSA alg', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = 'alg-test-key';
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid,
    });

    const jwks = JSON.stringify({
      keys: [
        {
          kty: 'OKP',
          crv: 'Ed25519',
          x: base64urlEncode(publicKey),
          kid: 'alg-test-key',
          alg: 'ES256',
        },
      ],
    });

    const result = await handleVerify(makeParams({ jws, jwks }));
    expect(result.structured.ok).toBe(false);
    // All Ed25519 keys filtered out by alg check -> "no Ed25519 keys"
    expect(result.structured.code).toBe('E_MCP_KEY_RESOLUTION');
  });

  it('check names are stable (append-only contract snapshot)', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = new Date().toISOString();
    const { jws } = await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid,
    });

    const result = await handleVerify(
      makeParams({
        jws,
        public_key_base64url: base64urlEncode(publicKey),
      })
    );

    const checks = result.structured.checks as Array<{ name: string; passed: boolean }>;
    const checkNames = checks.map((c) => c.name);
    expect(checkNames).toEqual(['signature', 'schema', 'expiry']);
  });
});
