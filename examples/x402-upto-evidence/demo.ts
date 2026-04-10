/**
 * x402 upto Evidence Preservation Demo
 *
 * Demonstrates how @peac/adapter-x402 handles the upstream x402 `upto` scheme
 * as pure evidence capture. PEAC preserves the scheme identifier and the raw
 * signed artifacts; it does NOT interpret or enforce scheme-specific
 * invariants such as single-use authorization, time bounds, recipient
 * binding, facilitator binding, or max-vs-actual settlement correctness.
 *
 * The story in plain terms:
 *
 *   1. A resource server offers a metered API at up to USDC 100000 per call
 *      using the x402 `upto` scheme.
 *   2. The payer (agent) authorizes that maximum.
 *   3. The facilitator settles for an actual charged amount below the
 *      authorized maximum (for example USDC 42000).
 *   4. PEAC consumes the offer and the receipt, verifies term-matching and
 *      wire shape, and produces a canonical interaction record.
 *   5. The record preserves the `scheme: "upto"` identifier and both amounts
 *      (authorized maximum and actual charged) in the raw artifacts under
 *      `proofs.x402`, available for downstream audit.
 *
 * What this demo PROVES:
 *   - PEAC term-matches scheme as a required string
 *   - PEAC preserves the full raw signed offer and receipt for audit
 *   - PEAC does not mutate or normalize the scheme identifier
 *
 * What this demo does NOT prove:
 *   - That the upto single-use invariant is enforced (scheme layer)
 *   - That the authorized maximum is enforced on-chain (scheme layer)
 *   - That the actual charged amount is within the authorized maximum
 *     (scheme layer, on-chain)
 *   - That the facilitator is authorized (scheme layer, on-chain)
 *
 * No network calls. No crypto spend. This is fixture-backed.
 *
 * See docs/compatibility/x402-scheme-coverage.md for the full truth matrix.
 */

import {
  verifyOffer,
  verifyReceipt,
  toPeacRecord,
  type SignedOffer,
  type SignedReceipt,
  type AcceptEntry,
  type X402OfferReceiptChallenge,
  type X402SettlementResponse,
  type RawEIP712SignedOffer,
} from '@peac/adapter-x402';

// ---------------------------------------------------------------------------
// Sample x402 upto artifacts
// ---------------------------------------------------------------------------

const NOW = Math.floor(Date.now() / 1000);
const RESOURCE_URL = 'https://api.example.com/metered/inference';

// The resource server advertises an upto accept entry. The payer may
// authorize up to the listed maximum amount.
const METERED_ACCEPTS: AcceptEntry[] = [
  {
    scheme: 'upto',
    network: 'eip155:8453',
    asset: 'USDC',
    payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f1e123',
    amount: '100000', // USDC 0.10 authorized maximum (6 decimals)
  },
];

// Signed offer from the resource server (EIP-712 format). In production,
// this would be cryptographically signed by the server's key.
const METERED_OFFER: RawEIP712SignedOffer = {
  format: 'eip712',
  payload: {
    version: 1,
    validUntil: NOW + 3600,
    network: 'eip155:8453',
    asset: 'USDC',
    amount: '100000', // authorized maximum
    payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f1e123',
    resourceUrl: RESOURCE_URL,
    scheme: 'upto',
  },
  signature: '0x' + 'ab'.repeat(32) + 'cd'.repeat(32) + '1b',
  acceptIndex: 0,
};

// The x402 challenge envelope
const CHALLENGE: X402OfferReceiptChallenge = {
  accepts: METERED_ACCEPTS,
  offers: [METERED_OFFER],
  resourceUrl: RESOURCE_URL,
};

// The settlement receipt. Note: the actual charged amount (42000) is below
// the authorized maximum (100000). PEAC preserves both values in the raw
// artifacts without auditing the delta - that is a scheme-layer concern.
const SETTLEMENT: X402SettlementResponse = {
  receipt: {
    format: 'eip712',
    payload: {
      version: 1,
      network: 'eip155:8453',
      resourceUrl: RESOURCE_URL,
      payer: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      issuedAt: NOW - 5,
      transaction: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
      // The actual charged amount is carried in the raw receipt payload
      // (if the specific scheme chose to carry it there). PEAC does not
      // interpret this field; it is preserved verbatim for downstream audit.
    },
    signature: '0x' + 'ee'.repeat(32) + 'ff'.repeat(32) + '1b',
  },
  resourceUrl: RESOURCE_URL,
};

