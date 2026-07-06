/**
 * MCP Paid Tool Records Example
 *
 * A priced MCP tool call triggers an x402 payment challenge; once the caller
 * pays, the settlement is observed via the offer-receipt extension (upstream
 * x402-foundation/x402 commit f2bbb5c, `extensions["offer-receipt"]`, body
 * path via `extractSignedReceiptFromSettlement`). This example binds that
 * settlement to the specific tool call it paid for: the tool name, a digest
 * of the tool call arguments (never the raw arguments), and a digest of the
 * returned tool result (never the raw result) are bound into a signed
 * org.peacprotocol/payment record, carried in the MCP tool result's `_meta`,
 * and verified offline directly from that `_meta` carrier.
 *
 * Before issuing the record, the offer is verified against the accepted
 * payment terms and the receipt is checked for consistency with the offer
 * (`verifyOffer` / `verifyOfferReceiptConsistency`, reused from
 * `@peac/adapter-x402`); a mismatched offer or receipt refuses issuance.
 *
 * This is tool-call composition, not gateway mediation: the record is issued
 * by (or on behalf of) the specific paid tool, at the point the tool call
 * completes. Compare with examples/mcp-gateway-receipts, which signs
 * gateway-mediated policy decisions for a whole fleet of tools regardless of
 * payment.
 *
 * Boundaries (PEAC does not become a payment rail):
 * - PEAC records and verifies; it does not settle, price, or gate the tool call.
 * - PEAC does not verify x402 scheme-specific invariants; see
 *   docs/compatibility/x402-scheme-coverage.md.
 * - The raw settlement receipt JWS artifact, the raw tool call arguments, and
 *   the raw tool result are sensitive. The record binds each by sha256
 *   digest; it never inlines the raw artifact, the raw arguments, or the raw
 *   result into the signed payload or _meta (nor are the raw arguments ever
 *   logged).
 *
 * Record type / extensions used here:
 * - Registered record type org.peacprotocol/payment.
 * - Registered extension group org.peacprotocol/commerce carries
 *   payment_rail = x402, amount_minor, currency, asset, env, event.
 * - com.example/mcp_paid_tool is a well-formed but unregistered example-local
 *   extension group carrying observational overflow (record_role, tool_name,
 *   tool_args_digest, tool_result_digest, signed_receipt_artifact_digest,
 *   settlement_receipt_payload_digest, upstream_artifact_digest,
 *   redaction_applied).
 *
 * No network, no external services. This demo generates two ephemeral local
 * keypairs: one simulating the x402 facilitator's signing key (for the
 * offer/receipt JWS artifacts) and one for the PEAC record issuer.
 *
 * Run:
 *   pnpm demo               full flow (record, carry in _meta, verify offline)
 *   pnpm demo:tamper        tamper checks (signature tamper + result digest mismatch)
 */

import { issue, verifyLocal, computeJsonDocumentDigestJcs } from '@peac/protocol';
import { generateKeypair, sign as signJws } from '@peac/crypto';
import { attachReceiptToMeta, extractReceiptFromMetaAsync } from '@peac/mappings-mcp';
import { computeReceiptRef } from '@peac/schema';
import type { JsonValue } from '@peac/kernel';
import {
  extractExtensionInfo,
  extractOfferPayload,
  extractReceiptPayload,
  normalizeOfferPayload,
  normalizeReceiptPayload,
  extractSignedReceiptFromSettlement,
  verifyOffer,
  verifyOfferReceiptConsistency,
  type AcceptEntry,
  type RawOfferPayload,
  type RawReceiptPayload,
  type RawSignedOffer,
  type RawSignedReceipt,
  type NormalizedReceiptPayload,
} from '@peac/adapter-x402';

// Configuration (issuer = the service that observed the settlement and records it)
const ISSUER_URL = 'https://api.example.com';
const KID = 'record-key-2026';
const FACILITATOR_KID = 'x402-facilitator-key-2026';
const COMMERCE_EXT = 'org.peacprotocol/commerce';
const TOOL_EXT = 'com.example/mcp_paid_tool';

