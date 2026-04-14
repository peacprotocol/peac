/**
 * x402 upto -> settlement proof -> PEAC commerce evidence demo.
 *
 * Offline, no network. Shows the full lane: (1) upstream x402 response
 * headers carry a settlement proof, (2) PEAC extracts the proof in
 * dual-header precedence order, (3) fromX402SettlementObservation
 * produces commerce.event=settlement evidence only when an explicit
 * non-empty proof is supplied. Also demonstrates the negative path:
 * offer-only data (empty proof) rejects in every strictness mode.
 *
 * Run: npx tsx examples/x402-upto-evidence/demo.ts
 */

import {
  extractSettlementProofFromHeaders,
  fromX402SettlementObservation,
} from '@peac/adapter-x402';
import { MapperBoundaryError } from '@peac/adapter-core';

function section(title: string): void {
  console.log(`\n=== ${title} ===\n`);
}

// ---------------------------------------------------------------------------
// 1. Happy path: x402 v2 response header carries a settlement proof
// ---------------------------------------------------------------------------
section('1. Extract settlement proof from response headers (dual-header order)');

const responseHeaders = {
  'PAYMENT-RESPONSE': 'eyJvcGFxdWUudjI.settlement-bytes',
  'X-PAYMENT-RESPONSE': 'legacy-v1-bytes',
};
const proofs = extractSettlementProofFromHeaders(responseHeaders);
console.log(`Extracted ${proofs.length} proof(s) in precedence order:`);
for (const p of proofs) {
  console.log(`  - source=${p.source} wire=${p.wire_version} bytes=${p.raw_value.slice(0, 24)}...`);
}

// ---------------------------------------------------------------------------
// 2. Map the v2 proof to PEAC settlement evidence (upto scheme passthrough)
// ---------------------------------------------------------------------------
section('2. Map the v2 proof to PEAC commerce evidence (upto scheme)');

const v2Proof = proofs[0]!;
const evidence = fromX402SettlementObservation({
  proof: v2Proof,
  scheme: 'upto',
  network: 'base-sepolia',
  asset: '0xUSDC',
  currency: 'USD',
  amount_minor: '2500',
  env: 'live',
  pay_to: '0xRecipientDemo',
  facilitator: 'cdp.coinbase',
  offer_reference: 'offer_demo_001',
});
console.log(`rail:            ${evidence.rail}`);
console.log(`amount (minor):  ${evidence.amount}`);
console.log(`currency:        ${evidence.currency}`);
console.log(`commerce.event:  ${evidence.evidence.commerce_event}`);
console.log(`scheme:          ${evidence.evidence.x402_scheme}`);
console.log(`network:         ${evidence.evidence.x402_network}`);
console.log(`proof.source:    ${evidence.evidence.proofs.x402.settlement.source}`);
console.log(
  `proof preserved: ${evidence.evidence.proofs.x402.settlement.raw_value.slice(0, 24)}...`
);

// ---------------------------------------------------------------------------
// 3. Negative path: offer-only data MUST NOT produce settlement evidence
// ---------------------------------------------------------------------------
section('3. Negative path: offer-only (empty raw_value) rejected in ALL modes');

const offerOnly = { source: 'PEAC-Receipt' as const, wire_version: 'peac' as const, raw_value: '' };
for (const mode of ['strict', 'interop', 'legacy'] as const) {
  try {
    fromX402SettlementObservation(
      {
        proof: offerOnly,
        scheme: 'upto',
        network: 'base-sepolia',
        asset: '0xUSDC',
        currency: 'USD',
        amount_minor: '2500',
        env: 'live',
      },
      { mode }
    );
    console.log(`  mode=${mode}: UNEXPECTED pass (rule 1 should reject)`);
  } catch (err) {
    if (err instanceof MapperBoundaryError) {
      console.log(`  mode=${mode}: rejected (${err.code}) at pointer ${err.pointer}`);
    } else {
      throw err;
    }
  }
}

console.log('\nDone.');
