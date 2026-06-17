/**
 * MPP Payment-Record Example (signed-record capstone)
 *
 * MPP handles the payment flow. PEAC records the resulting payment event as a
 * portable signed org.peacprotocol/payment record verifiable without MPP
 * server logs.
 *
 * This is a draft-aligned composition example for the "Payment" HTTP
 * authentication scheme (draft-ryan-httpauth-payment-01, an active individual
 * Internet-Draft, work in progress, not a finalized standard). A server
 * returns HTTP 402 with a payment challenge; after the client pays, the server
 * returns a Payment-Receipt header (base64url JSON). PEAC observes that receipt
 * and issues a signed, portable payment record that a customer, auditor,
 * counterparty, or dispute system can verify offline with only the issuer
 * public key.
 *
 * Relationship to other examples:
 * - examples/paymentauth-evidence  : parse + MAP paymentauth data to evidence.
 * - examples/mpp-payment-attempt   : attempt/settlement evidence mapping.
 * - examples/mpp-payment-record    : THIS example. The signed-record capstone:
 *   sign org.peacprotocol/payment, verify offline, carry in MCP _meta, prove
 *   tamper failure. It REUSES the @peac/mappings-paymentauth parser and the
 *   toCommerceExtensionFields() mapper rather than re-implementing them.
 *
 * Boundaries (PEAC does not become a payment rail):
 * - PEAC records and verifies; it does not settle, authorize, or authenticate.
 * - The raw Payment-Receipt is sensitive. The example binds it by digest and
 *   normalized fields; it does not log, store, or sign the raw header value.
 * - The record binds the normalized 402 challenge identity and decoded request
 *   payload via payment_challenge_digest; amount and currency come from the
 *   challenge request, not from the Payment-Receipt header.
 *
 * Record type / extensions used here:
 * - Registered record type org.peacprotocol/payment (the type the
 *   `peac samples generate` payment-event sample uses).
 * - Registered extension group org.peacprotocol/commerce carries the
 *   normalized fields produced by toCommerceExtensionFields()
 *   (payment_rail = paymentauth, amount_minor, currency, reference, env).
 * - com.example/mpp is a well-formed but unregistered example-local extension
 *   group carrying observational overflow (status, method, timestamp,
 *   challenge_id, resource, upstream_receipt_digest, payment_challenge_digest).
 *   Verification preserves it and surfaces an informational
 *   unknown_extension_preserved warning.
 *
 * No network, no external services.
 *
 * Run:
 *   pnpm demo               full flow (record, verify offline, MCP _meta coexist)
 *   pnpm demo:tamper        tamper check (modified record fails signature)
 *   pnpm demo:show-record   print the decoded record header and payload
 */

import { issue, verifyLocal } from '@peac/protocol';
import { generateKeypair, sha256Hex, jcsHash, canonicalize } from '@peac/crypto';
import { computeReceiptRef } from '@peac/schema';
import { attachReceiptToMeta, extractReceiptFromMetaAsync } from '@peac/mappings-mcp';
import {
  parsePaymentauthChallenges,
  parsePaymentauthReceipt,
  normalizeChallenge,
  normalizeReceipt,
  toCommerceExtensionFields,
  type NormalizedPaymentauthChallenge,
} from '@peac/mappings-paymentauth';

// Configuration (issuer = the service that observed the payment and records it)
const ISSUER_URL = 'https://api.example.com';
const KID = 'record-key-2026';
const COMMERCE_EXT = 'org.peacprotocol/commerce';
const MPP_EXT = 'com.example/mpp';

/** base64url of plain JSON (used for the Payment-Receipt header, base64url JSON). */
function toBase64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

/**
 * base64url of RFC 8785 (JCS) canonical JSON. The draft requires the 402
 * "Payment" challenge `request` JSON to be JCS-serialized before base64url.
 */