// The actual charged amount (as reported by the facilitator / settlement
// layer). In a real flow this would come from on-chain settlement data.
// PEAC does not verify this value; we log it here only to illustrate the
// authorized-vs-actual reasoning an auditor would perform on top of the
// PEAC record.
const ACTUAL_CHARGED_AMOUNT = '42000'; // USDC 0.042

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

function log(label: string, value: unknown): void {
  console.log(`${label}:`, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  console.log('=== x402 upto Evidence Preservation Demo ===\n');

  // 1. Verify the offer (term-matching + wire shape)
  console.log('1. Verifying offer...');
  const offerResult = verifyOffer(METERED_OFFER, METERED_ACCEPTS);
  if (!offerResult.valid) {
    console.error('   FAIL: offer verification returned errors:', offerResult.errors);
    process.exit(1);
  }
  log('   Valid', offerResult.valid);
  log('   Matched accept index', offerResult.matchedIndex);
  log('   Used hint', offerResult.usedHint);

  // 2. Verify the receipt (wire shape only)
  console.log('\n2. Verifying receipt...');
  const receiptResult = verifyReceipt(SETTLEMENT.receipt);
  if (!receiptResult.valid) {
    console.error('   FAIL: receipt verification returned errors:', receiptResult.errors);
    process.exit(1);
  }
  log('   Valid', receiptResult.valid);

  // 3. Produce a PEAC interaction record
  console.log('\n3. Producing PEAC interaction record...');
  const record = toPeacRecord(CHALLENGE, SETTLEMENT, {
    offerVerification: offerResult,
  });

  // 4. Confirm scheme preservation in the raw artifact
  console.log('\n4. Scheme preservation check:');
  const rawOffer = record.proofs.x402.offer as RawEIP712SignedOffer;
  log('   proofs.x402.offer.payload.scheme', rawOffer.payload.scheme);
  log('   proofs.x402.offer.payload.amount (authorized maximum)', rawOffer.payload.amount);
  if (rawOffer.payload.scheme !== 'upto') {
    console.error('   FAIL: scheme identifier was mutated by the adapter');
    process.exit(1);
  }

  // 5. Evidence flat-view (note: v1 evidence does NOT carry scheme; see docs)
  console.log('\n5. Flattened evidence (v1 path):');
  log('   resourceUrl', record.evidence.resourceUrl);
  log('   network', record.evidence.network);
  log('   asset', record.evidence.asset);
  log('   amount (authorized maximum, flattened)', record.evidence.amount);
  log('   payer', record.evidence.payer);
  console.log(
    '   Note: v1 evidence flat-view does NOT include scheme. Read scheme from proofs.x402.offer.'
  );

  // 6. Authorized vs actual (the scheme-layer reasoning PEAC does NOT perform)
  console.log('\n6. Authorized vs actual (informational only):');
  log('   Authorized maximum (from signed offer)', rawOffer.payload.amount);
  log('   Actual charged (from facilitator/chain, out-of-band)', ACTUAL_CHARGED_AMOUNT);
  console.log('   PEAC does NOT audit the authorized-vs-actual delta. That is an x402');
  console.log('   scheme-layer concern enforced on-chain or by the facilitator. PEAC');
  console.log('   preserves both values for downstream auditors, nothing more.');

  console.log('\n=== PASS: upto evidence preserved end-to-end ===');
  console.log('\nWhat this demo proves:');
  console.log('  - PEAC term-matches the scheme identifier as a required string');
  console.log('  - PEAC preserves the raw signed artifact verbatim at proofs.x402.offer');
  console.log('  - PEAC does not mutate or normalize the scheme identifier');
  console.log('\nWhat this demo does not prove:');
  console.log('  - upto single-use invariant (scheme layer, on-chain)');
  console.log('  - max-amount enforcement (scheme layer, on-chain)');
  console.log('  - actual charged amount is within authorized maximum (scheme layer)');
  console.log('  - facilitator authorization (scheme layer, on-chain)');
  console.log('\nSee docs/compatibility/x402-scheme-coverage.md for the full truth matrix.');
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
