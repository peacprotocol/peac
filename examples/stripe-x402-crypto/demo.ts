/**
 * Stripe x402 Crypto Payment -> PEAC Receipt -> Offline Verify
 *
 * Run: pnpm --filter @peac/example-stripe-x402-crypto demo
 *
 * This demo shows the full flow:
 * 1. Normalize a Stripe crypto payment intent to PEAC PaymentEvidence
 * 2. Issue a signed PEAC receipt embedding the payment evidence
 * 3. Verify the receipt offline (no network, no Stripe API)
 */

import { fromCryptoPaymentIntent } from '@peac/rails-stripe';
import { issue, verify } from '@peac/protocol';
import { generateKeypair, derivePublicKey } from '@peac/crypto';

interface ReceiptPayload {
  iss: string;
  aud: string;
  amt: number;
  cur: string;
  rid: string;
  iat: number;
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Stripe x402 Crypto Payment -> PEAC Receipt Demo');
  console.log('='.repeat(60));
  console.log();

  // --- Step 1: Normalize crypto payment intent ---
  console.log('[1] Normalizing Stripe crypto payment intent...');

  const payment = fromCryptoPaymentIntent(
    {
      id: 'pi_3QxYz1234567890abc',
      amount: 50, // $0.50 in cents
      currency: 'usd',
      asset: 'usdc',
      network: 'eip155:8453', // Base mainnet
      tx_hash: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
      recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f1e123',
      customer: 'cus_demo123',
      metadata: {
        agent_id: 'weather-agent-v2',
        tool_call: 'get_forecast',
      },
    },
    {
      // Privacy defaults: customer_id and metadata excluded unless opted in
      includeMetadata: true, // opt in for demo purposes
      // includeCustomerId: false (default -- excluded)
    }
  );

  console.log('    Rail:     ', payment.rail);
  console.log('    Amount:   ', payment.amount, payment.currency);
  console.log('    Asset:    ', payment.asset);
  console.log('    Network:  ', payment.network);
  console.log('    Reference:', payment.reference);
  console.log();

  // --- Step 2: Issue a signed PEAC receipt ---
  console.log('[2] Issuing signed PEAC receipt...');

  const { privateKey } = await generateKeypair();
  const publicKey = await derivePublicKey(privateKey);

  const result = await issue({
    iss: 'https://api.weather.example.com',
    aud: 'https://agent.example.com',
    amt: payment.amount,
    cur: payment.currency,
    rail: payment.rail,
    reference: payment.reference,
    privateKey,
    kid: '2026-02-13',
  });

  console.log('    JWS length:', result.jws.length, 'chars');
  console.log('    JWS prefix:', result.jws.substring(0, 40) + '...');
  console.log();

  // --- Step 3: Verify offline ---
  console.log('[3] Verifying receipt offline (no network)...');

  const verification = await verify<ReceiptPayload>(result.jws, publicKey);

  console.log('    Valid:    ', verification.valid);
  console.log('    Issuer:   ', verification.payload.iss);
  console.log('    Audience: ', verification.payload.aud);
  console.log('    Amount:   ', verification.payload.amt, verification.payload.cur);
  console.log();

  // --- Summary ---
  console.log('='.repeat(60));
  if (verification.valid) {
    console.log('SUCCESS: Receipt issued and verified offline.');
    console.log();
    console.log('What just happened:');
    console.log('  1. Stripe crypto payment (USDC on Base) -> PaymentEvidence');
    console.log('  2. PaymentEvidence -> signed JWS receipt (Ed25519)');
    console.log('  3. JWS receipt -> verified with public key (no network)');
    console.log();
    console.log('Verification meaning:');
    console.log('  - The receipt is a signed issuer attestation of payment.');
    console.log('  - Offline verify confirms integrity + origin (Ed25519).');
    console.log('  - It does NOT confirm on-chain settlement.');
    console.log('  - Use tx_hash + network with an RPC endpoint for that.');
  } else {
    console.log('FAILURE: Receipt verification failed.');
    process.exit(1);
  }
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
