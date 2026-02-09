/**
 * Schema Benchmarks
 *
 * Measures hot-path performance for receipt parsing and normalization.
 * Run with: pnpm --filter @peac/schema bench
 */

import { describe, bench } from 'vitest';
import { parseReceiptClaims } from '../../src/receipt-parser';
import { toCoreClaims } from '../../src/normalize';

const COMMERCE_CLAIMS = {
  iss: 'https://api.example.com',
  aud: 'https://client.example.com',
  iat: 1700000000,
  exp: 1700003600,
  rid: '01234567-0123-7123-8123-0123456789ab',
  amt: 5000,
  cur: 'USD',
  payment: {
    rail: 'stripe',
    reference: 'pi_abc123',
    amount: 5000,
    currency: 'USD',
    asset: 'USD',
    env: 'test' as const,
  },
  subject: { uri: 'https://api.example.com/v1/chat' },
};

const ATTESTATION_CLAIMS = {
  iss: 'https://middleware.example.com',
  aud: 'https://api.example.com',
  iat: 1700000000,
  exp: 1700003600,
  rid: '01234567-0123-7123-8123-0123456789ab',
  sub: 'https://api.example.com/v1/inference',
};

const PARSED_COMMERCE = parseReceiptClaims(COMMERCE_CLAIMS);
const PARSED_ATTESTATION = parseReceiptClaims(ATTESTATION_CLAIMS);

describe('schema hot paths', () => {
  bench('parseReceiptClaims (commerce)', () => {
    parseReceiptClaims(COMMERCE_CLAIMS);
  });

  bench('parseReceiptClaims (attestation)', () => {
    parseReceiptClaims(ATTESTATION_CLAIMS);
  });

  bench('toCoreClaims (commerce)', () => {
    if (PARSED_COMMERCE.ok) {
      toCoreClaims(PARSED_COMMERCE);
    }
  });

  bench('toCoreClaims (attestation)', () => {
    if (PARSED_ATTESTATION.ok) {
      toCoreClaims(PARSED_ATTESTATION);
    }
  });
});
