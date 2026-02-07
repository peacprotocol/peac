/**
 * RSL Collective Integration Example
 *
 * Demonstrates:
 * 1. RSL signal/license mapping to PEAC ControlPurpose
 * 2. Receipt issuance with RSL-derived control blocks
 * 3. Core claims parity - same semantic content produces identical JCS output
 *
 * This example shows what is NORMATIVE (spec-required) vs ILLUSTRATIVE (example-only).
 */

import { issue } from '@peac/protocol';
import { generateKeypair, canonicalize } from '@peac/crypto';
import { toCoreClaims, type ControlBlock } from '@peac/schema';
import {
  rslUsageTokensToControlPurposes,
  getKnownRslTokens,
  type RslUsageToken,
} from '@peac/mappings-rsl';
import { fromACPCheckoutSuccess } from '@peac/mappings-acp';

console.log('\n=== RSL Collective Integration Demo ===\n');

// ============================================================================
// NORMATIVE: RSL 1.0 Token Vocabulary
// ============================================================================
console.log('1. RSL 1.0 Token Vocabulary (NORMATIVE)\n');
console.log('   Known RSL 1.0 tokens:');
for (const token of getKnownRslTokens()) {
  const result = rslUsageTokensToControlPurposes([token]);
  console.log(`   - ${token} -> ${JSON.stringify(result.purposes)}`);
}
console.log('\n   NORMATIVE: These are the only valid RSL 1.0 tokens.');
console.log('   Unknown tokens produce warnings but do not throw.\n');

// ============================================================================
// ILLUSTRATIVE: RSL-derived control block in receipt
// ============================================================================
console.log('2. RSL-Derived Control Block (ILLUSTRATIVE)\n');

async function demonstrateRslReceipt() {
  const { privateKey } = await generateKeypair();

  // Publisher allows ai-train and ai-input via RSL
  const rslTokens: RslUsageToken[] = ['ai-train', 'ai-input'];
  const { purposes } = rslUsageTokensToControlPurposes(rslTokens);

  console.log(`   RSL tokens: ${JSON.stringify(rslTokens)}`);
  console.log(`   Mapped purposes: ${JSON.stringify(purposes)}`);

  // Build control block with RSL-derived purpose
  // ILLUSTRATIVE: This structure is one way to represent RSL intent
  const control: ControlBlock = {
    chain: [
      {
        engine: 'rsl',
        result: 'allow',
        purpose: purposes[0], // Primary purpose
        // These fields are metadata (stripped by toCoreClaims):
        policy_id: 'rsl-license-v1',
        reason: `RSL tokens: ${rslTokens.join(', ')}`,
      },
    ],
    decision: 'allow',
    combinator: 'any_can_veto',
  };

  // Issue receipt with control block
  const result = await issue({
    iss: 'https://publisher.example.com',
    aud: 'https://api.example.com/content/article-123',
    amt: 500,
    cur: 'USD',
    rail: 'stripe',
    reference: 'cs_rsl_demo_123',
    asset: 'USD',
    env: 'test',
    evidence: { license_type: 'rsl' },
    privateKey,
    kid: 'demo-key-2025',
    ext: { control },
  });

  console.log(`\n   Receipt issued (${result.jws.split('.')[1].length} bytes payload)`);
  return result.jws;
}

// ============================================================================
// NORMATIVE: Core Claims Parity
// ============================================================================
console.log('3. Core Claims Parity (NORMATIVE)\n');

