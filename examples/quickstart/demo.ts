/**
 * PEAC Quickstart Demo
 *
 * Issue a receipt and verify it locally with one package.
 * Run with: pnpm demo
 */

import { issue, verifyLocal, generateKeypair } from '@peac/protocol';

async function main() {
  console.log('PEAC Quickstart Demo\n');

  // 1. Generate a signing keypair
  console.log('1. Generating Ed25519 keypair...');
  const { privateKey, publicKey } = await generateKeypair();
  console.log('   Done.\n');

  // 2. Issue a receipt
  console.log('2. Issuing receipt...');
  const { jws } = await issue({
    iss: 'https://api.example.com',
    aud: 'https://client.example.com',
    amt: 1000,
    cur: 'USD',
    rail: 'x402',
    reference: 'tx_abc123',
    subject: 'https://api.example.com/inference/v1',
    privateKey,
    kid: 'key-2026-01',
  });
  console.log('   JWS:', jws.slice(0, 60) + '...\n');

  // 3. Verify the receipt with schema validation
  console.log('3. Verifying receipt...');
  const result = await verifyLocal(jws, publicKey, {
    issuer: 'https://api.example.com',
    audience: 'https://client.example.com',
  });

  if (result.valid) {
    const { claims } = result;
    console.log('   Signature + schema valid!\n');
    console.log('   Claims:');
    console.log('   - Issuer:', claims.iss);
    console.log('   - Audience:', claims.aud);
    console.log('   - Amount:', claims.amt, claims.cur);
    console.log('   - Rail:', claims.payment.rail);
    console.log('   - Reference:', claims.payment.reference);
    console.log('   - Receipt ID:', claims.rid);
    console.log('   - Issued at:', new Date(claims.iat * 1000).toISOString());
  } else {
    console.error('   Verification failed:', result.code, result.message);
    process.exit(1);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
