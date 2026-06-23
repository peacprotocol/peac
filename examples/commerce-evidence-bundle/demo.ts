/**
 * Cross-ecosystem commerce evidence bundle example.
 *
 * Two layers of evidence are shown:
 *
 * 1. An in-memory commerce evidence bundle: a non-aggregating summary that
 *    correlates observations from multiple commerce protocols (paymentauth,
 *    Stripe SPT) into one experimental bundle. It records what each source
 *    reported without rolling amounts up into a settlement total.
 *
 * 2. A portable, offline-verifiable dispute bundle: the in-memory summary alone
 *    is not something a counterparty can verify. So this example also issues
 *    signed PEAC evidence receipts for the same commerce observations, packs
 *    them into a signed dispute bundle (a ZIP with a JCS-canonicalized manifest
 *    and a bundled JWKS), and verifies that bundle offline with only the public
 *    key. This is the portable evidence path another party can verify.
 *
 * The raw receipts are bound by signature; a verifier needs only the issuer
 * public key (carried in the bundle JWKS), no issuer logs and no network.
 *
 * Run:
 *   pnpm demo            assemble the commerce bundle, sign receipts, verify offline
 *   pnpm demo:tamper     additionally show a tampered receipt failing verification
 *   pnpm demo:show-record print the decoded first evidence record
 */

import {
  createCommerceEvidenceBundle,
  addProtocolEvidence,
  addTimelineEntry,
  addReceiptRef,
  serializeCommerceBundle,
  createDisputeBundle,
  verifyBundle,
  COMMERCE_BUNDLE_VERSION,
  type CommerceEvidenceBundle,
  type JsonWebKeySet,
  type VerificationReport,
} from '@peac/audit';
import { generateKeypair, base64urlEncode } from '@peac/crypto';
import { issue } from '@peac/protocol';
import { computeReceiptRef } from '@peac/schema';

// Configuration (issuer = the service that observed the commerce events).
const ISSUER_URL = 'https://api.example.com';
const KID = 'commerce-evidence-key-2026';
const COMMERCE_EXT = 'org.peacprotocol/commerce';

/** A single observed commerce event, mapped to a signed evidence receipt. */
interface CommerceObservation {
  source: string;
  captured_at: string;
  payment_rail: string;
  amount_minor: string;
  currency: string;
  reference: string;
  commerce_event: string;
}

/**
 * The commerce observations this demo records. The same data feeds both the
 * in-memory commerce bundle and the signed evidence receipts, so the two layers
 * describe the same transaction.
 */
const OBSERVATIONS: CommerceObservation[] = [
  {
    source: 'paymentauth',
    captured_at: '2025-06-01T12:00:00Z',
    payment_rail: 'paymentauth',
    amount_minor: '2500',
    currency: 'USD',
    reference: 'inv_demo_001',
    commerce_event: 'settlement',
  },
  {
    source: 'stripe',
    captured_at: '2025-06-01T12:01:00Z',
    payment_rail: 'stripe',
    amount_minor: '2500',
    currency: 'USD',
    reference: 'spt_tok_demo',
    commerce_event: 'delegated_payment_presented',
  },
];

/** Build the JWKS carried in the dispute bundle from a raw Ed25519 public key. */
function publicKeyToJwks(publicKey: Uint8Array, kid: string): JsonWebKeySet {
  return {
    keys: [
      {
        kty: 'OKP',
        crv: 'Ed25519',
        alg: 'EdDSA',
        use: 'sig',
        kid,
        x: base64urlEncode(publicKey),
      },
    ],
  };
}

/**
 * Issue one signed PEAC evidence receipt per commerce observation. Each receipt
 * carries the normalized commerce fields in the registered
 * org.peacprotocol/commerce extension group. Returns the JWS strings and their
 * receipt_ref hashes (the values the commerce bundle records).
 */
async function issueEvidenceReceipts(
  privateKey: Uint8Array
): Promise<Array<{ jws: string; receiptRef: string }>> {
  const out: Array<{ jws: string; receiptRef: string }> = [];
  for (const obs of OBSERVATIONS) {
    const { jws } = await issue({
      iss: ISSUER_URL,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      occurred_at: obs.captured_at,
      extensions: {
        [COMMERCE_EXT]: {
          payment_rail: obs.payment_rail,
          amount_minor: obs.amount_minor,
          currency: obs.currency,
          reference: obs.reference,
        },
      },
      privateKey,
      kid: KID,
    });
    out.push({ jws, receiptRef: await computeReceiptRef(jws) });
  }
  return out;
}

/** Decode a compact JWS without verifying (display helper). */
function decodeJws(jws: string): { header: unknown; payload: unknown } {
  const [header, payload] = jws.split('.');
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
  };
}

/**
 * Modify one payload claim while keeping the original signature (tamper helper).
 * The JWS stays well-formed and keeps its jti, so it can still be packed into a
 * bundle, but its Ed25519 signature no longer matches the payload.
 */
