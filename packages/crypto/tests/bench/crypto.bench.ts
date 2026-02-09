/**
 * Crypto Benchmarks
 *
 * Measures hot-path performance for signing, verification, and key generation.
 * Run with: pnpm --filter @peac/crypto bench
 */

import { bench, describe } from 'vitest';
import { sign, verify, generateKeypair } from '../../src/index';

const PAYLOAD = {
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
};

let privateKey: Uint8Array;
let publicKey: Uint8Array;
let signedJws: string;

describe('crypto hot paths', async () => {
  // Setup: generate keys and a signed JWS for verify benchmark
  const keypair = await generateKeypair();
  privateKey = keypair.privateKey;
  publicKey = keypair.publicKey;
  signedJws = await sign(PAYLOAD, privateKey, 'bench-key');

  bench('generateKeypair', async () => {
    await generateKeypair();
  });

  bench('sign', async () => {
    await sign(PAYLOAD, privateKey, 'bench-key');
  });

  bench('verify', async () => {
    await verify(signedJws, publicKey);
  });
});