const TOOL_NAME = 'market_data.premium_quote';
const TOOL_RESOURCE = 'https://api.example.com/v1/tools/market_data.premium_quote';
const TOOL_ARGS = { symbol: 'ACME', depth: 'full' } as const;

const NETWORK = 'eip155:8453'; // Base mainnet (CAIP-2)
const ASSET = 'USDC';
const PAY_TO = '0x9e2d35Cc6634C0532925a3b844Bc9e7595f19aa1';
const PAYER = '0x1230456789abcdef1234567890abcdef12345678';
const TRANSACTION = '0xfeedface1234567890abcdef1234567890abcdef1234567890abcdef1234ab';
const AMOUNT = '500000'; // $0.50 in USDC minor units (6 decimals)
const SCHEME = 'exact';

const ACCEPTS: AcceptEntry[] = [
  { network: NETWORK, asset: ASSET, payTo: PAY_TO, amount: AMOUNT, scheme: SCHEME },
];

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

/** Decode a compact JWS without verifying (leak-check helper). */
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

export interface ToolPaymentFixtures {
  /** Raw x402 402 challenge body for the priced tool call. */
  challengeBody: unknown;
  /** Raw x402 settlement response body (offer-receipt extension body path). */
  settlementBody: unknown;
}

/**
 * Build a signed x402 offer (the tool call's payment challenge) and a signed
 * x402 receipt (the settlement), ephemeral Ed25519 JWS artifacts simulating
 * the facilitator's signing key, wrapped in the upstream offer-receipt
 * extension wire shape.
 */
export async function buildToolPaymentFixtures(
  facilitatorPrivateKey: Uint8Array
): Promise<ToolPaymentFixtures> {
  const now = Math.floor(Date.now() / 1000);

  const offerPayload: RawOfferPayload = {
    version: 1,
    resourceUrl: TOOL_RESOURCE,
    scheme: SCHEME,
    network: NETWORK,
    asset: ASSET,
    payTo: PAY_TO,
    amount: AMOUNT,
    validUntil: now + 3600,
  };
  const offerJws = await signJws(offerPayload, facilitatorPrivateKey, FACILITATOR_KID);
  const signedOffer: RawSignedOffer = { format: 'jws', signature: offerJws };

  const receiptPayload: RawReceiptPayload = {
    version: 1,
    network: NETWORK,
    resourceUrl: TOOL_RESOURCE,
    payer: PAYER,
    issuedAt: now,
    transaction: TRANSACTION,
  };
  const receiptJws = await signJws(receiptPayload, facilitatorPrivateKey, FACILITATOR_KID);
  const signedReceipt: RawSignedReceipt = { format: 'jws', signature: receiptJws };

  const challengeBody = {
    resourceUrl: TOOL_RESOURCE,
    extensions: { 'offer-receipt': { info: { offers: [signedOffer] } } },
  };
  const settlementBody = {
    success: true,
    resourceUrl: TOOL_RESOURCE,
    extensions: { 'offer-receipt': { info: { receipt: signedReceipt } } },
  };

  return { challengeBody, settlementBody };
}

/** The MCP tool result content this call returned, as bound by tool_result_digest (excludes _meta and raw args). */
export interface ToolCallResultForDigest {
  content: unknown;
  structuredContent?: Record<string, unknown> | null;
}

export interface ToolPaymentRecordResult {
  jws: string;
  toolArgsDigest: string;
  toolResultDigest: string;
  signedReceiptArtifactDigest: string;
  settlementReceiptPayloadDigest: string;
  upstreamArtifactDigest: string;
  amountMinor: string;
  currency: string;
}