function tamperPayload(jws: string): string {
  const parts = jws.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new Error('Expected compact JWS with three non-empty parts');
  }
  const [header, payload, signature] = parts;
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  decoded.iss = 'https://attacker.example.com';
  const reEncoded = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
  return `${header}.${reEncoded}.${signature}`;
}

export interface CommerceBundleDemoResult {
  ok: boolean;
  /** In-memory commerce evidence bundle summary. */
  commerce: {
    version: typeof COMMERCE_BUNDLE_VERSION;
    railsObserved: string[];
    timelineLength: number;
    receiptsLength: number;
    serializedLength: number;
  };
  /** Signed dispute-bundle round-trip (the offline-verifiable evidence). */
  verify: {
    /** True if every receipt in the bundle verified offline. */
    verified: boolean;
    totalReceipts: number;
    valid: number;
    invalid: number;
    recommendation: VerificationReport['auditor_summary']['recommendation'];
    bundleSignatureValid: boolean;
  };
  /** Optional tamper beat: a tampered receipt must fail verification. */
  tamper?: {
    /** True if verifyBundle still returned ok:true (the read/integrity layer passed). */
    bundleReadOk: boolean;
    /** True if the bundle's own signature stayed valid (only a receipt was tampered). */
    bundleSignatureValid: boolean;
    /** Receipts the verifier flagged invalid (expected >= 1). */
    invalid: number;
    recommendation?: VerificationReport['auditor_summary']['recommendation'];
  };
}

export interface RunOptions {
  tamper?: boolean;
  showRecord?: boolean;
  quiet?: boolean;
}

/**
 * Run the full commerce-evidence-bundle demo and return a structured result.
 * Prints a stage report unless quiet. Importing this module runs nothing; only
 * the guarded main() at the bottom invokes it when the file is run directly.
 */