function toBase64urlJcs(obj: unknown): string {
  return Buffer.from(canonicalize(obj), 'utf8').toString('base64url');
}

/**
 * Canonical binding object for the observed 402 challenge: the normalized
 * challenge identity (id, realm, method, intent, expires) plus the decoded
 * request payload. A changed challenge id / method / expiry / amount all change
 * payment_challenge_digest. It does not bind arbitrary or raw challenge
 * parameters. Optional fields are set to null when absent for a deterministic,
 * cross-language-safe shape.
 */
function challengeBindingForDigest(
  challenge: NormalizedPaymentauthChallenge
): Record<string, unknown> {
  return {
    id: challenge.id ?? null,
    realm: challenge.realm ?? null,
    method: challenge.method ?? null,
    intent: challenge.intent ?? null,
    expires: challenge.expires ?? null,
    request: challenge.decodedRequest ?? null,
  };
}

/**
 * Simulated server: builds the 402 "Payment" challenge header (the price and
 * context the server charges for). `method` is a neutral example value (not a
 * real payment provider name).
 */
function serverChallengeHeader(): string {
  const request = toBase64urlJcs({
    amount: '500',
    currency: 'USD',
    recipient: 'acct_merchant',
    resource: 'tool:market_data.quote',
  });
  return (
    `Payment id="ch_4f9a21", realm="api.example.com", ` +
    `method="example", intent="charge", expires="2026-06-15T12:05:00Z", ` +
    `request="${request}"`
  );
}

/** Simulated server: the Payment-Receipt header it returns on 200. */
function serverPaymentReceiptHeader(): string {
  return toBase64urlJson({
    status: 'success',
    method: 'example',
    timestamp: '2026-06-15T12:00:00Z',
    reference: 'pay_ch_4f9a21',
  });
}

/**
 * Describe a Payment-Receipt header for logs WITHOUT revealing it. The raw
 * header is sensitive (draft-ryan-httpauth-payment-01); only a short digest is
 * ever printed, never the prefix, suffix, or raw value.
 */
async function describePaymentReceiptHeader(header: string): Promise<string> {
  const digest = await sha256Hex(header);
  return `[redacted Payment-Receipt; sha256:${digest.slice(0, 16)}...]`;
}

/** Decode a compact JWS without verifying (display helper). */
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

export interface RecordResult {
  jws: string;
  receiptRef: Awaited<ReturnType<typeof computeReceiptRef>>;
  upstreamReceiptDigest: string;
  challengeDigest: string;
}

/**
 * Observe a 402 "Payment" challenge and its Payment-Receipt header and issue a
 * signed PEAC payment record (record type org.peacprotocol/payment).
 *
 * Reuses the @peac/mappings-paymentauth parser/normalizer and the
 * toCommerceExtensionFields() mapper (the same path examples/paymentauth-evidence
 * uses). Rejects a receipt whose status is not success or whose body is not a
 * valid base64url JSON object (the parser/normalizer throw). The raw receipt is
 * never embedded: the record binds a sha256 digest of it. payment_rail is the
 * paymentauth rail (from the helper), not the receipt method. The record binds
 * the normalized 402 challenge identity (id/realm/method/intent/expires) and
 * decoded request payload via payment_challenge_digest; amount and currency come
 * from the challenge request, not the Payment-Receipt header.
 */
