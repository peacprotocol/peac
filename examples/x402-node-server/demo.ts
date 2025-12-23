/**
 * x402 + PEAC Integration Example
 *
 * Demonstrates the full x402 payment flow with PEAC receipts:
 * 1. Client requests protected resource
 * 2. Server returns 402 with x402 v2 payment requirements
 * 3. Client pays via x402 (simulated)
 * 4. Server issues PEAC receipt proving payment
 * 5. Client verifies receipt offline
 *
 * This example simulates the flow locally - no external services required.
 *
 * For production, see: https://x402.peacprotocol.org
 */

import { issue } from '@peac/protocol';
import { generateKeypair, verify } from '@peac/crypto';
import { PEACReceiptClaims } from '@peac/schema';

// x402 v2 network identifiers (CAIP-2 format)
const X402_NETWORKS = {
  BASE_MAINNET: 'eip155:8453',
  BASE_SEPOLIA: 'eip155:84532',
  SOLANA_MAINNET: 'solana:mainnet',
} as const;

// Simulated server configuration
const CONFIG = {
  resourceUrl: 'https://api.example.com/premium/data',
  issuerUrl: 'https://payment.example.com',
  priceUsd: 50, // $0.50 in cents
  network: X402_NETWORKS.BASE_MAINNET,
  asset: 'USDC',
};

interface X402PaymentRequest {
  network: string;
  asset: string;
  amount: string;
  recipient: string;
  resource: string;
}

interface ServerResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Simulated resource server implementing x402 v2 + PEAC.
 *
 * Returns 402 with x402 v2 headers when no receipt is present.
 * Verifies receipt and returns resource when valid.
 */
async function resourceServer(
  request: { headers: Record<string, string> },
  verifyReceipt: (jws: string) => Promise<boolean>
): Promise<ServerResponse> {
  const receipt = request.headers['peac-receipt'];

  if (!receipt) {
    // Return 402 with x402 v2 headers
    // See: https://x402.org/specs for header format
    return {
      status: 402,
      headers: {
        'content-type': 'application/problem+json',
        // x402 v2 canonical header (replaces X-PAYMENT in v1)
        'payment-required': JSON.stringify({
          network: CONFIG.network,
          asset: CONFIG.asset,
          amount: CONFIG.priceUsd.toString(),
          recipient: '0x1234567890abcdef1234567890abcdef12345678',
          resource: CONFIG.resourceUrl,
        }),
        // PEAC discovery
        'peac-issuer': CONFIG.issuerUrl,
      },
      body: {
        type: 'https://peacprotocol.org/errors/payment-required',
        title: 'Payment Required',
        status: 402,
        detail: 'Pay via x402 to receive a PEAC receipt for this resource.',
        x402: {
          network: CONFIG.network,
          asset: CONFIG.asset,
          amount: CONFIG.priceUsd,
        },
      },
    };
  }

  // Verify PEAC receipt
  const valid = await verifyReceipt(receipt);
  if (!valid) {
    return {
      status: 401,
      headers: { 'content-type': 'application/problem+json' },
      body: {
        type: 'https://peacprotocol.org/errors/invalid-receipt',
        title: 'Invalid Receipt',
        status: 401,
        detail: 'The provided PEAC receipt could not be verified.',
      },
    };
  }

  // Success - return the protected resource
  return {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'peac-receipt-verified': 'true',
    },
    body: {
      data: 'Premium content unlocked via x402 payment',
      accessedAt: new Date().toISOString(),
    },
  };
}

/**
 * Simulates x402 payment and PEAC receipt issuance.
 *
 * In production:
 * - Client pays via x402 SDK (Coinbase, etc.)
 * - Server receives payment confirmation
 * - Server issues PEAC receipt with x402 evidence
 */