/**
 * Observe a settled x402 payment for a priced MCP tool call and issue a
 * signed PEAC payment record (record type org.peacprotocol/payment) binding
 * the tool name, a digest of the tool call arguments (never the raw
 * arguments), and a digest of the returned tool result (never the raw
 * result) to the settlement.
 *
 * Verifies the offer against the accepted payment terms and checks the
 * receipt is consistent with the offer (same resource, same network,
 * issued within the offer's validity window) before issuing; a mismatched
 * offer or receipt throws rather than producing a record. Also refuses to
 * issue without an observed settlement artifact: a settlement body with no
 * offer-receipt receipt throws rather than producing a record from
 * offer-only data.
 */
export async function recordPaidToolCall(
  toolName: string,
  toolArgs: Record<string, unknown>,
  toolResult: ToolCallResultForDigest,
  challengeBody: unknown,
  settlementBody: unknown,
  issuerPrivateKey: Uint8Array
): Promise<ToolPaymentRecordResult> {
  const info = extractExtensionInfo(challengeBody);
  if (!info || info.offers.length === 0) {
    throw new Error('no x402 payment challenge found for this tool call');
  }
  const offer = info.offers[0];

  const offerVerification = verifyOffer(offer, ACCEPTS);
  if (!offerVerification.valid) {
    throw new Error(
      `x402 offer failed term-matching verification: ${offerVerification.errors.map((e) => e.code).join(', ')}`
    );
  }
  const normOffer = normalizeOfferPayload(extractOfferPayload(offer));

  const settledReceipt = extractSignedReceiptFromSettlement(settlementBody);
  if (!settledReceipt) {
    throw new Error(
      'refusing to record a paid tool call without an observed settlement artifact (offer-only data is not settlement evidence)'
    );
  }
  const normReceipt = normalizeReceiptPayload(extractReceiptPayload(settledReceipt));

  const consistency = verifyOfferReceiptConsistency(normOffer, normReceipt);
  if (!consistency.valid) {
    throw new Error(
      `offer and receipt are inconsistent: ${consistency.errors.map((e) => e.code).join(', ')}`
    );
  }

  const toolArgsDigest = await computeJsonDocumentDigestJcs(toolArgs as unknown as JsonValue);
  const toolResultDigest = await computeJsonDocumentDigestJcs({
    content: toolResult.content,
    structuredContent: toolResult.structuredContent ?? null,
  } as unknown as JsonValue);
  // signed_receipt_artifact_digest binds the signed receipt artifact itself
  // (the RawSignedReceipt envelope observed in the settlement), not just the
  // normalized receipt payload; this is the upstream artifact identity for
  // disputes and audits.
  const signedReceiptArtifactDigest = await computeJsonDocumentDigestJcs(
    settledReceipt as unknown as JsonValue
  );
  // settlement_receipt_payload_digest binds the normalized receipt payload
  // (useful for field-level audit, but not the signed-artifact identity).
  const settlementReceiptPayloadDigest = await computeJsonDocumentDigestJcs(
    receiptDocument(normReceipt) as unknown as JsonValue
  );

  const commerce: Record<string, string> = {
    payment_rail: 'x402',
    amount_minor: normOffer.amount,
    currency: normOffer.asset,
    asset: normOffer.asset,
    env: 'test',
    event: 'settlement',
  };
  if (normReceipt.transaction) commerce.reference = normReceipt.transaction;

  const toolExt: Record<string, string> = {
    record_role: 'paid-tool-call',
    tool_name: toolName,
    tool_args_digest: toolArgsDigest,
    tool_result_digest: toolResultDigest,
    signed_receipt_artifact_digest: signedReceiptArtifactDigest,
    settlement_receipt_payload_digest: settlementReceiptPayloadDigest,
    // upstream_artifact_digest binds the signed settlement receipt artifact
    // this tool call paid for (equal to signed_receipt_artifact_digest;
    // mirrors org.peacprotocol/agent-action's upstream_artifact_digest field).
    upstream_artifact_digest: signedReceiptArtifactDigest,
    redaction_applied: 'true',
  };

  const { jws } = await issue({
    iss: ISSUER_URL,
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    pillars: ['commerce'],
    occurred_at: new Date(normReceipt.issuedAt * 1000).toISOString(),
    extensions: {
      [COMMERCE_EXT]: commerce,
      [TOOL_EXT]: toolExt,
    },
    privateKey: issuerPrivateKey,
    kid: KID,
  });

  return {
    jws,
    toolArgsDigest,
    toolResultDigest,
    signedReceiptArtifactDigest,
    settlementReceiptPayloadDigest,
    upstreamArtifactDigest: signedReceiptArtifactDigest,
    amountMinor: normOffer.amount,
    currency: commerce.currency,
  };
}

