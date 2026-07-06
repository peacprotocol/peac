/**
 * x402 Paid Resource Records Example (signed-record composition example)
 *
 * A resource server behind x402 challenges payment for a resource with a
 * signed offer, and returns a signed receipt once payment settles (the
 * "Signed Offers and Receipts" extension, upstream x402-foundation/x402
 * commit f2bbb5c, `extensions["offer-receipt"]`). @peac/adapter-x402
 * verifies the offer against accept terms and checks offer/receipt
 * consistency, but does not itself produce a portable, independently
 * verifiable record of what settled. This example composes that record:
 * PEAC observes the settled offer/receipt pair and issues a signed
 * org.peacprotocol/payment record that a customer, auditor, counterparty,
 * or dispute system can verify offline with only the issuer public key,
 * works behind any gateway or CDN that fronts x402.
 *
 * Boundaries (PEAC does not become a payment rail):
 * - PEAC records and verifies; it does not settle, price, or gate access.
 * - PEAC does not verify x402 scheme-specific invariants (single-use,
 *   time bounds, recipient/facilitator binding, on-chain finality); see
 *   docs/compatibility/x402-scheme-coverage.md for that boundary.
 * - The raw signed offer/receipt JWS artifacts and the raw settlement
 *   header value are sensitive upstream material. The record binds them
 *   by sha256 digest; it never inlines the raw artifacts or the raw
 *   header value into the signed payload.
 * - The settlement is observed via two independent channels (a response
 *   header and the offer-receipt body). If the two channels disagree on
 *   what settled, the record is never issued (fail closed).
 *
 * Record type / extensions used here:
 * - Registered record type org.peacprotocol/payment.
 * - Registered extension group org.peacprotocol/commerce carries
 *   payment_rail = x402, amount_minor, currency, asset, env, event.
 * - com.example/paid_resource is a well-formed but unregistered
 *   example-local extension group carrying observational overflow
 *   (record_role, resource, network, scheme, offer_terms_digest,
 *   signed_offer_artifact_digest, signed_receipt_artifact_digest,
 *   settlement_header_digest, settlement_receipt_payload_digest,
 *   upstream_artifact_digest, settlement_extensions_digest,
 *   redaction_applied). Verification preserves it and surfaces an
 *   informational unknown_extension_preserved warning.
 *
 * `network` is intentionally NOT part of org.peacprotocol/commerce:
 * CommerceExtensionSchema is `.strict()` and has no `network` field, so
 * network lives in the example-local extension instead (issuing a record
 * that put it in commerce would fail schema validation; see the
 * "strict-extension rejection" test in the smoke test).
 *
 * No network, no external services. This demo generates two ephemeral
 * local keypairs: one simulating the x402 facilitator's signing key (for
 * the offer/receipt JWS artifacts) and one for the PEAC record issuer.
 * Production issuers should use stable issuer-controlled signing keys.
 *
 * Run:
 *   pnpm demo               full flow (record, verify offline, dual-channel observation)
 *   pnpm demo:tamper        tamper checks (signature tamper + content digest mismatch)
 */

import { issue, verifyLocal, computeJsonDocumentDigestJcs } from '@peac/protocol';
import { generateKeypair, sign as signJws } from '@peac/crypto';
import { computeReceiptRef } from '@peac/schema';
import type { JsonValue } from '@peac/kernel';
import {
  OFFER_RECEIPT,
  extractExtensionInfo,
  extractOfferPayload,
  extractReceiptPayload,
  normalizeOfferPayload,
  normalizeReceiptPayload,
  verifyOffer,
  verifyOfferReceiptConsistency,
  extractSettlementProofFromHeaders,
  extractSignedReceiptFromSettlement,
  toPeacRecord,
  MAX_SETTLEMENT_EXTENSIONS_BYTES,
  type AcceptEntry,
  type RawOfferPayload,
  type RawReceiptPayload,
  type RawSignedOffer,
  type RawSignedReceipt,
  type NormalizedOfferPayload,
  type NormalizedReceiptPayload,
  type X402OfferReceiptChallenge,
  type X402SettlementResponse,
  type HeaderBag,
} from '@peac/adapter-x402';

