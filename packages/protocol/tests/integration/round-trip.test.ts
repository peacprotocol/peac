/**
 * Integration Round-Trip Tests
 *
 * System-level contract: anything issued must be verifiable,
 * and parse/normalize must be stable.
 *
 * All tests use a single fixed timestamp (FIXED_NOW). Tests that call
 * issue() freeze Date.now() via vi.useFakeTimers() so issue()'s internal
 * iat = Math.floor(Date.now() / 1000) produces a deterministic value.
 *
 * Keys are generated per test for isolation.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateKeypair, sign } from '@peac/crypto';
import { parseReceiptClaims, toCoreClaims } from '@peac/schema';
import { issue, verifyLocal } from '../../src/index';

/** Fixed timestamp for all time-dependent tests */
const FIXED_NOW = 1_700_000_000; // 2023-11-14T22:13:20Z

afterEach(() => {
  vi.useRealTimers();
});

describe('round-trip integration', () => {
  it('commerce: issue -> verifyLocal -> claims match', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW * 1000));

    const { privateKey, publicKey } = await generateKeypair();

    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 5000,
      cur: 'USD',
      rail: 'stripe',
      reference: 'pi_abc123',
      asset: 'USD',
      env: 'test',
      evidence: { charge_id: 'ch_test' },
      subject: 'https://api.example.com/v1/chat',
      exp: FIXED_NOW + 3600,
      privateKey,
      kid: 'key-2026-01',
    });

    const result = await verifyLocal(jws, publicKey, { now: FIXED_NOW });

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    expect(result.variant).toBe('commerce');
    if (result.variant !== 'commerce') return;

    expect(result.claims.iss).toBe('https://api.example.com');
    expect(result.claims.aud).toBe('https://client.example.com');
    expect(result.claims.amt).toBe(5000);
    expect(result.claims.cur).toBe('USD');
    expect(result.claims.payment.rail).toBe('stripe');
    expect(result.claims.payment.reference).toBe('pi_abc123');
    expect(result.claims.subject?.uri).toBe('https://api.example.com/v1/chat');
    expect(result.claims.exp).toBe(FIXED_NOW + 3600);
    expect(result.claims.iat).toBe(FIXED_NOW);
    expect(result.kid).toBe('key-2026-01');
  });

  it('attestation: sign -> verifyLocal -> variant is attestation', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    // Attestation receipts are signed directly (no commerce issue())
    const attestationPayload = {
      iss: 'https://middleware.example.com',
      aud: 'https://api.example.com',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 3600,
      rid: '01234567-0123-7123-8123-0123456789ab',
      sub: 'https://api.example.com/v1/inference',
    };

    const jws = await sign(attestationPayload, privateKey, 'attest-key-01');

    const result = await verifyLocal(jws, publicKey, { now: FIXED_NOW });

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    expect(result.variant).toBe('attestation');
    if (result.variant !== 'attestation') return;

    expect(result.claims.iss).toBe('https://middleware.example.com');
    expect(result.claims.aud).toBe('https://api.example.com');
    expect(result.claims.sub).toBe('https://api.example.com/v1/inference');
    expect(result.claims.exp).toBe(FIXED_NOW + 3600);
    expect(result.kid).toBe('attest-key-01');
  });

  it('full pipeline: issue -> verifyLocal -> parseReceiptClaims -> toCoreClaims -> deterministic', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW * 1000));

    const { privateKey, publicKey } = await generateKeypair();

    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 2500,
      cur: 'EUR',
      rail: 'x402',
      reference: 'tx_roundtrip',
      asset: 'EUR',
      env: 'test',
      evidence: {},
      subject: 'https://api.example.com/v1/resource',
      exp: FIXED_NOW + 7200,
      privateKey,
      kid: 'key-pipeline',
    });

    // Step 1: Verify
    const verified = await verifyLocal(jws, publicKey, { now: FIXED_NOW });
    expect(verified.valid).toBe(true);
    if (!verified.valid) return;

    // Step 2: Parse (re-parse the verified claims through unified parser)
    const parsed = parseReceiptClaims(verified.claims);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.variant).toBe('commerce');

    // Step 3: Normalize
    const core = toCoreClaims(parsed);

    expect(core.iss).toBe('https://api.example.com');
    expect(core.aud).toBe('https://client.example.com');
    expect(core.amt).toBe(2500);
    expect(core.cur).toBe('EUR');
    expect(core.exp).toBe(FIXED_NOW + 7200);
    expect(core.iat).toBe(FIXED_NOW);
    expect(core.payment?.rail).toBe('x402');
    expect(core.payment?.reference).toBe('tx_roundtrip');
    expect(core.subject?.uri).toBe('https://api.example.com/v1/resource');

    // Step 4: Determinism -- run again, same output
    const core2 = toCoreClaims(parsed);
    expect(core2).toEqual(core);
  });

  it('attestation pipeline: sign -> verifyLocal -> parseReceiptClaims -> toCoreClaims', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const payload = {
      iss: 'https://middleware.example.com',
      aud: 'https://api.example.com',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 1800,
      rid: '01234567-0123-7123-8123-0123456789ab',
      sub: 'https://api.example.com/v1/chat',
    };

    const jws = await sign(payload, privateKey, 'attest-key-02');

    const verified = await verifyLocal(jws, publicKey, { now: FIXED_NOW });
    expect(verified.valid).toBe(true);
    if (!verified.valid) return;
    expect(verified.variant).toBe('attestation');

    const parsed = parseReceiptClaims(verified.claims);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.variant).toBe('attestation');

    const core = toCoreClaims(parsed);

    // Attestation: no payment fields
    expect(core.amt).toBeUndefined();
    expect(core.cur).toBeUndefined();
    expect(core.payment).toBeUndefined();

    // sub -> subject.uri mapping
    expect(core.subject?.uri).toBe('https://api.example.com/v1/chat');
    expect(core.iss).toBe('https://middleware.example.com');
    expect(core.exp).toBe(FIXED_NOW + 1800);
  });

  it('expired receipt -> E_EXPIRED', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    // Use sign() directly so we control iat
    const payload = {
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      iat: FIXED_NOW,
      rid: '01234567-0123-7123-8123-0123456789ab',
      amt: 1000,
      cur: 'USD',
      payment: {
        rail: 'stripe',
        reference: 'tx_expired',
        amount: 1000,
        currency: 'USD',
        asset: 'USD',
        env: 'test',
      },
      exp: FIXED_NOW - 3600, // Expired 1 hour before FIXED_NOW
    };

    const jws = await sign(payload, privateKey, 'key-expired');

    const result = await verifyLocal(jws, publicKey, {
      now: FIXED_NOW,
      maxClockSkew: 0,
    });

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.code).toBe('E_EXPIRED');
  });

  it('malformed JWS -> E_INVALID_FORMAT', async () => {
    const { publicKey } = await generateKeypair();

    const result = await verifyLocal('not.a.valid-jws', publicKey, {
      now: FIXED_NOW,
    });

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.code).toBe('E_INVALID_FORMAT');
  });

  it('wrong key -> E_INVALID_SIGNATURE', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW * 1000));

    const { privateKey } = await generateKeypair();
    const { publicKey: wrongKey } = await generateKeypair();

    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 1000,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_wrongkey',
      asset: 'USD',
      env: 'test',
      evidence: {},
      privateKey,
      kid: 'key-wrong',
    });

    const result = await verifyLocal(jws, wrongKey, { now: FIXED_NOW });

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.code).toBe('E_INVALID_SIGNATURE');
  });

  it('issuer mismatch -> E_INVALID_ISSUER', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW * 1000));

    const { privateKey, publicKey } = await generateKeypair();

    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 1000,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_issmismatch',
      asset: 'USD',
      env: 'test',
      evidence: {},
      privateKey,
      kid: 'key-iss',
    });

    const result = await verifyLocal(jws, publicKey, {
      now: FIXED_NOW,
      issuer: 'https://other.example.com',
    });

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.code).toBe('E_INVALID_ISSUER');
  });

  it('toCoreClaims stability: commerce and attestation produce stable output', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW * 1000));

    const { privateKey, publicKey } = await generateKeypair();

    // Commerce receipt
    const { jws: commerceJws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 3000,
      cur: 'GBP',
      rail: 'x402',
      reference: 'tx_stable',
      asset: 'GBP',
      env: 'live',
      evidence: { extra: 'data' },
      subject: 'https://api.example.com/v1/endpoint',
      exp: FIXED_NOW + 3600,
      privateKey,
      kid: 'key-stable',
    });

    const commerceResult = await verifyLocal(commerceJws, publicKey, { now: FIXED_NOW });
    expect(commerceResult.valid).toBe(true);
    if (!commerceResult.valid) return;

    const commerceParsed = parseReceiptClaims(commerceResult.claims);
    expect(commerceParsed.ok).toBe(true);
    if (!commerceParsed.ok) return;

    // Attestation receipt (control iat directly via sign)
    const attestPayload = {
      iss: 'https://middleware.example.com',
      aud: 'https://api.example.com',
      iat: FIXED_NOW,
      exp: FIXED_NOW + 1800,
      rid: '01234567-0123-7123-8123-0123456789ab',
      sub: 'https://api.example.com/v1/endpoint',
    };

    const attestJws = await sign(attestPayload, privateKey, 'key-stable');
    const attestResult = await verifyLocal(attestJws, publicKey, { now: FIXED_NOW });
    expect(attestResult.valid).toBe(true);
    if (!attestResult.valid) return;

    const attestParsed = parseReceiptClaims(attestResult.claims);
    expect(attestParsed.ok).toBe(true);
    if (!attestParsed.ok) return;

    // Normalize both
    const commerceCore = toCoreClaims(commerceParsed);
    const attestCore = toCoreClaims(attestParsed);

    // Commerce has payment fields
    expect(commerceCore.amt).toBe(3000);
    expect(commerceCore.cur).toBe('GBP');
    expect(commerceCore.payment).toBeDefined();
    expect(commerceCore.payment?.env).toBe('live');

    // Attestation has no payment fields
    expect(attestCore.amt).toBeUndefined();
    expect(attestCore.cur).toBeUndefined();
    expect(attestCore.payment).toBeUndefined();

    // Both have subject
    expect(commerceCore.subject?.uri).toBe('https://api.example.com/v1/endpoint');
    expect(attestCore.subject?.uri).toBe('https://api.example.com/v1/endpoint');

    // No extra keys leak into CoreClaims
    const allowedKeys = ['iss', 'aud', 'rid', 'iat', 'exp', 'amt', 'cur', 'payment', 'subject', 'control'];
    for (const key of Object.keys(commerceCore)) {
      expect(allowedKeys).toContain(key);
    }
    for (const key of Object.keys(attestCore)) {
      expect(allowedKeys).toContain(key);
    }

    // Stability: calling toCoreClaims again produces identical output
    expect(toCoreClaims(commerceParsed)).toEqual(commerceCore);
    expect(toCoreClaims(attestParsed)).toEqual(attestCore);
  });
});