/** MCP CallToolResult-shaped response with a top-level _meta carrier. */
interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ToolDemoResult {
  ok: boolean;
  signatureValid: boolean;
  toolArgsDigestMatches: boolean;
  toolResultDigestMatches: boolean;
  signedReceiptArtifactDigestMatches: boolean;
  settlementReceiptPayloadDigestMatches: boolean;
  upstreamArtifactDigestMatches: boolean;
  /** true if the raw tool call arguments or the raw settlement receipt JWS leaked anywhere. */
  rawLeak: boolean;
  receiptInMeta: boolean;
  metaReceiptVerifies: boolean;
  warnings: string[];
  tamper?: {
    payloadTamperValid: boolean;
    payloadTamperCode?: string;
    /** content tamper: signature still verifies, but the re-derived tool-result digest no longer matches. */
    toolResultDigestMatchesAfterTamper: boolean;
  };
}

export interface RunOptions {
  tamper?: boolean;
  quiet?: boolean;
}

/**
 * Run the full MCP paid-tool-call demo and return a structured result.
 * Prints a stage report unless quiet. Importing this module runs nothing;
 * only the guarded main() at the bottom invokes it when run directly.
 */
export async function runDemo(opts: RunOptions = {}): Promise<ToolDemoResult> {
  const { tamper = false, quiet = false } = opts;
  const log = quiet ? () => undefined : (msg = '') => console.log(msg);

  const { privateKey: facilitatorPrivateKey } = await generateKeypair();
  const { privateKey: issuerPrivateKey, publicKey: issuerPublicKey } = await generateKeypair();

  log('\n=== PEAC MCP Paid Tool Records Demo ===\n');
  // Never logs the raw tool call arguments: only the tool name and a digest.
  const toolArgsDigestPreview = await computeJsonDocumentDigestJcs(
    TOOL_ARGS as unknown as JsonValue
  );
  log(
    `1. Priced tool call: ${TOOL_NAME} (tool_args_digest = ${toolArgsDigestPreview.slice(0, 27)}...) triggers an x402 challenge.`
  );

  const { challengeBody, settlementBody } = await buildToolPaymentFixtures(facilitatorPrivateKey);
  log('2. Caller pays; settlement observed via the offer-receipt extension body path.');

  const failed = (): ToolDemoResult => ({
    ok: false,
    signatureValid: false,
    toolArgsDigestMatches: false,
    toolResultDigestMatches: false,
    signedReceiptArtifactDigestMatches: false,
    settlementReceiptPayloadDigestMatches: false,
    upstreamArtifactDigestMatches: false,
    rawLeak: false,
    receiptInMeta: false,
    metaReceiptVerifies: false,
    warnings: [],
  });

  // Build the MCP tool result the call actually returns (content +
  // structuredContent) before issuing the record, so tool_result_digest can
  // bind the result the record is issued for.
  const baseResult: McpToolCallResult = {
    content: [{ type: 'text', text: `${TOOL_NAME} completed (paid).` }],
    structuredContent: { symbol: TOOL_ARGS.symbol, price: '198.42' },
  };

  const rec = await recordPaidToolCall(
    TOOL_NAME,
    TOOL_ARGS,
    { content: baseResult.content, structuredContent: baseResult.structuredContent },
    challengeBody,
    settlementBody,
    issuerPrivateKey
  );
  log(
    '\n3. PEAC records a signed org.peacprotocol/payment record (tool call + result bound by digest):'
  );
  log(`   tool_name                         = ${TOOL_NAME}`);
  log(`   tool_args_digest                  = ${rec.toolArgsDigest.slice(0, 27)}...`);
  log(`   tool_result_digest                = ${rec.toolResultDigest.slice(0, 27)}...`);
  log(`   signed_receipt_artifact_digest    = ${rec.signedReceiptArtifactDigest.slice(0, 27)}...`);
  log(
    `   settlement_receipt_payload_digest = ${rec.settlementReceiptPayloadDigest.slice(0, 27)}...`
  );
  log(`   upstream_artifact_digest          = ${rec.upstreamArtifactDigest.slice(0, 27)}...`);

  // 4. Carry the record in the MCP tool result's _meta.
  const withReceipt = attachReceiptToMeta(baseResult, {
    receipt_ref: await computeReceiptRef(rec.jws),
    receipt_jws: rec.jws,
  }) as McpToolCallResult;
  log('\n4. Record attached via top-level _meta carrier keys.');

  // 5. Verify offline directly from the _meta carrier (not from rec.jws).
  const extracted = await extractReceiptFromMetaAsync(withReceipt);
  const metaJws = extracted?.receipts[0]?.receipt_jws;
  const receiptInMeta = Boolean(metaJws);
  const verifyResult = metaJws
    ? await verifyLocal(metaJws, issuerPublicKey, { issuer: ISSUER_URL })
    : { valid: false as const };
  if (!verifyResult.valid) {
    if (!metaJws) console.error('4. No receipt found in _meta.');
    else console.error(`5. Offline verification FAILED`);
    return failed();
  }
  const exts = verifyResult.claims.extensions as Record<string, Record<string, string>> | undefined;
  const toolExt = exts?.[TOOL_EXT];
  const warnings = verifyResult.warnings.map((w) => w.code);

  // The counterparty independently re-derives the tool-args digest, the
  // tool-result digest (from the same returned content/structuredContent),
  // and the settlement-receipt digest from the same raw materials it
  // separately received, and confirms they still match what is bound in
  // the record.
  const reToolArgsDigest = await computeJsonDocumentDigestJcs(TOOL_ARGS as unknown as JsonValue);
  const reToolResultDigest = await computeJsonDocumentDigestJcs({
    content: baseResult.content,
    structuredContent: baseResult.structuredContent ?? null,
  } as unknown as JsonValue);
  const reSettledReceipt = extractSignedReceiptFromSettlement(settlementBody)!;
  const reNormReceipt = normalizeReceiptPayload(extractReceiptPayload(reSettledReceipt));
  const reSignedReceiptArtifactDigest = await computeJsonDocumentDigestJcs(
    reSettledReceipt as unknown as JsonValue
  );
  const reSettlementReceiptPayloadDigest = await computeJsonDocumentDigestJcs(
    receiptDocument(reNormReceipt) as unknown as JsonValue
  );
  const toolArgsDigestMatches = reToolArgsDigest === toolExt?.tool_args_digest;
  const toolResultDigestMatches = reToolResultDigest === toolExt?.tool_result_digest;
  const signedReceiptArtifactDigestMatches =
    reSignedReceiptArtifactDigest === toolExt?.signed_receipt_artifact_digest;
  const settlementReceiptPayloadDigestMatches =
    reSettlementReceiptPayloadDigest === toolExt?.settlement_receipt_payload_digest;
  // upstream_artifact_digest binds the signed receipt artifact (not the
  // normalized payload); it must equal signed_receipt_artifact_digest.
  const upstreamArtifactDigestMatches =
    reSignedReceiptArtifactDigest === toolExt?.upstream_artifact_digest;

  // Redaction invariant: raw tool args and the raw settlement receipt JWS
  // must not appear anywhere in the signed payload or the _meta carrier.
  const payloadStr = JSON.stringify(decodeJws(metaJws!).payload);
  const metaStr = JSON.stringify(withReceipt._meta);
  const rawLeak =
    payloadStr.includes(JSON.stringify(TOOL_ARGS)) ||
    metaStr.includes(JSON.stringify(TOOL_ARGS)) ||
    payloadStr.includes(reSettledReceipt.signature) ||
    metaStr.includes(reSettledReceipt.signature);

  log('\n5. Counterparty verification (offline, from the _meta carrier, public key only):');
  log(`   signature valid = ${verifyResult.valid}`);
  log(`   tool_name = ${TOOL_NAME}, amount = ${rec.amountMinor} ${rec.currency}`);
  log(`   tool args digest re-binds                 = ${toolArgsDigestMatches}`);
  log(`   tool result digest re-binds               = ${toolResultDigestMatches}`);
  log(`   signed receipt artifact digest re-binds   = ${signedReceiptArtifactDigestMatches}`);
  log(`   settlement receipt payload digest re-binds= ${settlementReceiptPayloadDigestMatches}`);
  log(`   upstream artifact digest = signed receipt = ${upstreamArtifactDigestMatches}`);
  log(`   raw tool args / raw settlement receipt present = ${rawLeak} (expected false)`);
  if (warnings.length > 0) log(`   informational warnings: ${warnings.join(', ')}`);

  const result: ToolDemoResult = {
    ok: true,
    signatureValid: verifyResult.valid === true,
    toolArgsDigestMatches,
    toolResultDigestMatches,
    signedReceiptArtifactDigestMatches,
    settlementReceiptPayloadDigestMatches,
    upstreamArtifactDigestMatches,
    rawLeak,
    receiptInMeta,
    metaReceiptVerifies: verifyResult.valid === true,
    warnings,
  };

  if (tamper) {
    // Content tamper: alter the returned tool result AFTER signing -> the
    // re-derived tool-result digest no longer matches the digest bound in
    // the record (the _meta-carried signature still verifies on the
    // original result).
    const tamperedResult = {
      content: baseResult.content,
      structuredContent: { ...baseResult.structuredContent, price: '999.99' },
    };
    const tamperedResultDigest = await computeJsonDocumentDigestJcs(
      tamperedResult as unknown as JsonValue
    );
    const toolResultDigestMatchesAfterTamper = tamperedResultDigest === toolExt?.tool_result_digest;

    // Payload tamper: modify the _meta-carried record payload, keep the signature -> invalid signature.
    const tamperedJws = tamperPayload(metaJws!);
    const tamperedVerify = await verifyLocal(tamperedJws, issuerPublicKey, { issuer: ISSUER_URL });
    log('\n6. Tamper checks:');
    log(
      `   content tamper: tool result digest still matches = ${toolResultDigestMatchesAfterTamper} (expected false)`
    );
    log(`   payload tamper: signature valid = ${tamperedVerify.valid} (expected false)`);
    if (!tamperedVerify.valid) log(`   payload tamper: code = ${tamperedVerify.code}`);
    result.tamper = {
      payloadTamperValid: tamperedVerify.valid === true,
      payloadTamperCode: tamperedVerify.valid ? undefined : tamperedVerify.code,
      toolResultDigestMatchesAfterTamper,
    };
  }

  result.ok =
    result.signatureValid &&
    result.receiptInMeta &&
    result.metaReceiptVerifies &&
    result.toolArgsDigestMatches &&
    result.toolResultDigestMatches &&
    result.signedReceiptArtifactDigestMatches &&
    result.settlementReceiptPayloadDigestMatches &&
    result.upstreamArtifactDigestMatches &&
    !result.rawLeak &&
    (!tamper ||
      (!result.tamper!.payloadTamperValid &&
        result.tamper!.payloadTamperCode === 'E_INVALID_SIGNATURE' &&
        !result.tamper!.toolResultDigestMatchesAfterTamper));

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