// Configuration (issuer = the service that observed the settlement and records it)
const ISSUER_URL = 'https://api.example.com';
const KID = 'record-key-2026';
const FACILITATOR_KID = 'x402-facilitator-key-2026';
const COMMERCE_EXT = 'org.peacprotocol/commerce';
const X402_EXT = 'com.example/paid_resource';

const RESOURCE_URL = 'https://api.example.com/v1/market-data/quote';
const NETWORK = 'eip155:8453'; // Base mainnet (CAIP-2), matches upstream x402 examples
const ASSET = 'USDC';
const PAY_TO = '0x742d35Cc6634C0532925a3b844Bc9e7595f1e123';
const PAYER = '0xabc1234567890abcdef1234567890abcdef123456';
const TRANSACTION = '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678';
const AMOUNT = '250000'; // $0.25 in USDC minor units (6 decimals)
const SCHEME = 'exact';

const ACCEPTS: AcceptEntry[] = [
  { network: NETWORK, asset: ASSET, payTo: PAY_TO, amount: AMOUNT, scheme: SCHEME },
];

/**
 * Canonical, deterministic digest document for the offer terms: an explicit
 * plain-JSON shape (optional fields normalized to null) so the digest is
 * stable and cross-language-safe, mirroring challengeBindingForDigest in
 * examples/mpp-payment-record.
 */
function offerTermsDocument(offer: NormalizedOfferPayload): Record<string, string | number | null> {
  return {
    version: offer.version,
    resourceUrl: offer.resourceUrl,
    scheme: offer.scheme,
    network: offer.network,
    asset: offer.asset,
    payTo: offer.payTo,
    amount: offer.amount,
    validUntil: offer.validUntil ?? null,
  };
}

/** Canonical, deterministic digest document for the settlement receipt. */
function receiptDocument(
  receipt: NormalizedReceiptPayload
): Record<string, string | number | null> {
  return {
    version: receipt.version,
    network: receipt.network,
    resourceUrl: receipt.resourceUrl,
    payer: receipt.payer,
    issuedAt: receipt.issuedAt,
    transaction: receipt.transaction ?? null,
  };
}

/** Decode a compact JWS without verifying (display / leak-check helper). */
function decodeJws(jws: string): { header: unknown; payload: unknown } {
  const [header, payload] = jws.split('.');
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
  };
}

/** Modify one payload claim while keeping the original signature (tamper helper). */
function tamperPayload(jws: string): string {
  const [header, payload, signature] = jws.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  decoded.iss = 'https://attacker.example.com';
  const reEncoded = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
  return `${header}.${reEncoded}.${signature}`;
}

export interface X402Fixtures {
  /** Raw upstream 402 challenge body (extensions["offer-receipt"].info.offers). */
  challengeBody: unknown;
  /** Raw upstream settlement response body (extensions["offer-receipt"].info.receipt). */
  settlementBody: unknown;
  /** Response headers carrying the same settlement proof independently. */
  settlementHeaders: HeaderBag;
}

/**
 * Build a signed x402 offer and a signed x402 receipt (ephemeral Ed25519 JWS
 * artifacts, simulating the facilitator's signing key) and wrap them into
 * the upstream wire shapes: a 402 challenge body and a settlement response
 * body (both offer-receipt extension), plus a settlement response header
 * carrying the same receipt artifact independently.
 */