async function demonstrateParity() {
  const { privateKey } = await generateKeypair();

  // Common semantic content
  const AMOUNT = 1000;
  const CURRENCY = 'USD';
  const RESOURCE = 'https://api.example.com/content/article-456';

  // Receipt A: Via ACP mapping (Stripe rail)
  const acpEvent = {
    checkout_id: 'checkout_acp_parity',
    resource_uri: RESOURCE,
    total_amount: AMOUNT,
    currency: CURRENCY,
    payment_rail: 'stripe',
    payment_reference: 'cs_acp_parity_123',
  };
  const acpInput = fromACPCheckoutSuccess(acpEvent);

  const resultA = await issue({
    iss: 'https://issuer.example.com',
    aud: RESOURCE,
    amt: acpInput.amt,
    cur: acpInput.cur,
    rail: acpInput.payment.rail,
    reference: acpInput.payment.reference,
    asset: acpInput.payment.asset,
    env: acpInput.payment.env,
    evidence: acpInput.payment.evidence, // ACP-specific evidence
    privateKey,
    kid: 'demo-key-2025',
  });

  // Receipt B: Direct issuance (same semantic content, different evidence)
  const resultB = await issue({
    iss: 'https://issuer.example.com',
    aud: RESOURCE,
    amt: AMOUNT,
    cur: CURRENCY,
    rail: 'stripe',
    reference: 'cs_direct_parity_456', // Different reference
    asset: CURRENCY,
    env: 'live', // Different env
    evidence: { direct_issue: true, timestamp: Date.now() }, // Different evidence
    privateKey,
    kid: 'demo-key-2025',
  });

  // Decode payloads
  const payloadA = JSON.parse(
    Buffer.from(resultA.jws.split('.')[1], 'base64url').toString('utf-8')
  );
  const payloadB = JSON.parse(
    Buffer.from(resultB.jws.split('.')[1], 'base64url').toString('utf-8')
  );

  // Extract core claims
  const coreA = toCoreClaims(payloadA);
  const coreB = toCoreClaims(payloadB);

  console.log('   Receipt A (via ACP mapping):');
  console.log(`     iss: ${coreA.iss}`);
  console.log(`     aud: ${coreA.aud}`);
  console.log(`     amt: ${coreA.amt} ${coreA.cur}`);
  console.log(`     payment.rail: ${coreA.payment?.rail}`);
  console.log(`     payment.reference: ${coreA.payment?.reference}`);

  console.log('\n   Receipt B (direct issuance):');
  console.log(`     iss: ${coreB.iss}`);
  console.log(`     aud: ${coreB.aud}`);
  console.log(`     amt: ${coreB.amt} ${coreB.cur}`);
  console.log(`     payment.rail: ${coreB.payment?.rail}`);
  console.log(`     payment.reference: ${coreB.payment?.reference}`);

  // Normalize for comparison (remove unique fields)
  const normalizedA = {
    ...coreA,
    rid: 'NORMALIZED',
    iat: 0,
    payment: { ...coreA.payment, reference: 'NORMALIZED' },
  };
  const normalizedB = {
    ...coreB,
    rid: 'NORMALIZED',
    iat: 0,
    payment: { ...coreB.payment, reference: 'NORMALIZED' },
  };

  const canonicalA = canonicalize(normalizedA);
  const canonicalB = canonicalize(normalizedB);

  console.log('\n   NORMATIVE: After normalizing unique fields (rid, iat, reference):');
  console.log(`     Canonical A: ${canonicalA.length} bytes`);
  console.log(`     Canonical B: ${canonicalB.length} bytes`);
  console.log(`     Byte-identical: ${canonicalA === canonicalB}`);

  if (canonicalA === canonicalB) {
    console.log('\n   PARITY VERIFIED: Same semantic content -> identical JCS output');
  } else {
    console.log('\n   PARITY FAILED: This should not happen!');
    console.log(`     A: ${canonicalA}`);
    console.log(`     B: ${canonicalB}`);
  }
}

// ============================================================================
// NORMATIVE: Evidence Isolation
// ============================================================================
console.log('4. Evidence Isolation (NORMATIVE)\n');
console.log('   toCoreClaims() strips rail-specific evidence.');
console.log('   This ensures receipts from different sources can be compared.');
console.log('   Evidence is preserved in the original receipt for audit/dispute.\n');

// Run demos
async function main() {
  await demonstrateRslReceipt();
  console.log('');
  await demonstrateParity();
  console.log('\n=== Demo Complete ===\n');
}

main().catch(console.error);
