/**
 * x402 Weather Proof Demo
 *
 * Demonstrates the full x402 offer/receipt verification flow using @peac/adapter-x402:
 *
 * 1. Receive sample x402 PaymentRequired (with signed offer)
 * 2. Receive sample x402 SettlementResponse (with signed receipt)
 * 3. Verify the offer against accept terms (term-matching, not just acceptIndex)
 * 4. Verify the receipt structure
 * 5. Produce a PEAC interaction record
 * 6. Compute a stable digest for audit/dispute workflows
 *
 * This demo shows how PEAC becomes the verification and evidence layer above x402.
 *
 * Key insight: acceptIndex is UNSIGNED and cannot be trusted as a binding mechanism.
 * PEAC treats it as a hint only and performs full term-matching verification.
 */

import {
  verifyOffer,
  verifyReceipt,
  toPeacRecord,
  X402Error,
  type SignedOffer,
  type SignedReceipt,
  type AcceptEntry,
  type X402PaymentRequired,
  type X402SettlementResponse,
} from '@peac/adapter-x402';
import { jcsHash } from '@peac/crypto';

// ---------------------------------------------------------------------------
// Sample x402 Artifacts (simulating what a resource server would provide)
// ---------------------------------------------------------------------------

// Current timestamp for valid offers
const NOW = Math.floor(Date.now() / 1000);

// Accept entries advertised by the resource server
const WEATHER_API_ACCEPTS: AcceptEntry[] = [
  {
    network: 'eip155:8453', // Base mainnet
    asset: 'USDC',
    payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f1e123',
    amount: '100000', // $0.10 in minor units (6 decimals)
  },
  {
    network: 'eip155:8453',
    asset: 'ETH',
    payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f1e123',
    amount: '50000000000000', // ~$0.10 in wei
  },
];

// Signed offer from the resource server (EIP-712 format)
// In production, this would be cryptographically signed by the server's key
const WEATHER_OFFER: SignedOffer = {
  payload: {
    version: '1',
    validUntil: NOW + 3600, // Valid for 1 hour
    network: 'eip155:8453',
    asset: 'USDC',
    amount: '100000',
    payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f1e123',
  },
  // Dummy signature (65 bytes EIP-712 format) - in production this would be real
  signature: '0x' + 'ab'.repeat(32) + 'cd'.repeat(32) + '1b',
  format: 'eip712',
};

// Signed receipt from settlement (after payment confirmed on-chain)
const WEATHER_RECEIPT: SignedReceipt = {
  payload: {
    version: '1',
    network: 'eip155:8453',
    txHash: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
    // Receipt intentionally minimal per x402 spec (privacy)
    // Amount, asset, payTo are NOT in receipt - they're proven by term-matching
  },
  signature: '0x' + 'ef'.repeat(32) + '12'.repeat(32) + '1c',
  format: 'eip712',
};

// Full x402 PaymentRequired response (what client receives on 402)
const PAYMENT_REQUIRED: X402PaymentRequired = {
  accepts: WEATHER_API_ACCEPTS,
  acceptIndex: 0, // UNSIGNED hint - PEAC verifies via term-matching
  offer: WEATHER_OFFER,
  resourceUrl: 'https://api.weather.example/v1/forecast/london',
};

// Full x402 SettlementResponse (what client receives after payment)
const SETTLEMENT_RESPONSE: X402SettlementResponse = {
  receipt: WEATHER_RECEIPT,
  resourceUrl: 'https://api.weather.example/v1/forecast/london',
};