export async function buildX402Fixtures(facilitatorPrivateKey: Uint8Array): Promise<X402Fixtures> {
  const now = Math.floor(Date.now() / 1000);

  const offerPayload: RawOfferPayload = {
    version: 1,
    resourceUrl: RESOURCE_URL,
    scheme: SCHEME,
    network: NETWORK,
    asset: ASSET,
    payTo: PAY_TO,
    amount: AMOUNT,
    validUntil: now + 3600,
  };
  const offerJws = await signJws(offerPayload, facilitatorPrivateKey, FACILITATOR_KID);
  const signedOffer: RawSignedOffer = { format: 'jws', signature: offerJws, acceptIndex: 0 };

  const receiptPayload: RawReceiptPayload = {
    version: 1,
    network: NETWORK,
    resourceUrl: RESOURCE_URL,
    payer: PAYER,
    issuedAt: now,
    transaction: TRANSACTION,
  };
  const receiptJws = await signJws(receiptPayload, facilitatorPrivateKey, FACILITATOR_KID);
  const signedReceipt: RawSignedReceipt = { format: 'jws', signature: receiptJws };

  const challengeBody = {
    accepts: ACCEPTS,
    resourceUrl: RESOURCE_URL,
    extensions: { [OFFER_RECEIPT]: { info: { offers: [signedOffer] } } },
  };

  const settlementBody = {
    success: true,
    resourceUrl: RESOURCE_URL,
    extensions: { [OFFER_RECEIPT]: { info: { receipt: signedReceipt } } },
  };

  // The same settlement receipt artifact, observed independently via a
  // response header (dual-channel: header path and offer-receipt body path).
  const settlementHeaders: HeaderBag = { 'PAYMENT-RESPONSE': receiptJws };

  return { challengeBody, settlementBody, settlementHeaders };
}

export interface X402RecordResult {
  jws: string;
  receiptRef: string;
  network: string;
  asset: string;
  amountMinor: string;
  currency: string;
  offerTermsDigest: string;
  /** Digest over the signed offer artifact itself (the RawSignedOffer envelope), not just its normalized terms. */
  signedOfferArtifactDigest: string;
  /** Digest over the signed receipt artifact extracted from the settlement body (the RawSignedReceipt envelope). */
  signedReceiptArtifactDigest: string;
  /** Digest over a minimal { source, raw_value } document for the header-observed settlement proof. */
  settlementHeaderDigest: string;
  /** Digest over the normalized settlement receipt payload (not the signed artifact itself). */
  settlementReceiptPayloadDigest: string;
  upstreamArtifactDigest: string;
  settlementExtensionsDigest?: string;
  dualChannelConsistent: boolean;
}

/**
 * Observe a settled x402 offer/receipt pair (via BOTH the settlement
 * response header and the offer-receipt extension body) and issue a signed
 * PEAC payment record (record type org.peacprotocol/payment).
 *
 * Refuses to issue without an observed settlement artifact: a challenge
 * with no offer, or a settlement body/headers with no receipt, throws
 * rather than producing a record from offer-only data.
 */
