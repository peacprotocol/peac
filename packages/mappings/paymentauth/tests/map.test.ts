/**
 * Tests for paymentauth evidence mapping.
 */

import { describe, it, expect } from 'vitest';
import {
  fromPaymentauthReceipt,
  toCommerceExtensionFields,
  parsePaymentauthReceipt,
  parsePaymentauthChallenges,
  normalizeReceipt,
  normalizeChallenge,
  PAYMENTAUTH_RAIL,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toBase64url(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_REQUEST = { amount: '1000', currency: 'usd', recipient: 'acct_123' };
const SAMPLE_REQUEST_B64 = toBase64url(SAMPLE_REQUEST);

const SAMPLE_CHALLENGE_HEADER =
  `Payment id="x7Tg2pLqR9mKvNwY3hBcZa", realm="api.example.com", ` +
  `method="example", intent="charge", expires="2025-01-15T12:05:00Z", ` +
  `request="${SAMPLE_REQUEST_B64}"`;

const SAMPLE_RECEIPT_JSON = {
  status: 'success',
  method: 'example',
  timestamp: '2025-01-15T12:00:00Z',
  reference: 'inv_12345',
};
const SAMPLE_RECEIPT_B64 = toBase64url(SAMPLE_RECEIPT_JSON);

function makeNormalizedReceipt() {
  const raw = parsePaymentauthReceipt(SAMPLE_RECEIPT_B64);
  return normalizeReceipt(raw);
}

function makeNormalizedChallenge() {
  const challenges = parsePaymentauthChallenges(SAMPLE_CHALLENGE_HEADER);
  return normalizeChallenge(challenges[0]);
}

// ---------------------------------------------------------------------------
// fromPaymentauthReceipt
// ---------------------------------------------------------------------------

describe('fromPaymentauthReceipt', () => {
  it('should map receipt with challenge context to PaymentEvidence', () => {
    const receipt = makeNormalizedReceipt();
    const challenge = makeNormalizedChallenge();

    const evidence = fromPaymentauthReceipt(receipt, challenge);

    expect(evidence.rail).toBe(PAYMENTAUTH_RAIL);
    expect(evidence.reference).toBe('inv_12345');
    expect(evidence.amount).toBe(1000);
    expect(evidence.currency).toBe('USD');
    expect(evidence.asset).toBe('USD');
    expect(evidence.env).toBe('live');
  });

  it('should map receipt without challenge context', () => {
    const receipt = makeNormalizedReceipt();

    const evidence = fromPaymentauthReceipt(receipt);

    expect(evidence.rail).toBe(PAYMENTAUTH_RAIL);
    expect(evidence.reference).toBe('inv_12345');
    // Without challenge, amount/currency are defaults
    expect(evidence.amount).toBe(0);
    expect(evidence.currency).toBe('UNKNOWN');
  });

  it('should use receipt reference when available', () => {
    const receipt = makeNormalizedReceipt();

    const evidence = fromPaymentauthReceipt(receipt);

    expect(evidence.reference).toBe('inv_12345');
  });

  it('should fall back to truncated raw value when no reference', () => {
    const receiptJson = { status: 'success', method: 'example' };
    const b64 = toBase64url(receiptJson);
    const raw = parsePaymentauthReceipt(b64);
    const receipt = normalizeReceipt(raw);

    const evidence = fromPaymentauthReceipt(receipt);

    expect(evidence.reference).toBeTruthy();
    expect(evidence.reference.length).toBeLessThanOrEqual(32);
  });

  it('should handle numeric amount in challenge request', () => {
    const reqJson = { amount: 500, currency: 'eur' };
    const reqB64 = toBase64url(reqJson);
    const header = `Payment id="x", realm="y", method="m", intent="i", request="${reqB64}"`;
    const challenges = parsePaymentauthChallenges(header);
    const challenge = normalizeChallenge(challenges[0]);
    const receipt = makeNormalizedReceipt();

    const evidence = fromPaymentauthReceipt(receipt, challenge);

    expect(evidence.amount).toBe(500);
    expect(evidence.currency).toBe('EUR');
  });
});

// ---------------------------------------------------------------------------
// toCommerceExtensionFields
// ---------------------------------------------------------------------------

describe('toCommerceExtensionFields', () => {
  it('should extract commerce fields from receipt + challenge', () => {
    const receipt = makeNormalizedReceipt();
    const challenge = makeNormalizedChallenge();

    const fields = toCommerceExtensionFields(receipt, challenge);

    expect(fields).toBeDefined();
    expect(fields!.payment_rail).toBe(PAYMENTAUTH_RAIL);
    expect(fields!.amount_minor).toBe('1000');
    expect(fields!.currency).toBe('USD');
    expect(fields!.reference).toBe('inv_12345');
    expect(fields!.env).toBe('live');
  });

  it('should return undefined when no commerce-relevant data beyond rail', () => {
    const receiptJson = { status: 'success', method: 'example' };
    const b64 = toBase64url(receiptJson);
    const raw = parsePaymentauthReceipt(b64);
    const receipt = normalizeReceipt(raw);

    const fields = toCommerceExtensionFields(receipt);

    expect(fields).toBeUndefined();
  });

  it('should include reference even without challenge', () => {
    const receipt = makeNormalizedReceipt();

    const fields = toCommerceExtensionFields(receipt);

    expect(fields).toBeDefined();
    expect(fields!.payment_rail).toBe(PAYMENTAUTH_RAIL);
    expect(fields!.reference).toBe('inv_12345');
  });

  it('should normalize currency to uppercase', () => {
    const receipt = makeNormalizedReceipt();
    const challenge = makeNormalizedChallenge();

    const fields = toCommerceExtensionFields(receipt, challenge);

    expect(fields!.currency).toBe('USD');
  });
});
