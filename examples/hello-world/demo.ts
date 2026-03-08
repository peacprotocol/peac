/**
 * PEAC Hello World
 *
 * Generate a keypair, sign a receipt, verify it. Under 10 lines of logic.
 *
 * Run: pnpm demo
 * Standalone: npx tsx demo.ts (after npm install @peac/crypto @peac/protocol)
 */

import { generateKeypair } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';

// 1. Generate Ed25519 keypair
const { publicKey, privateKey } = await generateKeypair();

// 2. Issue a signed receipt
const { jws } = await issue({
  iss: 'https://api.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/payment',
  privateKey,
  kid: 'demo-key',
});

console.log('Receipt JWS:', jws.slice(0, 50) + '...');

// 3. Verify the receipt offline
const result = await verifyLocal(jws, publicKey);

console.log('Valid:', result.valid);
if (result.valid) {
  console.log('Issuer:', result.claims.iss);
  console.log('Kind:', result.claims.kind);
  console.log('Type:', result.claims.type);
}