async function simulateX402Payment(
  paymentRequest: X402PaymentRequest,
  keys: { privateKey: Uint8Array; publicKey: Uint8Array }
): Promise<string> {
  // Simulate payment confirmation
  const paymentTxHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;

  // Issue PEAC receipt with x402 evidence
  const result = await issue({
    iss: CONFIG.issuerUrl,
    aud: paymentRequest.resource,
    amt: parseInt(paymentRequest.amount),
    cur: 'USD',
    rail: 'x402',
    reference: `x402_${Date.now()}`,
    asset: paymentRequest.asset,
    env: 'live',
    evidence: {
      // x402-specific evidence
      network: paymentRequest.network,
      tx_hash: paymentTxHash,
      recipient: paymentRequest.recipient,
      // v2 dialect marker
      x402_version: 'v2',
    },
    privateKey: keys.privateKey,
    kid: 'x402-demo-2025',
  });

  return result.jws;
}

/**
 * Client agent that handles the x402 + PEAC flow.
 */
async function agent(keys: {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  verifyReceipt: (jws: string) => Promise<boolean>;
}): Promise<void> {
  console.log('\n=== x402 + PEAC Integration Demo ===\n');
  console.log(`Resource: ${CONFIG.resourceUrl}`);
  console.log(`Network:  ${CONFIG.network}`);
  console.log(`Price:    $${(CONFIG.priceUsd / 100).toFixed(2)} ${CONFIG.asset}\n`);

  // Step 1: Request resource (no receipt)
  console.log('1. Client requests protected resource...');
  const response1 = await resourceServer({ headers: {} }, keys.verifyReceipt);

  if (response1.status === 402) {
    console.log('   -> 402 Payment Required');

    // Parse x402 v2 payment requirements
    const paymentRequired = JSON.parse(response1.headers['payment-required']) as X402PaymentRequest;
    console.log(`   -> Network: ${paymentRequired.network}`);
    console.log(`   -> Asset: ${paymentRequired.asset}`);
    console.log(`   -> Amount: ${paymentRequired.amount}`);

    // Step 2: Pay via x402 and get PEAC receipt
    console.log('\n2. Client pays via x402...');
    const receipt = await simulateX402Payment(paymentRequired, keys);
    console.log(`   -> Payment confirmed`);
    console.log(`   -> PEAC receipt issued (${receipt.length} chars)`);

    // Step 3: Retry with receipt
    console.log('\n3. Client retries with PEAC-Receipt header...');
    const response2 = await resourceServer(
      { headers: { 'peac-receipt': receipt } },
      keys.verifyReceipt
    );

    if (response2.status === 200) {
      console.log('   -> 200 OK - Access granted!');
      console.log(`   -> Data: ${JSON.stringify(response2.body)}`);
    } else {
      console.log(`   -> Unexpected: ${response2.status}`);
    }

    // Step 4: Demonstrate offline verification
    console.log('\n4. Verify receipt offline...');
    const { payload } = await verify<PEACReceiptClaims>(receipt, keys.publicKey);
    // Evidence is opaque (unknown) in v0.9 - cast for display
    const evidence = payload.payment?.evidence as Record<string, unknown> | undefined;
    console.log('   -> Receipt claims:');
    console.log(`      iss: ${payload.iss}`);
    console.log(`      aud: ${payload.aud}`);
    console.log(`      amt: ${payload.amt} ${payload.cur}`);
    console.log(`      rail: ${payload.payment?.rail}`);
    console.log(`      network: ${evidence?.network}`);
    console.log(`      tx_hash: ${evidence?.tx_hash}`);
  }

  console.log('\n=== Demo Complete ===\n');
}

// Main execution
async function main() {
  const { privateKey, publicKey } = await generateKeypair();

  const verifyReceipt = async (jws: string): Promise<boolean> => {
    try {
      const result = await verify(jws, publicKey);
      return result.valid;
    } catch {
      return false;
    }
  };

  await agent({ privateKey, publicKey, verifyReceipt });
}

main().catch(console.error);