export async function recordX402Settlement(
  challengeBody: unknown,
  settlementHeaders: HeaderBag,
  settlementBody: unknown,
  issuerPrivateKey: Uint8Array
): Promise<X402RecordResult> {
  const info = extractExtensionInfo(challengeBody);
  if (!info || info.offers.length === 0) {
    throw new Error('no x402 offer found in the 402 challenge body');
  }
  const offer = info.offers[0];

  const offerVerification = verifyOffer(offer, ACCEPTS);
  if (!offerVerification.valid) {
    throw new Error(
      `x402 offer failed term-matching verification: ${offerVerification.errors.map((e) => e.code).join(', ')}`
    );
  }

  // Body path (the offer-receipt extension embedded in the settlement
  // response body). This is the primary source of the settled receipt.
  const bodyReceipt = extractSignedReceiptFromSettlement(settlementBody);
  if (!bodyReceipt) {
    throw new Error(
      'refusing to record a paid-resource event without an observed settlement artifact (offer-only data is not settlement evidence)'
    );
  }

  // Header path: the same settlement proof, observed independently via
  // response headers (dual-header precedence: PEAC-Receipt > PAYMENT-RESPONSE > X-PAYMENT-RESPONSE).
  const headerProofs = extractSettlementProofFromHeaders(settlementHeaders);
  const headerProof = headerProofs[0];
  if (!headerProof) {
    throw new Error(
      'refusing to record a paid-resource event without a header-observed settlement proof'
    );
  }
  // Dual-channel consistency: the header-observed raw artifact and the
  // body-extracted receipt's own signature segment must agree. If a gateway
  // reported different settlement artifacts on the two channels, that is a
  // sign of a compromised or misconfigured intermediary: PEAC refuses to
  // issue a record rather than picking one channel and hiding the mismatch.
  if (headerProof.raw_value !== bodyReceipt.signature) {
    throw new Error('settlement header and body receipt differ');
  }
  const dualChannelConsistent = true;

  const normOffer = normalizeOfferPayload(extractOfferPayload(offer));
  const normReceipt = normalizeReceiptPayload(extractReceiptPayload(bodyReceipt));

  const consistency = verifyOfferReceiptConsistency(normOffer, normReceipt);
  if (!consistency.valid) {
    throw new Error(
      `offer and receipt are inconsistent: ${consistency.errors.map((e) => e.code).join(', ')}`
    );
  }

  const paymentRequired: X402OfferReceiptChallenge = {
    accepts: ACCEPTS,
    offers: [offer],
    resourceUrl: RESOURCE_URL,
  };
  const settlementBodyObj = settlementBody as { extensions?: Record<string, unknown> };
  const settlementResponse: X402SettlementResponse = {
    receipt: bodyReceipt,
    resourceUrl: RESOURCE_URL,
    extensions: settlementBodyObj.extensions,
  };
  // Local, unsigned evidence mapping (proof preservation discipline): raw
  // offer/receipt live here only, never in the signed record below. Digest
  // preserved by default (preserveRawSettlementExtensions: false).
  const mapped = toPeacRecord(paymentRequired, settlementResponse, {
    offerVerification,
    consistencyVerification: consistency,
  });

  const offerTermsDigest = await computeJsonDocumentDigestJcs(
    offerTermsDocument(normOffer) as unknown as JsonValue
  );
  // signed_offer_artifact_digest binds the signed offer artifact itself
  // (the RawSignedOffer envelope, e.g. { format: 'jws', signature,
  // acceptIndex }), not just its normalized terms.
  const signedOfferArtifactDigest = await computeJsonDocumentDigestJcs(
    offer as unknown as JsonValue
  );
  // signed_receipt_artifact_digest binds the signed receipt artifact
  // extracted from the settlement body (the RawSignedReceipt envelope).
  const signedReceiptArtifactDigest = await computeJsonDocumentDigestJcs(
    bodyReceipt as unknown as JsonValue
  );
  // settlement_header_digest binds a minimal digest document over the
  // header-observed proof (source + raw value); the raw header value
  // itself is never inlined into the signed record.
  const settlementHeaderDigest = await computeJsonDocumentDigestJcs({
    source: headerProof.source,
    raw_value: headerProof.raw_value,
  } as unknown as JsonValue);
  const settlementReceiptPayloadDigest = await computeJsonDocumentDigestJcs(
    receiptDocument(normReceipt) as unknown as JsonValue
  );
  // upstream_artifact_digest binds the settlement receipt artifact this
  // record was derived from: the generic "artifact this record was derived
  // from" name (mirroring the naming convention already used by
  // org.peacprotocol/agent-action's upstream_artifact_digest field), equal
  // to the signed receipt artifact digest (not the normalized payload digest).
  const upstreamArtifactDigest = signedReceiptArtifactDigest;

  const commerce: Record<string, string> = {
    payment_rail: 'x402',
    amount_minor: normOffer.amount,
    currency: normOffer.asset,
    asset: normOffer.asset,
    env: 'test',
    event: 'settlement',
  };
  if (normReceipt.transaction) commerce.reference = normReceipt.transaction;

  const x402Ext: Record<string, string> = {
    record_role: 'paid-resource-record',
    resource: normOffer.resourceUrl,
    network: normOffer.network,
    scheme: normOffer.scheme,
    offer_terms_digest: offerTermsDigest,
    signed_offer_artifact_digest: signedOfferArtifactDigest,
    signed_receipt_artifact_digest: signedReceiptArtifactDigest,
    settlement_header_digest: settlementHeaderDigest,
    settlement_receipt_payload_digest: settlementReceiptPayloadDigest,
    upstream_artifact_digest: upstreamArtifactDigest,
    redaction_applied: 'true',
  };
  if (mapped.proofs.x402.settlementExtensionsDigest) {
    x402Ext.settlement_extensions_digest = mapped.proofs.x402.settlementExtensionsDigest;
  }

  const { jws } = await issue({
    iss: ISSUER_URL,
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    pillars: ['commerce'],
    occurred_at: new Date(normReceipt.issuedAt * 1000).toISOString(),
    extensions: {
      [COMMERCE_EXT]: commerce,
      [X402_EXT]: x402Ext,
    },
    privateKey: issuerPrivateKey,
    kid: KID,
  });

  return {
    jws,
    receiptRef: await computeReceiptRef(jws),
    network: normOffer.network,
    asset: normOffer.asset,
    amountMinor: normOffer.amount,
    currency: commerce.currency,
    offerTermsDigest,
    signedOfferArtifactDigest,
    signedReceiptArtifactDigest,
    settlementHeaderDigest,
    settlementReceiptPayloadDigest,
    upstreamArtifactDigest,
    settlementExtensionsDigest: mapped.proofs.x402.settlementExtensionsDigest,
    dualChannelConsistent,
  };
}