export async function recordPaymentReceipt(
  challengeHeader: string,
  paymentReceiptHeader: string,
  privateKey: Uint8Array
): Promise<RecordResult> {
  const [rawChallenge] = parsePaymentauthChallenges(challengeHeader);
  if (!rawChallenge) {
    throw new Error('no Payment challenge found in WWW-Authenticate header');
  }
  const challenge = normalizeChallenge(rawChallenge);
  const raw = parsePaymentauthReceipt(paymentReceiptHeader);
  const receipt = normalizeReceipt(raw); // throws on non-object / missing status+method

  if (receipt.status !== 'success') {
    throw new Error(`refusing to record a non-success payment receipt: status=${receipt.status}`);
  }

  // Reuse the canonical commerce-field mapper (rail = paymentauth, amount/currency
  // from the 402 challenge request, reference from the receipt), the same call
  // examples/paymentauth-evidence uses. Default (interop) mode; the helper defaults
  // the commerce env to 'live', so a production integration should assert env from
  // the upstream payment context.
  const commerce = toCommerceExtensionFields(receipt, challenge);
  if (!commerce?.amount_minor || !commerce.currency) {
    throw new Error('challenge did not yield amount_minor + currency for the commerce extension');
  }

  // Bind the upstream receipt and the normalized 402 challenge (identity + request) by digest.
  // Digest values are self-describing (sha256:<hex>), mirroring receipt_ref.
  const upstreamReceiptDigest = `sha256:${await sha256Hex(raw.rawValue)}`;
  // RFC 8785 JCS + SHA-256 via the canonical @peac/crypto helper (not a local rule).
  const challengeDigest = `sha256:${await jcsHash(challengeBindingForDigest(challenge))}`;
  const reqResource =
    challenge.decodedRequest && typeof challenge.decodedRequest === 'object'
      ? String((challenge.decodedRequest as Record<string, unknown>).resource ?? '')
      : '';

  const mppExt: Record<string, string> = {
    record_role: 'payment-record',
    status: receipt.status,
    method: receipt.method, // payment method (distinct from payment_rail)
    challenge_id: challenge.id,
    resource: reqResource,
    upstream_receipt_digest: upstreamReceiptDigest,
    payment_challenge_digest: challengeDigest,
    redaction_applied: 'true',
  };
  if (receipt.timestamp) mppExt.timestamp = receipt.timestamp;

  const { jws } = await issue({
    iss: ISSUER_URL,
    kind: 'evidence',
    type: 'org.peacprotocol/payment',
    pillars: ['commerce'],
    ...(receipt.timestamp ? { occurred_at: receipt.timestamp } : {}),
    extensions: {
      [COMMERCE_EXT]: commerce,
      [MPP_EXT]: mppExt,
    },
    privateKey,
    kid: KID,
  });

  return {
    jws,
    receiptRef: await computeReceiptRef(jws),
    upstreamReceiptDigest,
    challengeDigest,
  };
}

/** MCP CallToolResult-shaped response with a top-level _meta carrier. */
interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MppDemoResult {
  ok: boolean;
  receiptRef: string;
  signatureValid: boolean;
  paymentRail?: string;
  amountMinor?: string;
  currency?: string;
  digestMatches: boolean;
  challengeDigestMatches: boolean;
  warnings: string[];
  /** True if the raw base64url receipt leaked into the signed payload. */
  rawReceiptLeak: boolean;
  mcpMeta: {
    receiptInMeta: boolean;
    paymentMetaCoexists: boolean;
    metaReceiptVerifies: boolean;
    payment?: {
      challenge_id?: string;
      payment_rail?: string;
      amount_minor?: string;
      currency?: string;
      reference?: string;
      env?: string;
    };
  };
  tamper?: {
    payloadTamperValid: boolean;
    payloadTamperCode?: string;
  };
}

export interface RunOptions {
  tamper?: boolean;
  showRecord?: boolean;
  quiet?: boolean;
}

/**
 * Run the full MPP payment-record demo and return a structured result. Prints
 * a stage report unless quiet. Importing this module runs nothing; only the
 * guarded main() at the bottom invokes it when the file is run directly.
 */
