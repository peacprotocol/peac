/**
 * Paymentauth evidence mapping example.
 *
 * Parses a mock 402 Payment challenge and Payment-Receipt,
 * maps to PEAC PaymentEvidence, and extracts commerce extension fields.
 *
 * Run: npx tsx examples/paymentauth-evidence/demo.ts
 */

import {
  parsePaymentauthChallenges,
  parsePaymentauthReceipt,
  normalizeChallenge,
  normalizeReceipt,
  fromPaymentauthReceipt,
  toCommerceExtensionFields,
  redactPaymentauthHeader,
} from '@peac/mappings-paymentauth';

// ---------------------------------------------------------------------------
// Mock data (inline, no network)
// ---------------------------------------------------------------------------

function toBase64url(obj: unknown): string {
  const json = JSON.stringify(obj);
  return Buffer.from(json).toString('base64url');
}

const requestPayload = { amount: '2500', currency: 'usd', recipient: 'acct_merchant' };
const requestB64 = toBase64url(requestPayload);

const challengeHeader =
  `Payment id="ch_demo_001", realm="api.example.com", ` +
  `method="stripe", intent="charge", ` +
  `expires="2025-06-01T12:05:00Z", ` +
  `request="${requestB64}"`;

const receiptPayload = {
  status: 'success',
  method: 'stripe',
  timestamp: '2025-06-01T12:01:00Z',
  reference: 'pi_demo_789',
};
const receiptB64 = toBase64url(receiptPayload);

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

console.log('=== Paymentauth Evidence Mapping Demo ===\n');

// 1. Parse challenge
const challenges = parsePaymentauthChallenges(challengeHeader);
const challenge = normalizeChallenge(challenges[0]);
console.log('Challenge ID:', challenge.id);
console.log('Method:', challenge.method);
console.log('Intent:', challenge.intent);
console.log('Decoded request:', JSON.stringify(challenge.decodedRequest));
console.log('Redacted header:', redactPaymentauthHeader(challengeHeader));
console.log();

// 2. Parse receipt
const rawReceipt = parsePaymentauthReceipt(receiptB64);
const receipt = normalizeReceipt(rawReceipt);
console.log('Receipt status:', receipt.status);
console.log('Receipt method:', receipt.method);
console.log('Receipt reference:', receipt.reference);
console.log();

// 3. Map to PaymentEvidence
const evidence = fromPaymentauthReceipt(receipt, challenge);
console.log('PaymentEvidence:');
console.log('  rail:', evidence.rail);
console.log('  reference:', evidence.reference);
console.log('  amount:', evidence.amount);
console.log('  currency:', evidence.currency);
console.log('  env:', evidence.env);
console.log();

// 4. Extract commerce extension fields
const commerceFields = toCommerceExtensionFields(receipt, challenge);
console.log('Commerce extension fields:', JSON.stringify(commerceFields, null, 2));
console.log();

console.log('=== Done ===');