export async function runDemo(opts: RunOptions = {}): Promise<CommerceBundleDemoResult> {
  const { tamper = false, showRecord = false, quiet = false } = opts;
  const log = quiet ? () => undefined : (msg = '') => console.log(msg);
  const logError = quiet ? () => undefined : (msg = '') => console.error(msg);
  const { privateKey, publicKey } = await generateKeypair();

  log('=== Commerce Evidence Bundle Demo ===\n');
  log(`Bundle version: ${COMMERCE_BUNDLE_VERSION}\n`);

  // 1. Assemble the in-memory commerce evidence bundle (non-aggregating).
  let bundle: CommerceEvidenceBundle = createCommerceEvidenceBundle({
    transaction_ref: 'txn_cross_ecosystem_demo',
  });
  for (const obs of OBSERVATIONS) {
    bundle = addProtocolEvidence(bundle, {
      source: obs.source,
      captured_at: obs.captured_at,
      data: {
        payment_rail: obs.payment_rail,
        amount_minor: obs.amount_minor,
        currency: obs.currency,
        reference: obs.reference,
        commerce_event: obs.commerce_event,
      },
    });
  }
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

  // 2. Issue a signed PEAC evidence receipt for each observation.
  const receipts = await issueEvidenceReceipts(privateKey);
  for (const r of receipts) {
    bundle = addReceiptRef(bundle, r.receiptRef);
  }

  log('1. Commerce evidence bundle assembled (non-aggregating summary):');
  log(`   rails observed:    ${bundle.rails_observed.join(', ')}`);
  log(`   timeline entries:  ${bundle.timeline.length}`);
  log(`   receipt references: ${bundle.receipts.length}`);
  for (const obs of bundle.summary.observed_amounts) {
    log(`     ${obs.source}: ${obs.amount} ${obs.currency}`);
  }

  if (showRecord) {
    log('\n   First evidence record (decoded):');
    log(JSON.stringify(decodeJws(receipts[0].jws), null, 2));
  }

  const json = serializeCommerceBundle(bundle);

  // 3. Pack the signed receipts into a portable dispute bundle and verify it
  //    offline with only the bundled public key (no issuer logs, no network).
  const jwks = publicKeyToJwks(publicKey, KID);
  const bundleResult = await createDisputeBundle({
    refs: [{ type: 'dispute', id: 'dispute_cross_ecosystem_demo' }],
    created_by: ISSUER_URL,
    receipts: receipts.map((r) => r.jws),
    keys: jwks,
    // Sign the bundle itself (not just the receipts inside it) so the verifier
    // can confirm the bundle's integrity signature offline.
    signing_key: privateKey,
    signing_kid: KID,
  });

  const failed = (): CommerceBundleDemoResult => ({
    ok: false,
    commerce: {
      version: COMMERCE_BUNDLE_VERSION,
      railsObserved: bundle.rails_observed,
      timelineLength: bundle.timeline.length,
      receiptsLength: bundle.receipts.length,
      serializedLength: json.length,
    },
    verify: {
      verified: false,
      totalReceipts: 0,
      valid: 0,
      invalid: 0,
      recommendation: 'invalid',
      bundleSignatureValid: false,
    },
  });

  if (!bundleResult.ok) {
    logError(`2. Dispute bundle creation FAILED: ${bundleResult.error.code}`);
    return failed();
  }

  const report = await verifyBundle(bundleResult.value, { offline: true });
  if (!report.ok) {
    logError(`3. Offline bundle verification FAILED: ${report.error.code}`);
    return failed();
  }

  const summary = report.value.summary;
  const verified = summary.valid === summary.total_receipts && summary.invalid === 0;

  log('\n2. Signed dispute bundle created (portable, offline-verifiable):');
  log(`   receipts packed: ${receipts.length}`);
  log('\n3. Counterparty verification (offline, bundled public key only):');
  log(`   receipts valid = ${summary.valid}/${summary.total_receipts}`);
  log(`   recommendation = ${report.value.auditor_summary.recommendation}`);

  const result: CommerceBundleDemoResult = {
    ok: true,
    commerce: {
      version: COMMERCE_BUNDLE_VERSION,
      railsObserved: bundle.rails_observed,
      timelineLength: bundle.timeline.length,
      receiptsLength: bundle.receipts.length,
      serializedLength: json.length,
    },
    verify: {
      verified,
      totalReceipts: summary.total_receipts,
      valid: summary.valid,
      invalid: summary.invalid,
      recommendation: report.value.auditor_summary.recommendation,
      bundleSignatureValid: report.value.bundle_signature.valid === true,
    },
  };

  if (tamper) {
    // Tamper beat: modify one receipt payload after signing, keep its signature,
    // and pack it into a fresh bundle. The bundle containing that receipt is
    // internally consistent (its manifest hashes the tampered JWS) and validly
    // signed, so reading succeeds; but offline
    // verification recomputes each Ed25519 signature and flags the tampered
    // receipt invalid, so the auditor recommendation is no longer "valid".
    const tamperedReceipts = receipts.map((r) => r.jws);
    tamperedReceipts[0] = tamperPayload(tamperedReceipts[0]);
    const tamperedBundle = await createDisputeBundle({
      refs: [{ type: 'dispute', id: 'dispute_cross_ecosystem_demo' }],
      created_by: ISSUER_URL,
      receipts: tamperedReceipts,
      keys: jwks,
      // The bundle is validly signed; only a receipt inside it is tampered, so
      // the bundle signature stays valid while the tampered receipt fails.
      signing_key: privateKey,
      signing_kid: KID,
    });
    let tamperReadOk = false;
    let tamperBundleSignatureValid = false;
    let tamperInvalid = 0;
    let tamperRecommendation: VerificationReport['auditor_summary']['recommendation'] | undefined;
    if (tamperedBundle.ok) {
      const tamperedReport = await verifyBundle(tamperedBundle.value, { offline: true });
      if (tamperedReport.ok) {
        tamperReadOk = true;
        tamperBundleSignatureValid = tamperedReport.value.bundle_signature.valid === true;
        tamperInvalid = tamperedReport.value.summary.invalid;
        tamperRecommendation = tamperedReport.value.auditor_summary.recommendation;
      }
    }
    log('\n4. Tamper check (modify a receipt payload, keep its signature):');
    log(`   bundle signature valid = ${tamperBundleSignatureValid}`);
    log(`   receipts flagged invalid = ${tamperInvalid}`);
    log(`   recommendation = ${tamperRecommendation}`);
    result.tamper = {
      bundleReadOk: tamperReadOk,
      bundleSignatureValid: tamperBundleSignatureValid,
      invalid: tamperInvalid,
      recommendation: tamperRecommendation,
    };
  }

  // Verdict: every check the demo makes must hold.
  result.ok =
    result.commerce.railsObserved.length > 0 &&
    result.commerce.timelineLength > 0 &&
    result.commerce.receiptsLength > 0 &&
    result.verify.verified &&
    result.verify.bundleSignatureValid &&
    result.verify.recommendation === 'valid' &&
    (!tamper ||
      (result.tamper!.bundleReadOk &&
        result.tamper!.bundleSignatureValid &&
        result.tamper!.invalid >= 1 &&
        result.tamper!.recommendation !== 'valid'));

  if (result.ok) {
    log('\n=== Done ===');
  }
  return result;
}

async function main(): Promise<void> {
  const result = await runDemo({
    tamper: process.argv.includes('--tamper'),
    showRecord: process.argv.includes('--show-record'),
  });
  if (!result.ok) {
    process.exitCode = 1;
  }
}

// Run only when executed directly (pnpm demo), not when imported by a test.
const invokedDirectly = process.argv[1] !== undefined && /demo\.ts$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => {
    console.error('Demo failed:', err);
    process.exitCode = 1;
  });
}
