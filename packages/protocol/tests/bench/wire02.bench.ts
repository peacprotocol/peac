/**
 * Wire 0.2 Protocol Benchmarks (PR 4: Performance Benchmarks, DD-159)
 *
 * Measures Wire 0.2 issueWire02() and verifyLocal() performance.
 * Run with: pnpm --filter @peac/protocol bench
 */

import { bench, describe } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issueWire02, verifyLocal } from '../../src/index';

describe('Wire 0.2 hot paths', async () => {
  const { privateKey, publicKey } = await generateKeypair();

  // Issue a Wire 0.2 evidence receipt for benchmarking
  const evidenceResult = await issueWire02({
    iss: 'https://api.example.com',
    kind: 'evidence',
    type: 'org.peacprotocol/commerce',
    privateKey,
    kid: 'bench-key-02',
    sub: 'user:bench',
    pillars: ['commerce'],
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: 'stripe',
        amount_minor: '5000',
        currency: 'USD',
        reference: 'pi_bench_wire02',
      },
    },
  });

  // Issue a Wire 0.2 challenge receipt for benchmarking
  const challengeResult = await issueWire02({
    iss: 'https://api.example.com',
    kind: 'challenge',
    type: 'org.peacprotocol/access',
    privateKey,
    kid: 'bench-key-02',
    extensions: {
      'org.peacprotocol/challenge': {
        challenge_type: 'identity_required',
        problem: {
          status: 403,
          type: 'https://peacprotocol.org/problems/identity-required',
          title: 'Verification Required',
          detail: 'Please verify your identity to continue.',
        },
      },
    },
  });

  // Issue a minimal evidence receipt (no extensions)
  const minimalResult = await issueWire02({
    iss: 'https://api.example.com',
    kind: 'evidence',
    type: 'org.peacprotocol/access',
    privateKey,
    kid: 'bench-key-02',
  });

  bench('issueWire02 (evidence, commerce)', async () => {
    await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/commerce',
      privateKey,
      kid: 'bench-key-02',
      sub: 'user:bench',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '5000',
          currency: 'USD',
          reference: 'pi_bench_wire02',
        },
      },
    });
  });

  bench('issueWire02 (challenge)', async () => {
    await issueWire02({
      iss: 'https://api.example.com',
      kind: 'challenge',
      type: 'org.peacprotocol/access',
      privateKey,
      kid: 'bench-key-02',
      extensions: {
        'org.peacprotocol/challenge': {
          challenge_type: 'identity_required',
          problem: {
            status: 403,
            type: 'https://peacprotocol.org/problems/identity-required',
            title: 'Verification Required',
            detail: 'Please verify your identity.',
          },
        },
      },
    });
  });

  bench('issueWire02 (minimal, no extensions)', async () => {
    await issueWire02({
      iss: 'https://api.example.com',
      kind: 'evidence',
      type: 'org.peacprotocol/access',
      privateKey,
      kid: 'bench-key-02',
    });
  });

  bench('verifyLocal (Wire 0.2 evidence)', async () => {
    await verifyLocal(evidenceResult.jws, publicKey);
  });

  bench('verifyLocal (Wire 0.2 challenge)', async () => {
    await verifyLocal(challengeResult.jws, publicKey);
  });

  bench('verifyLocal (Wire 0.2 minimal)', async () => {
    await verifyLocal(minimalResult.jws, publicKey);
  });
});
