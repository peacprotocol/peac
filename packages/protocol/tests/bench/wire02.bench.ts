/**
 * Wire 0.2 Protocol Benchmarks
 *
 * Measures Wire 0.2 issueWire02() and verifyLocal() performance using
 * registered receipt types and strict-mode verification.
 *
 * Run with: pnpm --filter @peac/protocol bench
 */

import { bench, describe } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issueWire02, verifyLocal } from '../../src/index';

describe('Wire 0.2 hot paths (registered types, strict)', async () => {
  const { privateKey, publicKey } = await generateKeypair();
  const ISS = 'https://api.example.com';
  const STRICT_OPTS = { strictness: 'strict' as const, issuer: ISS };

  // Pre-issue receipts with registered types
  const paymentResult = await issueWire02({
    iss: ISS,
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
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

  const challengeResult = await issueWire02({
    iss: ISS,
    kind: 'challenge',
    type: 'org.peacprotocol/access-decision',
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

  const accessResult = await issueWire02({
    iss: ISS,
    kind: 'evidence',
    type: 'org.peacprotocol/access-decision',
    privateKey,
    kid: 'bench-key-02',
    extensions: {
      'org.peacprotocol/access': {
        resource: 'https://api.example.com/v1/data',
        action: 'read',
        decision: 'allow',
      },
    },
  });

  const multiExtResult = await issueWire02({
    iss: ISS,
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    privateKey,
    kid: 'bench-key-02',
    sub: 'user:bench',
    pillars: ['access', 'commerce', 'consent', 'identity', 'safety'],
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: 'stripe',
        amount_minor: '5000',
        currency: 'USD',
        reference: 'pi_bench_multi',
      },
      'org.peacprotocol/access': {
        resource: 'https://api.example.com/v1/data',
        action: 'read',
        decision: 'allow',
      },
      'org.peacprotocol/consent': {
        consent_basis: 'explicit',
        consent_status: 'granted',
      },
      'org.peacprotocol/safety': {
        review_status: 'reviewed',
        risk_level: 'minimal',
      },
      'org.peacprotocol/identity': {
        proof_ref: 'sha256:abc123def456',
      },
    },
  });

  // Issue benchmarks
  bench('issueWire02 (payment)', async () => {
    await issueWire02({
      iss: ISS,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
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
      iss: ISS,
      kind: 'challenge',
      type: 'org.peacprotocol/access-decision',
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

  bench('issueWire02 (access-decision)', async () => {
    await issueWire02({
      iss: ISS,
      kind: 'evidence',
      type: 'org.peacprotocol/access-decision',
      privateKey,
      kid: 'bench-key-02',
      extensions: {
        'org.peacprotocol/access': {
          resource: 'https://api.example.com/v1/data',
          action: 'read',
          decision: 'allow',
        },
      },
    });
  });

  bench('issueWire02 (multi-extension, 5 groups)', async () => {
    await issueWire02({
      iss: ISS,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: 'bench-key-02',
      sub: 'user:bench',
      pillars: ['access', 'commerce', 'consent', 'identity', 'safety'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '5000',
          currency: 'USD',
          reference: 'pi_bench_multi',
        },
        'org.peacprotocol/access': {
          resource: 'https://api.example.com/v1/data',
          action: 'read',
          decision: 'allow',
        },
        'org.peacprotocol/consent': {
          consent_basis: 'explicit',
          consent_status: 'granted',
        },
        'org.peacprotocol/safety': {
          review_status: 'reviewed',
          risk_level: 'minimal',
        },
        'org.peacprotocol/identity': {
          proof_ref: 'sha256:abc123def456',
        },
      },
    });
  });

  // Verify benchmarks (strict mode, explicit issuer)
  bench('verifyLocal (payment, strict)', async () => {
    await verifyLocal(paymentResult.jws, publicKey, STRICT_OPTS);
  });

  bench('verifyLocal (challenge, strict)', async () => {
    await verifyLocal(challengeResult.jws, publicKey, STRICT_OPTS);
  });

  bench('verifyLocal (access-decision, strict)', async () => {
    await verifyLocal(accessResult.jws, publicKey, STRICT_OPTS);
  });

  bench('verifyLocal (multi-extension 5 groups, strict)', async () => {
    await verifyLocal(multiExtResult.jws, publicKey, STRICT_OPTS);
  });
});
