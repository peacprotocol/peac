/**
 * ACP delegated-payment observation -> PEAC commerce evidence demo.
 *
 * Offline, no network. Shows the full lane: (1) an upstream ACP-aware
 * payment surface produces a delegated-payment authorization artifact
 * and later a settlement artifact; (2) PEAC records each observation
 * separately via fromACPDelegatedPaymentObservation; (3) the
 * artifact_kind discriminator prevents an authorization-only artifact
 * from being treated as a settlement proof.
 *
 * Run: npx tsx examples/acp-delegated-checkout/demo.ts
 */

import {
  fromACPDelegatedPaymentObservation,
  type ACPDelegatedPaymentObservation,
} from '@peac/mappings-acp';
import { MapperBoundaryError } from '@peac/adapter-core';

/** Narrow view over the JsonObject evidence field for demo logging. */
type DemoEvidence = {
  commerce_event?: string;
  observed_payment_state?: string;
};

function section(title: string): void {
  console.log(`\n=== ${title} ===\n`);
}

// ---------------------------------------------------------------------------
// 1. Delegated-payment authorization observation
// ---------------------------------------------------------------------------
section('1. Authorization observation (artifact_kind=authorization)');

const authObservation: ACPDelegatedPaymentObservation = {
  delegation_id: 'del_demo_001',
  resource_uri: 'https://merchant.example.com/checkout/acp-demo',
  principal: 'user_alice',
  delegate: 'agent_bob',
  payment_method_token_ref: 'pmt_ref_opaque_demo',
  authorized_amount_minor: '2599',
  currency: 'USD',
  env: 'live',
  observed_payment_state: 'authorized',
  artifact_kind: 'authorization',
  upstream_artifact: {
    source: 'acp.delegated_payment.v1',
    raw: { authorization_id: 'auth_demo_xyz', created_at: '2026-05-01T10:00:00Z' },
  },
  session_id: 'sess_demo_001',
};

const authEvidence = fromACPDelegatedPaymentObservation(authObservation);
console.log(`rail:            ${authEvidence.payment.rail}`);
console.log(`amount (minor):  ${authEvidence.payment.amount}`);
console.log(`currency:        ${authEvidence.payment.currency}`);
const authEv = authEvidence.payment.evidence as DemoEvidence;
console.log(`commerce.event:  ${authEv.commerce_event}`);
console.log(`observed_state:  ${authEv.observed_payment_state}`);

// ---------------------------------------------------------------------------
// 2. Settlement observation (separate artifact with artifact_kind=settlement)
// ---------------------------------------------------------------------------
section('2. Settlement observation (artifact_kind=settlement)');

const settlementEvidence = fromACPDelegatedPaymentObservation({
  ...authObservation,
  observed_payment_state: 'settled',
  artifact_kind: 'settlement',
  upstream_artifact: {
    source: 'acp.delegated_payment.v1',
    raw: { settlement_id: 'sett_demo_xyz', settled_at: '2026-05-01T10:05:00Z' },
  },
});
const settlementEv = settlementEvidence.payment.evidence as DemoEvidence;
console.log(`commerce.event:  ${settlementEv.commerce_event}`);
console.log(`observed_state:  ${settlementEv.observed_payment_state}`);

// ---------------------------------------------------------------------------
// 3. Non-finality states: pending/failed/revoked MUST NOT emit events
// ---------------------------------------------------------------------------
section('3. Non-finality states produce NO commerce event');

for (const state of ['pending', 'failed', 'revoked'] as const) {
  const out = fromACPDelegatedPaymentObservation({
    ...authObservation,
    observed_payment_state: state,
    artifact_kind: undefined,
  });
  const ev = out.payment.evidence as DemoEvidence;
  console.log(`  state=${state}: commerce.event=${ev.commerce_event ?? '<none>'}`);
}

// ---------------------------------------------------------------------------
// 4. Negative path: settled with authorization-only artifact REJECTS
// ---------------------------------------------------------------------------
section('4. Settlement-proof discriminator rejects cross-kind misuse (ALL modes)');

for (const mode of ['strict', 'interop', 'legacy'] as const) {
  try {
    fromACPDelegatedPaymentObservation(
      {
        ...authObservation,
        observed_payment_state: 'settled',
        artifact_kind: 'authorization',
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
