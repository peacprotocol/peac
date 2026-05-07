/**
 * Stripe x402 Crypto Payment -> PEAC Record -> Offline Verify
 *
 * Run: pnpm --filter @peac/example-stripe-x402-crypto demo
 *
 * This demo shows the full flow:
 * 1. Normalize a Stripe crypto payment intent to PEAC PaymentEvidence
 * 2. Issue a signed PEAC record carrying normalized commerce fields
 * 3. Verify the record offline (no network, no Stripe API)
 *
 * Note: PEAC records normalized commerce fields. The Stripe crypto chain context
 * (tx hash, network, recipient) lives upstream in Stripe and the underlying
 * blockchain; the signed PEAC record carries only normalized payment fields.
 */

import { fromCryptoPaymentIntent } from '@peac/rails-stripe';
import { issue, verifyLocal } from '@peac/protocol';
import { generateKeypair, derivePublicKey } from '@peac/crypto';

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
      // Privacy defaults: customer_id and metadata excluded unless opted in.
      // metadataPolicy controls how metadata is included:
      //   'omit' (default) | 'passthrough' (all, bounded) | 'allowlist' (named keys only)
      metadataPolicy: 'allowlist',
      metadataAllowedKeys: ['agent_id', 'tool_call'],
      // includeCustomerId: false (default -- excluded)
    }
  );

  console.log('    Rail:     ', payment.rail);
  console.log('    Amount:   ', payment.amount, payment.currency);
  console.log('    Asset:    ', payment.asset);
  console.log('    Network:  ', payment.network);
  console.log('    Reference:', payment.reference);
  console.log();

  // --- Step 2: Issue a signed PEAC record ---
  console.log('[2] Issuing signed PEAC record...');

  const { privateKey } = await generateKeypair();
  const publicKey = await derivePublicKey(privateKey);
  const issuerUrl = 'https://api.weather.example.com';

  const result = await issue({
    iss: issuerUrl,
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    pillars: ['commerce'],
    sub: 'https://agent.example.com',
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: payment.rail,
        amount_minor: String(payment.amount),
        currency: payment.currency,
        reference: payment.reference,
      },
    },
    privateKey,
    kid: '2026-02-13',
  });

  console.log('    JWS length:', result.jws.length, 'chars');
  console.log('    JWS prefix:', result.jws.substring(0, 40) + '...');
  console.log();

  // --- Step 3: Verify offline ---
  console.log('[3] Verifying record offline (no network)...');

  const verification = await verifyLocal(result.jws, publicKey, { issuer: issuerUrl });

  console.log('    Valid:    ', verification.valid);
  if (verification.valid) {
    const commerce = (
      verification.claims.extensions as
        | {
            'org.peacprotocol/commerce'?: {
              payment_rail?: string;
              amount_minor?: string;
              currency?: string;
            };
          }
        | undefined
    )?.['org.peacprotocol/commerce'];
    console.log('    Issuer:   ', verification.claims.iss);
    console.log('    Subject:  ', verification.claims.sub ?? '(none)');
    console.log('    Amount:   ', commerce?.amount_minor ?? '?', commerce?.currency ?? '?');
    console.log('    Rail:     ', commerce?.payment_rail ?? '?');
  }
  console.log();

  // --- Summary ---
  console.log('='.repeat(60));
  if (verification.valid) {
    console.log('SUCCESS: Record issued and verified offline.');
    console.log();
    console.log('What just happened:');
    console.log('  1. Stripe crypto payment (USDC on Base) -> normalized payment fields');
    console.log('  2. Normalized fields -> signed JWS record (Ed25519)');
    console.log('  3. JWS record -> verified with public key (no network)');
    console.log();
    console.log('Verification meaning:');
    console.log('  - The record is a signed issuer attestation of payment.');
    console.log('  - Offline verify confirms integrity + origin (Ed25519).');
    console.log('  - It does NOT confirm on-chain settlement.');
    console.log('  - Provider/chain context (tx hash, network, recipient) lives upstream');
    console.log('    in Stripe and the underlying blockchain.');
  } else {
    console.log('FAILURE: Record verification failed.');
    process.exit(1);
  }
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
