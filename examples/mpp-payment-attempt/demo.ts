/**
 * MPP / paymentauth payment-attempt + settlement -> PEAC commerce evidence.
 *
 * Offline, no network. Shows the full lane: (1) a paymentauth-aware
 * payment surface produces a payment-attempt artifact with an optional
 * facilitator attestation; (2) PEAC records the attempt via
 * fromMPPPaymentAttempt, emitting commerce.event=authorization;
 * (3) a separate settlement attestation arrives and PEAC records it via
 * fromMPPSettlement with commerce.event=settlement; (4) the
 * artifact_kind discriminator prevents cross-kind misuse.
 *
 * Run: npx tsx examples/mpp-payment-attempt/demo.ts
 */

import {
  fromMPPPaymentAttempt,
  fromMPPSettlement,
  type MPPPaymentAttemptInput,
  type MPPSettlementInput,
} from '@peac/mappings-paymentauth';
import { MapperBoundaryError } from '@peac/adapter-core';

/** Narrow view over the JsonObject evidence field for demo logging. */
type DemoEvidence = {
  commerce_event?: string;
  challenge_id?: string;
  paymentauth_attempt_id?: string;
};

function section(title: string): void {
  console.log(`\n=== ${title} ===\n`);
}

// ---------------------------------------------------------------------------
// 1. Payment-attempt observation (authorization)
// ---------------------------------------------------------------------------
section('1. Payment-attempt observation (artifact_kind=authorization)');

const attempt: MPPPaymentAttemptInput = {
  attempt_id: 'att_demo_001',
  currency: 'USD',
  amount_minor: '2500',
  env: 'live',
  payment_token_ref: 'tok_ref_opaque_demo',
  artifact_kind: 'authorization',
  facilitator_attestation: {
    signer: 'facilitator.example',
    signed_at: '2026-05-01T10:00:00Z',
    signature: 'opaque-bytes-facilitator',
  },
  upstream_artifact: {
    source: 'paymentauth.attempt.v1',
    attempt_token: 'eyJvcGFxdWUuYXR0ZW1wdA...',
  },
  challenge_id: 'ch_demo_001',
};

const attemptEvidence = fromMPPPaymentAttempt(attempt);
console.log(`rail:            ${attemptEvidence.rail}`);
console.log(`amount (minor):  ${attemptEvidence.amount}`);
console.log(`currency:        ${attemptEvidence.currency}`);
const attemptEv = attemptEvidence.evidence as DemoEvidence;
console.log(`commerce.event:  ${attemptEv.commerce_event}`);
console.log(`challenge_id:    ${attemptEv.challenge_id}`);

// ---------------------------------------------------------------------------
// 2. Settlement observation (requires artifact_kind=settlement)
// ---------------------------------------------------------------------------
section('2. Settlement observation (artifact_kind=settlement)');

const settlement: MPPSettlementInput = {
  settlement_id: 'set_demo_001',
  attempt_id: attempt.attempt_id,
  currency: 'USD',
  amount_minor: '2500',
  env: 'live',
  artifact_kind: 'settlement',
  facilitator_attestation: {
    signer: 'facilitator.example',
    signed_at: '2026-05-01T10:05:00Z',
    signature: 'opaque-bytes-settlement',
  },
  upstream_artifact: {
    source: 'paymentauth.settlement.v1',
    settlement_token: 'eyJvcGFxdWUuc2V0dGxlbWVudA...',
  },
};

const settlementEvidence = fromMPPSettlement(settlement);
console.log(`rail:            ${settlementEvidence.rail}`);
const settlementEv = settlementEvidence.evidence as DemoEvidence;
console.log(`commerce.event:  ${settlementEv.commerce_event}`);
console.log(`attempt_id:      ${settlementEv.paymentauth_attempt_id}`);

// ---------------------------------------------------------------------------
// 3. Negative path: cross-kind misuse rejected in ALL modes
// ---------------------------------------------------------------------------
section('3. Cross-kind misuse rejected in ALL modes');

for (const mode of ['strict', 'interop', 'legacy'] as const) {
  try {
    fromMPPSettlement({ ...settlement, artifact_kind: 'authorization' }, { mode });
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
