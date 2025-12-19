/**
 * Pay-Per-Inference Example
 *
 * Demonstrates the core PEAC receipt flow:
 * 1. Agent makes request to resource
 * 2. Resource returns 402 Payment Required
 * 3. Agent obtains receipt (simulated payment)
 * 4. Agent retries with receipt
 * 5. Resource verifies receipt and grants access
 *
 * This example uses local stubs - no external services required.
 */

import { issue } from '@peac/protocol';
import { generateKeypair, verify, canonicalize } from '@peac/crypto';
import { toCoreClaims, PEACReceiptClaims } from '@peac/schema';

// Simulated resource server state
const RESOURCE_URL = 'https://api.example.com/inference/gpt-4';
const ISSUER_URL = 'https://payment.example.com';
const PRICE_CENTS = 100; // $1.00 per inference

interface ResourceResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Simulated resource server that requires payment.
 */
async function resourceServer(
  request: { headers: Record<string, string> },
  verifyReceipt: (jws: string) => Promise<boolean>
): Promise<ResourceResponse> {
  const receipt = request.headers['peac-receipt'];

  if (!receipt) {
    // No receipt - return 402 with payment requirements
    return {
      status: 402,
      headers: {
        'content-type': 'application/problem+json',
        'peac-price': `${PRICE_CENTS}`,
        'peac-currency': 'USD',
        'peac-issuer': ISSUER_URL,
      },
      body: {
        type: 'https://peacprotocol.org/errors/payment-required',
        title: 'Payment Required',
        status: 402,
        detail: 'A valid PEAC receipt is required to access this resource.',
        price: { amount: PRICE_CENTS, currency: 'USD' },
        issuer: ISSUER_URL,
      },
    };
  }

  // Verify receipt
  const valid = await verifyReceipt(receipt);
  if (!valid) {
    return {
      status: 401,
      headers: { 'content-type': 'application/problem+json' },
      body: {
        type: 'https://peacprotocol.org/errors/invalid-receipt',
        title: 'Invalid Receipt',
        status: 401,
        detail: 'The provided receipt could not be verified.',
      },
    };
  }

  // Success - return inference result
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: {
      result: 'Hello! I am a simulated GPT-4 response.',
      tokens_used: 42,
    },
  };
}

/**
 * Simulated payment service that issues receipts.
 */
async function paymentService(params: {
  resource: string;
  amount: number;
  currency: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}): Promise<string> {
  const result = await issue({
    iss: ISSUER_URL,
    aud: params.resource,
    amt: params.amount,
    cur: params.currency,
    rail: 'demo',
    reference: `demo_${Date.now()}`,
    asset: params.currency,
    env: 'test',
    evidence: { demo: true },
    privateKey: params.privateKey,
    kid: 'demo-key-2025',
  });

  return result.jws;
}

/**
 * Agent that handles 402 responses and obtains receipts.
 */
async function agent(params: {
  resourceUrl: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  verifyReceipt: (jws: string) => Promise<boolean>;
}): Promise<void> {
  console.log('\n=== PEAC Pay-Per-Inference Demo ===\n');

  // Step 1: Make initial request (no receipt)
  console.log('1. Agent requests resource (no receipt)...');
  const response1 = await resourceServer({ headers: {} }, params.verifyReceipt);

  if (response1.status === 402) {
    console.log(`   -> 402 Payment Required`);
    console.log(
      `   -> Price: ${response1.headers['peac-price']} ${response1.headers['peac-currency']}`
    );
    console.log(`   -> Issuer: ${response1.headers['peac-issuer']}`);

    // Step 2: Obtain receipt from payment service
    console.log('\n2. Agent obtains receipt from payment service...');
    const receipt = await paymentService({
      resource: params.resourceUrl,
      amount: parseInt(response1.headers['peac-price']),
      currency: response1.headers['peac-currency'],
      privateKey: params.privateKey,
      publicKey: params.publicKey,
    });
    console.log(`   -> Receipt obtained (${receipt.length} chars)`);

    // Step 3: Retry with receipt
    console.log('\n3. Agent retries with receipt...');
    const response2 = await resourceServer(
      { headers: { 'peac-receipt': receipt } },
      params.verifyReceipt
    );

    if (response2.status === 200) {
      console.log(`   -> 200 OK - Access granted!`);
      console.log(`   -> Response: ${JSON.stringify(response2.body)}`);
    } else {
      console.log(`   -> Unexpected status: ${response2.status}`);
    }

    // Step 4: Demonstrate toCoreClaims normalization
    console.log('\n4. Demonstrating toCoreClaims() normalization...');
    const { payload } = await verify<PEACReceiptClaims>(receipt, params.publicKey);
    const core = toCoreClaims(payload);
    const canonical = canonicalize(core);
    console.log('   -> Core claims (normalized):');
    console.log(`      iss: ${core.iss}`);
    console.log(`      aud: ${core.aud}`);
    console.log(`      amt: ${core.amt} ${core.cur}`);
    console.log(`      payment.rail: ${core.payment.rail}`);
    console.log(`   -> Canonical JCS (${canonical.length} bytes)`);
  }

  console.log('\n=== Demo Complete ===\n');
}

// Main execution
async function main() {
  // Generate keypair for demo
  const { privateKey, publicKey } = await generateKeypair();

  // Create verifier function
  const verifyReceipt = async (jws: string): Promise<boolean> => {
    try {
      const result = await verify(jws, publicKey);
      return result.valid;
    } catch {
      return false;
    }
  };

  // Run agent
  await agent({
    resourceUrl: RESOURCE_URL,
    privateKey,
    publicKey,
    verifyReceipt,
  });
}

main().catch(console.error);
