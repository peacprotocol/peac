/**
 * examples/counterparty-acknowledgment-records
 *
 * Linked counterparty acknowledgment records: two INDEPENDENTLY signed,
 * single-issuer PEAC records that a verifier can bind together offline.
 *
 *   - Record P: the payer issues a signed `org.peacprotocol/payment` record
 *     for a paid interaction (commerce fields + a correlation workflow id).
 *   - Record Q: the provider issues its OWN signed `org.peacprotocol/payment`
 *     record that REFERENCES P by the full identity triple
 *     (acknowledged_iss, acknowledged_jti, acknowledged_record_ref), where
 *     acknowledged_record_ref = sha256(P's compact JWS) per DD-129.
 *
 * This is not a countersignature envelope and not two signatures over one
 * payload; each record has exactly one issuer signature. PEAC does not
 * countersign, arbitrate, or establish contractual agreement; an
 * acknowledgment record reports only what the acknowledging party asserts.
 *
 * Q is a provider-side OBSERVATION of P's payment record, not a second
 * payment: `acknowledging_role: "provider"` and
 * `acknowledgment_scope: "payment-record-observed"` carry that meaning, and Q
 * omits any settlement/finality field. Because `org.peacprotocol/payment` is
 * bound to the `org.peacprotocol/commerce` extension group, Q mirrors P's
 * minimum commerce identity fields (payment_rail / amount_minor / currency /
 * reference / env) - describing the SAME acknowledged payment - and the linked
 * verifier requires those mirrored fields to match P or the link fails.
 *
 * No network, no subprocess, no raw sensitive material: the records carry
 * only self-describing digests and identity claims.
 */

import { issue, verifyLocal } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';
import { computeReceiptRef } from '@peac/schema';

export const COMMERCE_EXT = 'org.peacprotocol/commerce';
export const CORRELATION_EXT = 'org.peacprotocol/correlation';
export const ACK_EXT = 'com.example/counterparty_acknowledgment';

export const PAYER_ISS = 'https://payer.example';
export const PROVIDER_ISS = 'https://provider.example';
const PAYER_KID = 'payer-key-2026';
const PROVIDER_KID = 'provider-key-2026';

/** Minimum commerce identity fields shared by the acknowledged payment. */
export interface CommerceFields {
  readonly payment_rail: string;
  readonly amount_minor: string;
  readonly currency: string;
  readonly reference: string;
  readonly env: 'live' | 'test';
}

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

/** Fail before signing if a required example commerce field is missing. */
function assertCommerceFields(commerce: CommerceFields): void {
  for (const key of ['payment_rail', 'amount_minor', 'currency', 'reference', 'env'] as const) {
    if (!commerce[key]) {
      throw new Error(`commerce.${key} is required for this example`);
    }
  }
}

function assertWorkflowId(workflowId: string): void {
  if (!workflowId) {
    throw new Error('workflowId is required for this example');
  }
}

// --- Record P (payer's payment record) --------------------------------------

export interface PaymentRecord {
  readonly jws: string;
  readonly iss: string;
  readonly jti: string;
  readonly receiptRef: string;
  readonly commerce: CommerceFields;
  readonly workflowId: string;
}

/**
 * Issue and read back a payer payment record P. The jti/iss are read from the
 * verified claims (issue() assigns the jti), so callers get the real values to
 * bind into Q.
 */
export async function issuePaymentRecordP(params: {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  commerce: CommerceFields;
  workflowId: string;
}): Promise<PaymentRecord> {
  assertCommerceFields(params.commerce);
  assertWorkflowId(params.workflowId);
  const { jws } = await issue({
    iss: PAYER_ISS,
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    pillars: ['commerce'],
    extensions: {
      [COMMERCE_EXT]: params.commerce,
      [CORRELATION_EXT]: { workflow_id: params.workflowId },
    },
    privateKey: params.privateKey,
    kid: PAYER_KID,
  });

  const v = await verifyLocal(jws, params.publicKey, { issuer: PAYER_ISS });
  if (!v.valid) {
    throw new Error(`payer record P did not self-verify: ${v.code} ${v.message}`);
  }
  const claims = v.claims as { iss: string; jti: string };
  return {
    jws,
    iss: claims.iss,
    jti: claims.jti,
    receiptRef: String(await computeReceiptRef(jws)),
    commerce: params.commerce,
    workflowId: params.workflowId,
  };
}

// --- Record Q (provider's acknowledgment record) ----------------------------

