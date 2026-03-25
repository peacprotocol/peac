/**
 * Cross-ecosystem commerce evidence bundle example.
 *
 * Assembles evidence from multiple protocols into a single
 * experimental commerce bundle. Non-aggregating summary.
 *
 * Run: npx tsx examples/commerce-evidence-bundle/demo.ts
 */

import {
  createCommerceEvidenceBundle,
  addProtocolEvidence,
  addTimelineEntry,
  addReceiptRef,
  serializeCommerceBundle,
  COMMERCE_BUNDLE_VERSION,
} from '@peac/audit';

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

console.log('=== Commerce Evidence Bundle Demo ===\n');
console.log('Bundle version:', COMMERCE_BUNDLE_VERSION);
console.log();

// 1. Create bundle with transaction reference
let bundle = createCommerceEvidenceBundle({
  transaction_ref: 'txn_cross_ecosystem_demo',
});

// 2. Add paymentauth evidence
bundle = addProtocolEvidence(bundle, {
  source: 'paymentauth',
  captured_at: '2025-06-01T12:00:00Z',
  data: {
    payment_rail: 'paymentauth',
    amount_minor: '2500',
    currency: 'USD',
    reference: 'inv_demo_001',
    commerce_event: 'settlement',
  },
});

// 3. Add Stripe SPT delegation evidence
bundle = addProtocolEvidence(bundle, {
  source: 'stripe',
  captured_at: '2025-06-01T12:01:00Z',
  data: {
    payment_rail: 'stripe',
    amount_minor: '2500',
    currency: 'USD',
    spt_action: 'delegated_payment_presented',
    token_id: 'spt_tok_demo',
  },
});

// 4. Add timeline events
bundle = addTimelineEntry(bundle, {
  timestamp: '2025-06-01T11:59:00Z',
  source: 'paymentauth',
  event: 'challenge_issued',
});
bundle = addTimelineEntry(bundle, {
  timestamp: '2025-06-01T12:00:00Z',
  source: 'paymentauth',
  event: 'payment_verified',
});
bundle = addTimelineEntry(bundle, {
  timestamp: '2025-06-01T12:01:00Z',
  source: 'stripe',
  event: 'spt_presented',
});

// 5. Add receipt references
bundle = addReceiptRef(bundle, 'sha256:abc123def456...');
bundle = addReceiptRef(bundle, 'sha256:789ghi012jkl...');

// 6. Print summary (non-aggregating)
console.log('Rails observed:', bundle.rails_observed);
console.log('Timeline entries:', bundle.timeline.length);
console.log('Receipt references:', bundle.receipts.length);
console.log();

console.log('Summary (non-aggregating):');
for (const obs of bundle.summary.observed_amounts) {
  console.log(
    `  ${obs.source}: ${obs.amount} ${obs.currency}` +
      (obs.semantic_stage ? ` (${obs.semantic_stage})` : '')
  );
}
console.log('  Currencies:', bundle.summary.currencies_observed);
console.log('  Evidence count:', bundle.summary.evidence_count);
console.log();

// 7. Serialize (deterministic JSON)
const json = serializeCommerceBundle(bundle);
console.log('Serialized bundle length:', json.length, 'chars');
console.log();

console.log('=== Done ===');
