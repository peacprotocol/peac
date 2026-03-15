/**
 * PEAC Quickstart Demo
 *
 * Issue a receipt and verify it locally with one package.
 * Run with: pnpm demo
 */

import { issue, verifyLocal, isWire02Result, generateKeypair } from '@peac/protocol';

async function main() {
  console.log('PEAC Quickstart Demo\n');

  // 1. Generate a signing keypair
  console.log('1. Generating Ed25519 keypair...');
  const { privateKey, publicKey } = await generateKeypair();
  console.log('   Done.\n');

  // 2. Issue a receipt
  // First-party evidence types require their mapped extension group
  // in strict verification (e.g., payment requires commerce extension).
  console.log('2. Issuing receipt...');
  const { jws } = await issue({
    iss: 'https://api.example.com',
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    sub: 'https://api.example.com/inference/v1',
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: 'stripe',
        amount_minor: '1000',
        currency: 'USD',
      },
    },
    privateKey,
    kid: 'key-2026-01',
  });
  console.log('   JWS:', jws.slice(0, 60) + '...\n');

  // 3. Verify the receipt with schema validation
  console.log('3. Verifying receipt...');
  const result = await verifyLocal(jws, publicKey, {
    issuer: 'https://api.example.com',
  });

  if (isWire02Result(result)) {
    const { claims } = result;
    console.log('   Signature + schema valid!\n');
    console.log('   Claims:');
    console.log('   - Issuer:', claims.iss);
    console.log('   - Kind:', claims.kind);
    console.log('   - Type:', claims.type);
    console.log('   - Issued at:', new Date(claims.iat * 1000).toISOString());
    console.log('   - JTI:', claims.jti);
  } else if (!result.valid) {
    console.error('   Verification failed:', result.code, result.message);
    process.exit(1);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