// ---------------------------------------------------------------------------
// Demo Execution
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== x402 Weather Proof Demo ===\n');
  console.log('Resource: https://api.weather.example/v1/forecast/london');
  console.log('Network:  eip155:8453 (Base)');
  console.log('Asset:    USDC');
  console.log('Amount:   $0.10 (100000 minor units)\n');

  // Step 1: Verify the signed offer
  console.log('1. Verifying signed offer against accept terms...');
  const offerResult = verifyOffer(WEATHER_OFFER, WEATHER_API_ACCEPTS, PAYMENT_REQUIRED.acceptIndex);

  if (!offerResult.valid) {
    console.log('   FAILED: Offer verification failed');
    for (const err of offerResult.errors) {
      console.log(`   - ${err.code}: ${err.message}`);
    }
    process.exit(1);
  }

  console.log('   OK: Offer verified');
  console.log(`   - Matched accept index: ${offerResult.matchedIndex}`);
  console.log(`   - Used hint: ${offerResult.usedHint}`);
  console.log(`   - Network: ${offerResult.matchedAccept?.network}`);
  console.log(`   - Asset: ${offerResult.matchedAccept?.asset}`);

  // Step 2: Verify the signed receipt
  console.log('\n2. Verifying signed receipt structure...');
  const receiptResult = verifyReceipt(WEATHER_RECEIPT);

  if (!receiptResult.valid) {
    console.log('   FAILED: Receipt verification failed');
    for (const err of receiptResult.errors) {
      console.log(`   - ${err.code}: ${err.message}`);
    }
    process.exit(1);
  }

  console.log('   OK: Receipt structure verified');
  console.log(`   - Network: ${WEATHER_RECEIPT.payload.network}`);
  console.log(`   - txHash: ${WEATHER_RECEIPT.payload.txHash?.slice(0, 20)}...`);

  // Step 3: Demonstrate acceptIndex-as-hint behavior
  console.log('\n3. Testing acceptIndex as UNTRUSTED hint...');

  // Try with wrong acceptIndex - should fail on term-match
  const wrongIndexResult = verifyOffer(WEATHER_OFFER, WEATHER_API_ACCEPTS, 1);
  if (!wrongIndexResult.valid) {
    const termMismatch = wrongIndexResult.errors.find((e) => e.code === 'accept_term_mismatch');
    if (termMismatch) {
      console.log('   OK: Wrong acceptIndex correctly rejected via term-matching');
      console.log(`   - Error: ${termMismatch.message}`);
    }
  }

  // Try without acceptIndex - should find match via scan
  const scanResult = verifyOffer(WEATHER_OFFER, WEATHER_API_ACCEPTS);
  if (scanResult.valid) {
    console.log('   OK: Offer verified without acceptIndex (full scan)');
    console.log(`   - Found match at index: ${scanResult.matchedIndex}`);
  }

  // Step 4: Produce PEAC interaction record
  console.log('\n4. Generating PEAC interaction record...');
  const peacRecord = toPeacRecord(PAYMENT_REQUIRED, SETTLEMENT_RESPONSE);

  console.log('   Record version:', peacRecord.version);
  console.log('   Evidence fields (from signed payloads):');
  console.log(`   - network: ${peacRecord.evidence.network}`);
  console.log(`   - asset: ${peacRecord.evidence.asset}`);
  console.log(`   - amount: ${peacRecord.evidence.amount}`);
  console.log(`   - payee: ${peacRecord.evidence.payee?.slice(0, 20)}...`);
  console.log(`   - txHash: ${peacRecord.evidence.txHash?.slice(0, 20)}...`);
  console.log('   Hints (unsigned, untrusted):');
  if (peacRecord.hints.acceptIndex) {
    console.log(`   - acceptIndex: ${peacRecord.hints.acceptIndex.value}`);
    console.log(`   - untrusted: ${peacRecord.hints.acceptIndex.untrusted}`);
  }

  // Step 5: Compute stable digest for audit
  console.log('\n5. Computing stable digest (JCS+SHA-256)...');
  const digest = await jcsHash(peacRecord);
  console.log(`   Digest: 0x${digest}`);
  console.log('   (Deterministic - same inputs always produce same hash)');

  // Output full record as JSON
  console.log('\n6. Full PEAC Record JSON:');
  console.log('---');
  console.log(JSON.stringify(peacRecord, null, 2));
  console.log('---');

  // Summary
  console.log('\n=== Summary ===');
  console.log('');
  console.log('x402 provides: Signed offers and receipts (payment proof)');
  console.log('PEAC provides: Verification, evidence normalization, audit digests');
  console.log('');
  console.log('Key security property:');
  console.log('acceptIndex is OUTSIDE the signed payload (unsigned envelope field).');
  console.log('PEAC treats it as a hint only and verifies via term-matching.');
  console.log('This makes the unsigned placement irrelevant for security.');
  console.log('');
  console.log('=== Demo Complete ===\n');
}

// Error handling wrapper
main().catch((err) => {
  if (err instanceof X402Error) {
    console.error(`\nX402 Error [${err.code}]: ${err.message}`);
    if (err.field) console.error(`Field: ${err.field}`);
    process.exit(1);
  }
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
