/**
 * Minimal Issuance Example
 *
 * Issues an evidence receipt with commerce extension,
 * verifies it locally, and prints the result.
 */

import { generateKeypair } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';
import { getCommerceExtension } from '@peac/schema';

async function main() {
  // Generate Ed25519 keypair
  const { privateKey, publicKey } = await generateKeypair();
  const kid = new Date().toISOString();

  // Issue an evidence receipt
  const { jws } = await issue({
    iss: 'https://api.example.com',
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    pillars: ['commerce'],
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: 'x402',
        amount_minor: '1000',
        currency: 'USD',
      },
    },
    privateKey,
    kid,
  });

  console.log('Issued receipt');
  console.log('JWS length:', jws.length);

  // Verify locally
  const result = await verifyLocal(jws, publicKey);

  if (result.valid && result.variant === 'wire-02') {
    console.log('Verification:', result.valid ? 'VALID' : 'INVALID');
    console.log('Wire version:', result.wireVersion);
    console.log('Kind:', result.claims.kind);
    console.log('Type:', result.claims.type);
    console.log('Policy binding:', result.policy_binding);
    console.log('Warnings:', result.warnings.length === 0 ? 'none' : result.warnings);

    // Use typed accessor
    const commerce = getCommerceExtension(result.claims);
    if (commerce) {
      console.log('Commerce extension:');
      console.log('  Payment rail:', commerce.payment_rail);
      console.log('  Amount (minor):', commerce.amount_minor);
      console.log('  Currency:', commerce.currency);
    }
  } else {
    console.log('Verification failed:', result);
  }
}

main().catch(console.error);
