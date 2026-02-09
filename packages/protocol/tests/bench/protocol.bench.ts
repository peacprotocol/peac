/**
 * Protocol Benchmarks
 *
 * Measures end-to-end verifyLocal and issue performance.
 * Run with: pnpm --filter @peac/protocol bench
 */

import { bench, describe } from 'vitest';
import { generateKeypair, sign } from '@peac/crypto';
import { issue, verifyLocal } from '../../src/index';

const NOW = 1700000000;

describe('protocol hot paths', async () => {
  const { privateKey, publicKey } = await generateKeypair();

  const { jws: commerceJws } = await issue({
    iss: 'https://api.example.com',
    aud: 'https://client.example.com',
    amt: 5000,
    cur: 'USD',
    rail: 'stripe',
    reference: 'pi_bench',
    asset: 'USD',
    env: 'test',
    evidence: {},
    privateKey,
    kid: 'bench-key',
  });

  const attestationJws = await sign(
    {
      iss: 'https://middleware.example.com',
      aud: 'https://api.example.com',
      iat: NOW,
      exp: NOW + 3600,
      rid: '01234567-0123-7123-8123-0123456789ab',
    },
    privateKey,
    'bench-key'
  );

  bench('verifyLocal (commerce)', async () => {
    await verifyLocal(commerceJws, publicKey);
  });

  bench('verifyLocal (attestation)', async () => {
    await verifyLocal(attestationJws, publicKey, { now: NOW });
  });

  bench('issue (commerce)', async () => {
    await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 5000,
      cur: 'USD',
      rail: 'stripe',
      reference: 'pi_bench',
      asset: 'USD',
      env: 'test',
      evidence: {},
      privateKey,
      kid: 'bench-key',
    });
  });
});