export interface X402DemoResult {
  ok: boolean;
  receiptRef: string;
  signatureValid: boolean;
  network?: string;
  asset?: string;
  amountMinor?: string;
  currency?: string;
  dualChannelConsistent: boolean;
  offerTermsDigestMatches: boolean;
  signedOfferArtifactDigestMatches: boolean;
  signedReceiptArtifactDigestMatches: boolean;
  settlementHeaderDigestMatches: boolean;
  settlementReceiptPayloadDigestMatches: boolean;
  upstreamArtifactDigestMatches: boolean;
  /** True if any raw offer/receipt JWS or raw settlement header value leaked into the signed payload. */
  rawArtifactLeak: boolean;
  warnings: string[];
  tamper?: {
    payloadTamperValid: boolean;
    payloadTamperCode?: string;
    /** content tamper: signature still verifies, but the re-derived digest no longer matches. */
    settlementReceiptPayloadDigestMatchesAfterTamper: boolean;
  };
}

export interface RunOptions {
  tamper?: boolean;
  quiet?: boolean;
}

/**
 * Run the full x402 paid-resource demo and return a structured result.
 * Prints a stage report unless quiet. Importing this module runs nothing;
 * only the guarded main() at the bottom invokes it when run directly.
 */
export async function runDemo(opts: RunOptions = {}): Promise<X402DemoResult> {
  const { tamper = false, quiet = false } = opts;
  const log = quiet ? () => undefined : (msg = '') => console.log(msg);

  const { privateKey: facilitatorPrivateKey } = await generateKeypair();
  const { privateKey: issuerPrivateKey, publicKey: issuerPublicKey } = await generateKeypair();

  log('\n=== PEAC x402 Paid Resource Records Demo ===\n');

  const { challengeBody, settlementBody, settlementHeaders } =
    await buildX402Fixtures(facilitatorPrivateKey);
  log(
    '1. Resource server returns a 402 challenge with a signed x402 offer (offer-receipt extension).'
  );
  log(
    `2. Client pays; settlement observed via BOTH the response header AND the offer-receipt body ` +
      `(extensions bag bounded at ${MAX_SETTLEMENT_EXTENSIONS_BYTES} bytes).`
  );

  const failed = (partial: Partial<X402DemoResult> = {}): X402DemoResult => ({
    ok: false,
    receiptRef: '',
    signatureValid: false,
    dualChannelConsistent: false,
    offerTermsDigestMatches: false,
    signedOfferArtifactDigestMatches: false,
    signedReceiptArtifactDigestMatches: false,
    settlementHeaderDigestMatches: false,
    settlementReceiptPayloadDigestMatches: false,
    upstreamArtifactDigestMatches: false,
    rawArtifactLeak: false,
    warnings: [],
    ...partial,
  });

  const rec = await recordX402Settlement(
    challengeBody,
    settlementHeaders,
    settlementBody,
    issuerPrivateKey
  );
  log(
    '\n3. PEAC records a signed org.peacprotocol/payment record (raw offer/receipt bound by digest):'
  );
  log(`   receipt_ref                        = ${rec.receiptRef.slice(0, 27)}...`);
  log(`   offer_terms_digest                 = ${rec.offerTermsDigest.slice(0, 27)}...`);
  log(`   signed_offer_artifact_digest       = ${rec.signedOfferArtifactDigest.slice(0, 27)}...`);
  log(`   signed_receipt_artifact_digest     = ${rec.signedReceiptArtifactDigest.slice(0, 27)}...`);
  log(`   settlement_header_digest          = ${rec.settlementHeaderDigest.slice(0, 27)}...`);
  log(
    `   settlement_receipt_payload_digest  = ${rec.settlementReceiptPayloadDigest.slice(0, 27)}...`
  );
  log(`   upstream_artifact_digest           = ${rec.upstreamArtifactDigest.slice(0, 27)}...`);
  log(`   dual-channel consistent            = ${rec.dualChannelConsistent}`);

  // 4. Counterparty verifies offline with only the issuer public key.
  const verifyResult = await verifyLocal(rec.jws, issuerPublicKey, { issuer: ISSUER_URL });
  if (!verifyResult.valid) {
    console.error(`4. Offline verification FAILED: ${verifyResult.code} ${verifyResult.message}`);
    return failed({ receiptRef: rec.receiptRef });
  }
  const exts = verifyResult.claims.extensions as Record<string, Record<string, string>> | undefined;
  const x402Ext = exts?.[X402_EXT];
  const warnings = verifyResult.warnings.map((w) => w.code);

  // The counterparty separately re-derives the offer/receipt from the same
  // raw materials it independently received, and re-checks the digests
  // bound in the record (it does not just trust the issuer's arithmetic).
  const reInfo = extractExtensionInfo(challengeBody);
  const reRawOffer = reInfo!.offers[0];
  const reOffer = normalizeOfferPayload(extractOfferPayload(reRawOffer));
  const reBodyReceipt = extractSignedReceiptFromSettlement(settlementBody)!;
  const reReceipt = normalizeReceiptPayload(extractReceiptPayload(reBodyReceipt));
  const reHeaderProof = extractSettlementProofFromHeaders(settlementHeaders)[0];
  const reOfferTermsDigest = await computeJsonDocumentDigestJcs(
    offerTermsDocument(reOffer) as unknown as JsonValue
  );
  const reSignedOfferArtifactDigest = await computeJsonDocumentDigestJcs(
    reRawOffer as unknown as JsonValue
  );
  const reSignedReceiptArtifactDigest = await computeJsonDocumentDigestJcs(
    reBodyReceipt as unknown as JsonValue
  );
  const reSettlementHeaderDigest = await computeJsonDocumentDigestJcs({
    source: reHeaderProof.source,
    raw_value: reHeaderProof.raw_value,
  } as unknown as JsonValue);
  const reSettlementReceiptPayloadDigest = await computeJsonDocumentDigestJcs(
    receiptDocument(reReceipt) as unknown as JsonValue
  );
  const offerTermsDigestMatches = reOfferTermsDigest === x402Ext?.offer_terms_digest;
  const signedOfferArtifactDigestMatches =
    reSignedOfferArtifactDigest === x402Ext?.signed_offer_artifact_digest;
  const signedReceiptArtifactDigestMatches =
    reSignedReceiptArtifactDigest === x402Ext?.signed_receipt_artifact_digest;
  const settlementHeaderDigestMatches =
    reSettlementHeaderDigest === x402Ext?.settlement_header_digest;
  const settlementReceiptPayloadDigestMatches =
    reSettlementReceiptPayloadDigest === x402Ext?.settlement_receipt_payload_digest;
  const upstreamArtifactDigestMatches =
    reSignedReceiptArtifactDigest === x402Ext?.upstream_artifact_digest;

  // Redaction invariant: the raw offer/receipt JWS artifacts and the raw
  // settlement header value must not be in the signed payload.
  const payloadStr = JSON.stringify(decodeJws(rec.jws).payload);
  const rawArtifactLeak =
    payloadStr.includes(reInfo!.offers[0].signature) ||
    payloadStr.includes(reBodyReceipt.signature) ||
    payloadStr.includes(String((settlementHeaders as Record<string, string>)['PAYMENT-RESPONSE']));

  log('\n4. Counterparty verification (offline, public key only):');
  log(`   signature valid = ${verifyResult.valid}`);
  log(
    `   payment_rail = x402, amount = ${rec.amountMinor} ${rec.currency}, network = ${rec.network}`
  );
  log(`   offer terms digest re-binds                 = ${offerTermsDigestMatches}`);
  log(`   signed offer artifact digest re-binds       = ${signedOfferArtifactDigestMatches}`);
  log(`   signed receipt artifact digest re-binds     = ${signedReceiptArtifactDigestMatches}`);
  log(`   settlement header digest re-binds           = ${settlementHeaderDigestMatches}`);
  log(`   settlement receipt payload digest re-binds  = ${settlementReceiptPayloadDigestMatches}`);
  log(`   upstream artifact digest re-binds           = ${upstreamArtifactDigestMatches}`);
  log(`   raw offer/receipt/header present in record = ${rawArtifactLeak} (expected false)`);
  if (warnings.length > 0) log(`   informational warnings: ${warnings.join(', ')}`);

  const result: X402DemoResult = {
    ok: true,
    receiptRef: rec.receiptRef,
    signatureValid: verifyResult.valid === true,
    network: rec.network,
    asset: rec.asset,
    amountMinor: rec.amountMinor,
    currency: rec.currency,
    dualChannelConsistent: rec.dualChannelConsistent,
    offerTermsDigestMatches,
    signedOfferArtifactDigestMatches,
    signedReceiptArtifactDigestMatches,
    settlementHeaderDigestMatches,
    settlementReceiptPayloadDigestMatches,
    upstreamArtifactDigestMatches,
    rawArtifactLeak,
    warnings,
  };

  if (tamper) {
    // Content tamper: alter the settlement receipt AFTER digesting -> the
    // re-computed digest no longer matches the digest bound in the record.
    const tamperedReceipt: NormalizedReceiptPayload = {
      ...reReceipt,
      transaction: `0x${'f'.repeat(64)}`,
    };
    const tamperedDigest = await computeJsonDocumentDigestJcs(
      receiptDocument(tamperedReceipt) as unknown as JsonValue
    );
    const settlementReceiptPayloadDigestMatchesAfterTamper =
      tamperedDigest === x402Ext?.settlement_receipt_payload_digest;

    // Payload tamper: flip a claim in the signed record, keep the signature -> invalid signature.
    const tamperedJws = tamperPayload(rec.jws);
    const tamperedVerify = await verifyLocal(tamperedJws, issuerPublicKey, { issuer: ISSUER_URL });

    log('\n5. Tamper checks:');
    log(
      `   content tamper: settlement receipt payload digest still matches = ${settlementReceiptPayloadDigestMatchesAfterTamper} (expected false)`
    );
    log(`   payload tamper: signature valid = ${tamperedVerify.valid} (expected false)`);
    if (!tamperedVerify.valid) log(`   payload tamper: code = ${tamperedVerify.code}`);

    result.tamper = {
      payloadTamperValid: tamperedVerify.valid === true,
      payloadTamperCode: tamperedVerify.valid ? undefined : tamperedVerify.code,
      settlementReceiptPayloadDigestMatchesAfterTamper,
    };
  }

  // Verdict: every check the demo makes must hold.
  result.ok =
    result.signatureValid &&
    result.dualChannelConsistent &&
    result.offerTermsDigestMatches &&
    result.signedOfferArtifactDigestMatches &&
    result.signedReceiptArtifactDigestMatches &&
    result.settlementHeaderDigestMatches &&
    result.settlementReceiptPayloadDigestMatches &&
    result.upstreamArtifactDigestMatches &&
    !result.rawArtifactLeak &&
    (!tamper ||
      (!result.tamper!.payloadTamperValid &&
        result.tamper!.payloadTamperCode === 'E_INVALID_SIGNATURE' &&
        !result.tamper!.settlementReceiptPayloadDigestMatchesAfterTamper));

  if (result.ok) log('\n=== Demo Complete ===\n');
  return result;
}

async function main(): Promise<void> {
  const result = await runDemo({ tamper: process.argv.includes('--tamper') });
  if (!result.ok) process.exitCode = 1;
}

// Run only when executed directly (pnpm demo), not when imported by a test.
const invokedDirectly = process.argv[1] !== undefined && /demo\.ts$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => {
    console.error('Demo failed:', err);
    process.exitCode = 1;
  });
}