export async function runDemo(opts: RunOptions = {}): Promise<MppDemoResult> {
  const { tamper = false, showRecord = false, quiet = false } = opts;
  const log = quiet ? () => undefined : (msg = '') => console.log(msg);
  const { privateKey, publicKey } = await generateKeypair();

  log('\n=== PEAC MPP Payment-Record Demo ===\n');

  // 1. Server returns HTTP 402 with a "Payment" challenge for a paid resource.
  const challengeHeader = serverChallengeHeader();
  const paymentReceiptHeader = serverPaymentReceiptHeader();
  log('1. Server returns 402 Payment Required for a paid resource (price in the challenge).');

  // 2. Client pays; server returns 200 with a Payment-Receipt header.
  log('2. Client pays; server returns 200 with a Payment-Receipt header:');
  log(`   Payment-Receipt: ${await describePaymentReceiptHeader(paymentReceiptHeader)}`);

  // 3. PEAC observes the receipt and issues a signed payment record.
  const rec = await recordPaymentReceipt(challengeHeader, paymentReceiptHeader, privateKey);
  log('\n3. PEAC records a signed org.peacprotocol/payment record (raw receipt bound by digest):');
  log(`   receipt_ref        = ${rec.receiptRef.slice(0, 27)}...`);
  log(`   upstream_digest    = ${rec.upstreamReceiptDigest.slice(0, 27)}...`);
  log(`   challenge_digest   = ${rec.challengeDigest.slice(0, 27)}...`);

  if (showRecord) {
    log('\n   Decoded record:');
    log(JSON.stringify(decodeJws(rec.jws), null, 2));
  }

  const failed = (): MppDemoResult => ({
    ok: false,
    receiptRef: rec.receiptRef,
    signatureValid: false,
    digestMatches: false,
    challengeDigestMatches: false,
    warnings: [],
    rawReceiptLeak: false,
    mcpMeta: { receiptInMeta: false, paymentMetaCoexists: false, metaReceiptVerifies: false },
  });

  // 4. Counterparty verifies offline with only the issuer public key.
  const verifyResult = await verifyLocal(rec.jws, publicKey, { issuer: ISSUER_URL });
  if (!verifyResult.valid) {
    console.error(`4. Offline verification FAILED: ${verifyResult.code} ${verifyResult.message}`);
    return failed();
  }
  const exts = verifyResult.claims.extensions as Record<string, unknown> | undefined;
  const commerce = exts?.[COMMERCE_EXT] as
    | {
        payment_rail?: string;
        amount_minor?: string;
        currency?: string;
        reference?: string;
        env?: string;
      }
    | undefined;
  const mpp = exts?.[MPP_EXT] as
    | { upstream_receipt_digest?: string; payment_challenge_digest?: string }
    | undefined;
  const warnings = verifyResult.warnings.map((w) => w.code);

  // The counterparty re-receives the same raw receipt and challenge and re-binds.
  const reDigest = `sha256:${await sha256Hex(paymentReceiptHeader)}`;
  const digestMatches = reDigest === mpp?.upstream_receipt_digest;
  const reChallenge = normalizeChallenge(parsePaymentauthChallenges(challengeHeader)[0]);
  const reChallengeDigest = `sha256:${await jcsHash(challengeBindingForDigest(reChallenge))}`;
  const challengeDigestMatches = reChallengeDigest === mpp?.payment_challenge_digest;

  // Redaction invariant: the raw base64url receipt must not be in the payload.
  const payloadStr = JSON.stringify(decodeJws(rec.jws).payload);
  const rawReceiptLeak = payloadStr.includes(paymentReceiptHeader);

  log('\n4. Counterparty verification (offline, public key only):');
  log(`   signature valid = ${verifyResult.valid}`);
  log(
    `   payment_rail = ${commerce?.payment_rail}, amount = ${commerce?.amount_minor} ${commerce?.currency}`
  );
  log(`   upstream receipt digest re-binds = ${digestMatches}`);
  log(`   402 challenge digest re-binds = ${challengeDigestMatches}`);
  log(`   raw receipt present in record = ${rawReceiptLeak} (expected false)`);
  if (warnings.length > 0) log(`   informational warnings: ${warnings.join(', ')}`);

  // 5. MCP _meta coexistence: the PEAC receipt reference rides alongside the
  //    payment metadata in the same _meta tree of an MCP tool result.
  const baseResult: McpToolCallResult = {
    content: [{ type: 'text', text: 'market_data.quote completed (paid).' }],
    structuredContent: { quote: { symbol: 'EXMPL', price: '12.34' } },
    _meta: {
      [`${MPP_EXT}/payment`]: {
        challenge_id: 'ch_4f9a21',
        payment_rail: commerce?.payment_rail,
        amount_minor: commerce?.amount_minor,
        currency: commerce?.currency,
        reference: commerce?.reference,
        env: commerce?.env,
      },
    },
  };
  const withReceipt = attachReceiptToMeta(baseResult, {
    receipt_ref: rec.receiptRef,
    receipt_jws: rec.jws,
  }) as McpToolCallResult;
  const paymentMeta = withReceipt._meta?.[`${MPP_EXT}/payment`] as
    | {
        challenge_id?: string;
        payment_rail?: string;
        amount_minor?: string;
        currency?: string;
        reference?: string;
        env?: string;
      }
    | undefined;
  const paymentMetaCoexists = paymentMeta !== undefined;
  const extracted = await extractReceiptFromMetaAsync(withReceipt);
  const metaJws = extracted?.receipts[0]?.receipt_jws;
  const metaVerify = metaJws
    ? await verifyLocal(metaJws, publicKey, { issuer: ISSUER_URL })
    : { valid: false as const };
  log('\n5. MCP _meta coexistence:');
  log(`   payment metadata + PEAC receipt both present in _meta = ${paymentMetaCoexists}`);
  log(`   _meta-carried PEAC receipt verifies offline = ${metaVerify.valid}`);

  const result: MppDemoResult = {
    ok: true,
    receiptRef: rec.receiptRef,
    signatureValid: verifyResult.valid === true,
    paymentRail: commerce?.payment_rail,
    amountMinor: commerce?.amount_minor,
    currency: commerce?.currency,
    digestMatches,
    challengeDigestMatches,
    warnings,
    rawReceiptLeak,
    mcpMeta: {
      receiptInMeta: Boolean(metaJws),
      paymentMetaCoexists,
      metaReceiptVerifies: metaVerify.valid === true,
      payment: paymentMeta,
    },
  };

  if (tamper) {
    // Tamper: modify the record payload, keep the signature -> invalid signature.
    const tamperedJws = tamperPayload(rec.jws);
    const tamperedVerify = await verifyLocal(tamperedJws, publicKey, { issuer: ISSUER_URL });
    log('\n6. Tamper check (modify the record payload, keep signature):');
    log(`   valid = ${tamperedVerify.valid}`);
    if (!tamperedVerify.valid) log(`   code  = ${tamperedVerify.code}`);
    result.tamper = {
      payloadTamperValid: tamperedVerify.valid === true,
      payloadTamperCode: tamperedVerify.valid ? undefined : tamperedVerify.code,
    };
  }

  // Verdict: every check the demo makes must hold.
  result.ok =
    result.signatureValid &&
    result.digestMatches &&
    result.challengeDigestMatches &&
    result.paymentRail === 'paymentauth' &&
    !result.rawReceiptLeak &&
    result.mcpMeta.receiptInMeta &&
    result.mcpMeta.paymentMetaCoexists &&
    result.mcpMeta.metaReceiptVerifies &&
    (!tamper ||
      (!result.tamper!.payloadTamperValid &&
        result.tamper!.payloadTamperCode === 'E_INVALID_SIGNATURE'));

  if (result.ok) log('\n=== Demo Complete ===\n');
  return result;
}

async function main(): Promise<void> {
  const result = await runDemo({
    tamper: process.argv.includes('--tamper'),
    showRecord: process.argv.includes('--show-record'),
  });
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