/**
 * Build and sign a provider acknowledgment record Q that references P. The
 * override fields let tests inject a well-formed-but-misrepresenting record
 * (wrong acknowledged_iss/jti or mismatched mirrored commerce) to prove the
 * linked verifier fails closed.
 */
export async function issueAcknowledgmentRecordQ(params: {
  privateKey: Uint8Array;
  p: PaymentRecord;
  /** Overrides for negative tests; default to the honest values from P. */
  acknowledgedIss?: string;
  acknowledgedJti?: string;
  acknowledgedRecordRef?: string;
  acknowledgingRole?: string;
  acknowledgmentScope?: string;
  parentJti?: string;
  workflowId?: string;
  dependsOn?: readonly string[];
  /** Mirrored commerce for Q; defaults to P's commerce (the honest case). */
  commerce?: CommerceFields;
}): Promise<{ jws: string }> {
  const commerce = params.commerce ?? params.p.commerce;
  assertCommerceFields(commerce);
  return issue({
    iss: PROVIDER_ISS,
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    pillars: ['commerce'],
    extensions: {
      // Mirrors the SAME acknowledged payment (not a second payment); no
      // event/settlement field -> no finality claim.
      [COMMERCE_EXT]: commerce,
      [CORRELATION_EXT]: {
        workflow_id: params.workflowId ?? params.p.workflowId,
        parent_jti: params.parentJti ?? params.p.jti,
        depends_on: params.dependsOn ?? [params.p.jti],
      },
      [ACK_EXT]: {
        acknowledged_iss: params.acknowledgedIss ?? params.p.iss,
        acknowledged_jti: params.acknowledgedJti ?? params.p.jti,
        acknowledged_record_ref: params.acknowledgedRecordRef ?? params.p.receiptRef,
        acknowledging_role: params.acknowledgingRole ?? 'provider',
        acknowledgment_scope: params.acknowledgmentScope ?? 'payment-record-observed',
      },
    },
    privateKey: params.privateKey,
    kid: PROVIDER_KID,
  });
}

// --- Linked-acknowledgment verifier -----------------------------------------

export interface LinkResult {
  readonly linked: boolean;
  readonly reason?:
    | 'p-invalid'
    | 'q-invalid'
    | 'not-linked'
    | 'digest-mismatch'
    | 'identity-mismatch'
    | 'acknowledgment-mismatch'
    | 'correlation-mismatch'
    | 'commerce-mismatch';
}

/**
 * Verify the linked pair offline with only the two issuer public keys.
 * Steps mirror the PACK-1 recipe: verify P, verify Q, recompute + byte-compare
 * P's receipt_ref, check the identity triple, check correlation, and check the
 * mirrored commerce fields match P (fail-closed on every mismatch).
 */
export async function verifyLinkedPair(params: {
  pJws: string;
  qJws: string;
  payerPublicKey: Uint8Array;
  providerPublicKey: Uint8Array;
}): Promise<LinkResult> {
  const vP = await verifyLocal(params.pJws, params.payerPublicKey, { issuer: PAYER_ISS });
  if (!vP.valid) return { linked: false, reason: 'p-invalid' };

  const vQ = await verifyLocal(params.qJws, params.providerPublicKey, { issuer: PROVIDER_ISS });
  if (!vQ.valid) return { linked: false, reason: 'q-invalid' };

  const pClaims = vP.claims as { iss: string; jti: string; extensions?: Record<string, unknown> };
  const qClaims = vQ.claims as { extensions?: Record<string, unknown> };

  const ack = qClaims.extensions?.[ACK_EXT] as
    | {
        acknowledged_iss?: string;
        acknowledged_jti?: string;
        acknowledged_record_ref?: string;
        acknowledging_role?: string;
        acknowledgment_scope?: string;
      }
    | undefined;
  if (!ack) return { linked: false, reason: 'not-linked' };

  // The role/scope are semantically load-bearing: Q is a provider-side
  // observation of P's payment record. Enforce the exact values so the
  // documented boundary cannot be silently bypassed.
  if (
    ack.acknowledging_role !== 'provider' ||
    ack.acknowledgment_scope !== 'payment-record-observed'
  ) {
    return { linked: false, reason: 'acknowledgment-mismatch' };
  }

  // Recompute P's receipt_ref over P's compact JWS bytes and byte-compare.
  const recomputed = String(await computeReceiptRef(params.pJws));
  if (recomputed !== ack.acknowledged_record_ref) {
    return { linked: false, reason: 'digest-mismatch' };
  }

  // Misrepresentation guard: the claimed identity must match P's real claims.
  if (ack.acknowledged_iss !== pClaims.iss || ack.acknowledged_jti !== pClaims.jti) {
    return { linked: false, reason: 'identity-mismatch' };
  }

  // Correlation consistency.
  const pCorr = pClaims.extensions?.[CORRELATION_EXT] as { workflow_id?: string } | undefined;
  const qCorr = qClaims.extensions?.[CORRELATION_EXT] as
    | { workflow_id?: string; parent_jti?: string; depends_on?: readonly string[] }
    | undefined;
  if (
    !pCorr?.workflow_id ||
    !qCorr ||
    qCorr.workflow_id !== pCorr.workflow_id ||
    qCorr.parent_jti !== pClaims.jti ||
    !Array.isArray(qCorr.depends_on) ||
    !qCorr.depends_on.includes(pClaims.jti)
  ) {
    return { linked: false, reason: 'correlation-mismatch' };
  }

  // Commerce-field-mismatch guard: Q mirrors the SAME payment, so the mirrored
  // identity fields must match P.
  const pCom = pClaims.extensions?.[COMMERCE_EXT] as CommerceFields | undefined;
  const qCom = qClaims.extensions?.[COMMERCE_EXT] as CommerceFields | undefined;
  if (
    !pCom ||
    !qCom ||
    qCom.payment_rail !== pCom.payment_rail ||
    qCom.amount_minor !== pCom.amount_minor ||
    qCom.currency !== pCom.currency ||
    (qCom.reference ?? '') !== (pCom.reference ?? '') ||
    (qCom.env ?? '') !== (pCom.env ?? '')
  ) {
    return { linked: false, reason: 'commerce-mismatch' };
  }

  return { linked: true };
}

// --- Demo runner ------------------------------------------------------------

export interface DemoResult {
  readonly ok: boolean;
  readonly pReceiptRef: string;
  readonly link: LinkResult;
  readonly tamper?: LinkResult;
}

/** Flip one byte in a compact JWS payload segment (tamper beat). */
function tamperPayload(jws: string): string {
  const [h, p, s] = jws.split('.');
  const bytes = Buffer.from(p, 'base64url');
  bytes[0] ^= 0x01;
  return `${h}.${bytes.toString('base64url')}.${s}`;
}

export async function runDemo(opts: { tamper?: boolean } = {}): Promise<DemoResult> {
  const payer = await generateKeypair();
  const provider = await generateKeypair();

  const commerce: CommerceFields = {
    payment_rail: 'x402',
    amount_minor: '1250',
    currency: 'USD',
    reference: 'ord_7f3a9c2e',
    env: 'test',
  };
  const workflowId = 'wf_counterparty_ack_demo';

  log('1. Payer issues a signed org.peacprotocol/payment record P.');
  const p = await issuePaymentRecordP({
    privateKey: payer.privateKey,
    publicKey: payer.publicKey,
    commerce,
    workflowId,
  });
  log(`   P: iss=${p.iss} jti=${p.jti}`);
  log(`   P receipt_ref (over P's compact JWS bytes) = ${p.receiptRef}`);

  log('2. Provider issues its own signed record Q that references P by (iss, jti, receipt_ref).');
  const q = await issueAcknowledgmentRecordQ({ privateKey: provider.privateKey, p });

  log('3. A third party verifies the linked pair offline with only the two issuer public keys.');
  const link = await verifyLinkedPair({
    pJws: p.jws,
    qJws: q.jws,
    payerPublicKey: payer.publicKey,
    providerPublicKey: provider.publicKey,
  });
  log(`   linked = ${link.linked}${link.reason ? ` (${link.reason})` : ''}`);

  let tamper: LinkResult | undefined;
  if (opts.tamper) {
    log('4. Tamper beat: flip a byte in P, re-verify the pair.');
    tamper = await verifyLinkedPair({
      pJws: tamperPayload(p.jws),
      qJws: q.jws,
      payerPublicKey: payer.publicKey,
      providerPublicKey: provider.publicKey,
    });
    log(`   linked = ${tamper.linked} (expected false; reason=${tamper.reason})`);
  }

  const ok = link.linked === true && (!opts.tamper || tamper?.linked === false);
  log(ok ? 'OK' : 'FAILED');
  return { ok, pReceiptRef: p.receiptRef, link, tamper };
}

// Run only when executed directly (pnpm demo), not when imported by a test.
const invokedDirectly = process.argv[1] !== undefined && /demo\.ts$/.test(process.argv[1]);
if (invokedDirectly) {
  runDemo({ tamper: process.argv.includes('--tamper') })
    .then((r) => process.exit(r.ok ? 0 : 1))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
