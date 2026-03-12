/**
 * x402 Offer/Receipt verification
 *
 * Verification layers:
 * 1. Wire validation (verifyWire): structural shape, format tags, required fields
 * 2. Offer term verification (verifyOfferTerms): version, expiry, amount, network, term-matching
 * 3. Receipt semantic verification (verifyReceiptSemantics): required fields, recency
 * 4. Offer-receipt consistency (verifyOfferReceiptConsistency): resourceUrl, network, freshness
 * 5. Opt-in crypto + authorization: CryptoVerifier and SignerAuthorizer interfaces (types only)
 *
 * Each layer is separately callable and separately reportable.
 *
 * IMPORTANT: Cryptographic signature verification is NOT performed here.
 * That requires injecting a CryptoVerifier implementation.
 */

import { X402Error } from './errors.js';
import type {
  RawSignedOffer,
  RawEIP712SignedOffer,
  RawSignedReceipt,
  RawEIP712SignedReceipt,
  RawOfferPayload,
  RawReceiptPayload,
} from './raw.js';
import { extractOfferPayload, extractReceiptPayload } from './raw.js';
import type { NormalizedOfferPayload, NormalizedReceiptPayload } from './normalize.js';
import { normalizeOfferPayload, normalizeReceiptPayload } from './normalize.js';
import type {
  AcceptEntry,
  OfferVerification,
  ReceiptVerification,
  ConsistencyVerification,
  ConsistencyOptions,
  WireVerification,
  VerificationError,
  X402AdapterConfig,
  MismatchPolicy,
  AddressComparator,
} from './types.js';
import {
  MAX_ACCEPT_ENTRIES,
  MAX_AMOUNT_LENGTH,
  MAX_TOTAL_ACCEPTS_BYTES,
  defaultAddressComparator,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SUPPORTED_VERSIONS = [1];
const DEFAULT_CLOCK_SKEW_SECONDS = 60;
// Upstream x402 client helper uses 3600s (1 hour) default
const DEFAULT_RECEIPT_RECENCY_SECONDS = 3600;

// Per-field DoS limits (prevent giant strings in individual fields)
const MAX_FIELD_BYTES = 256;

// Per-entry total size limit (bounds settlement objects + all fields)
const MAX_ENTRY_BYTES = 2048;

// Portable byte length calculation
const textEncoder = new TextEncoder();
function getByteLength(str: string): number {
  return textEncoder.encode(str).length;
}

// ---------------------------------------------------------------------------
// Shape Validation (Runtime Type Guards)
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Count bytes in a JSON value without allocating the full JSON string.
 * Uses bounded traversal that stops early when limit is exceeded.
 */
function countJsonBytes(value: unknown, limit: number): number {
  const stack: Array<{ val: unknown; keys?: string[]; idx: number; isObj: boolean }> = [];
  const seen = new WeakSet<object>();
  let bytes = 0;

  const addStringBytes = (str: string): void => {
    bytes += 2 + getByteLength(str);
  };

  const countPrimitive = (val: unknown): void => {
    if (val === null) {
      bytes += 4;
    } else if (typeof val === 'boolean') {
      bytes += val ? 4 : 5;
    } else if (typeof val === 'number') {
      bytes += String(val).length;
    } else if (typeof val === 'string') {
      addStringBytes(val);
    }
  };

  if (value === null || typeof value !== 'object') {
    countPrimitive(value);
    return bytes;
  }

  if (seen.has(value as object)) return -1;
  seen.add(value as object);

  if (Array.isArray(value)) {
    bytes += 2;
    stack.push({ val: value, idx: 0, isObj: false });
  } else {
    bytes += 2;
    const keys = Object.keys(value as object);
    stack.push({ val: value, keys, idx: 0, isObj: true });
  }

  while (stack.length > 0 && bytes <= limit) {
    const frame = stack[stack.length - 1];

    if (frame.isObj) {
      const obj = frame.val as Record<string, unknown>;
      const keys = frame.keys!;

      if (frame.idx >= keys.length) {
        stack.pop();
        continue;
      }

      const key = keys[frame.idx];
      const childVal = obj[key];
      frame.idx++;

      if (frame.idx > 1) bytes += 1;
      addStringBytes(key);
      bytes += 1;

      if (childVal === null || typeof childVal !== 'object') {
        countPrimitive(childVal);
      } else {
        if (seen.has(childVal)) return -1;
        seen.add(childVal);
        if (Array.isArray(childVal)) {
          bytes += 2;
          stack.push({ val: childVal, idx: 0, isObj: false });
        } else {
          bytes += 2;
          const childKeys = Object.keys(childVal);
          stack.push({ val: childVal, keys: childKeys, idx: 0, isObj: true });
        }
      }
    } else {
      const arr = frame.val as unknown[];

      if (frame.idx >= arr.length) {
        stack.pop();
        continue;
      }

      const childVal = arr[frame.idx];
      frame.idx++;

      if (frame.idx > 1) bytes += 1;

      if (childVal === null || typeof childVal !== 'object') {
        countPrimitive(childVal);
      } else {
        if (seen.has(childVal)) return -1;
        seen.add(childVal);
        if (Array.isArray(childVal)) {
          bytes += 2;
          stack.push({ val: childVal, idx: 0, isObj: false });
        } else {
          bytes += 2;
          const childKeys = Object.keys(childVal);
          stack.push({ val: childVal, keys: childKeys, idx: 0, isObj: true });
        }
      }
    }
  }

  return bytes;
}

function validateAcceptEntryShape(entry: unknown, index: number): VerificationError | null {
  if (!isPlainObject(entry)) {
    return {
      code: 'accept_entry_invalid',
      message: `accepts[${index}] must be a plain object`,
      field: `accepts[${index}]`,
    };
  }

  const requiredStringFields = ['network', 'asset', 'payTo', 'amount', 'scheme'] as const;
  for (const field of requiredStringFields) {
    const value = entry[field];
    if (value === undefined || value === null) {
      return {
        code: 'accept_entry_invalid',
        message: `accepts[${index}].${field} is required`,
        field: `accepts[${index}].${field}`,
      };
    }
    if (typeof value !== 'string') {
      return {
        code: 'accept_entry_invalid',
        message: `accepts[${index}].${field} must be a string, got ${typeof value}`,
        field: `accepts[${index}].${field}`,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Regex Constants
// ---------------------------------------------------------------------------

// EIP-712 hex signature: 0x + 130 hex chars (65 bytes: r + s + v)
const EIP712_SIG_RE = /^0x[0-9a-fA-F]{130}$/;

// Amount: non-negative integer string
const AMOUNT_RE = /^(0|[1-9][0-9]*)$/;

// CAIP-2 network format
const CAIP2_NAMESPACE_RE = /^[a-z][a-z0-9-]{2,7}$/;
const CAIP2_REFERENCE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

// ---------------------------------------------------------------------------
// Layer 1: Wire Validation
// ---------------------------------------------------------------------------

/**
 * Validate raw wire structure of a signed offer
 *
 * Checks discriminated union shape, format tag, required fields.
 * No semantic interpretation, no payload extraction.
 */
export function verifyOfferWire(offer: RawSignedOffer): WireVerification {
  const errors: VerificationError[] = [];

  if (!offer || typeof offer !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'offer_invalid_format', message: 'Offer must be an object' }],
    };
  }

  if (offer.format !== 'eip712' && offer.format !== 'jws') {
    errors.push({
      code: 'offer_invalid_format',
      message: `Invalid signature format: ${String((offer as Record<string, unknown>).format)}`,
      field: 'format',
    });
    return { valid: false, errors };
  }

  if (!offer.signature || typeof offer.signature !== 'string') {
    errors.push({
      code: 'offer_invalid_format',
      message: 'Offer signature is required',
      field: 'signature',
    });
  }

  if (offer.format === 'eip712') {
    const eip = offer as RawEIP712SignedOffer;
    if (!eip.payload || typeof eip.payload !== 'object') {
      errors.push({
        code: 'offer_invalid_format',
        message: 'EIP-712 offer must have a payload object',
        field: 'payload',
      });
    }
    // Validate EIP-712 signature format
    if (eip.signature && !EIP712_SIG_RE.test(eip.signature)) {
      errors.push({
        code: 'offer_signature_invalid',
        message: 'EIP-712 signature must be 0x-prefixed 65-byte hex string',
        field: 'signature',
      });
    }
  }

  // JWS format: no payload field expected, signature is compact JWS
  // JWS structural validation is deferred to extraction (parseCompactJWS)

  if (offer.acceptIndex !== undefined) {
    if (
      typeof offer.acceptIndex !== 'number' ||
      !Number.isInteger(offer.acceptIndex) ||
      offer.acceptIndex < 0
    ) {
      errors.push({
        code: 'offer_invalid_format',
        message: 'acceptIndex must be a non-negative integer',
        field: 'acceptIndex',
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate raw wire structure of a signed receipt
 */
export function verifyReceiptWire(receipt: RawSignedReceipt): WireVerification {
  const errors: VerificationError[] = [];

  if (!receipt || typeof receipt !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'receipt_invalid_format', message: 'Receipt must be an object' }],
    };
  }

  if (receipt.format !== 'eip712' && receipt.format !== 'jws') {
    errors.push({
      code: 'receipt_invalid_format',
      message: `Invalid signature format: ${String((receipt as Record<string, unknown>).format)}`,
      field: 'format',
    });
    return { valid: false, errors };
  }

  if (!receipt.signature || typeof receipt.signature !== 'string') {
    errors.push({
      code: 'receipt_invalid_format',
      message: 'Receipt signature is required',
      field: 'signature',
    });
  }

  if (receipt.format === 'eip712') {
    const eip = receipt as RawEIP712SignedReceipt;
    if (!eip.payload || typeof eip.payload !== 'object') {
      errors.push({
        code: 'receipt_invalid_format',
        message: 'EIP-712 receipt must have a payload object',
        field: 'payload',
      });
    }
    if (eip.signature && !EIP712_SIG_RE.test(eip.signature)) {
      errors.push({
        code: 'receipt_signature_invalid',
        message: 'EIP-712 signature must be 0x-prefixed 65-byte hex string',
        field: 'signature',
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Layer 2: Offer Term Verification
// ---------------------------------------------------------------------------

/**
 * Verify an x402 signed offer against accept terms
 *
 * Extracts and normalizes payload, then performs:
 * - Version check
 * - Expiry check (with offerExpiryPolicy)
 * - Amount/network validation
 * - Term-matching against accept entries
 *
 * @param offer - The signed offer to verify
 * @param accepts - The list of acceptable payment terms
 * @param config - Optional adapter configuration
 * @returns Verification result with matched accept entry or errors
 */
export function verifyOffer(
  offer: RawSignedOffer,
  accepts: AcceptEntry[],
  config?: X402AdapterConfig
): OfferVerification {
  const errors: VerificationError[] = [];
  const supportedVersions = config?.supportedVersions ?? DEFAULT_SUPPORTED_VERSIONS;
  const clockSkew = config?.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  const now = config?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAccepts = config?.maxAcceptEntries ?? MAX_ACCEPT_ENTRIES;
  const mismatchPolicy = config?.mismatchPolicy ?? 'fail';
  const strictAmount = config?.strictAmountValidation ?? true;
  const strictNetwork = config?.strictNetworkValidation ?? true;
  // Default matches upstream: validUntil is optional
  const offerExpiryPolicy = config?.offerExpiryPolicy ?? 'allow_missing';
  const addressComparator = config?.addressComparator ?? defaultAddressComparator;
  const maxJwsBytes = config?.maxCompactJwsBytes;

  const acceptIndex = offer.acceptIndex;
  const hintProvided = acceptIndex !== undefined;
  const preMatchTermMatching = {
    method: 'scan' as const,
    hintProvided,
    hintMismatchDetected: false,
  };

  // 1. Wire validation
  const wireResult = verifyOfferWire(offer);
  if (!wireResult.valid) {
    return {
      valid: false,
      usedHint: false,
      errors: wireResult.errors,
      termMatching: preMatchTermMatching,
    };
  }

  // 2. Extract and normalize payload
  let rawPayload: RawOfferPayload;
  try {
    rawPayload = extractOfferPayload(offer, maxJwsBytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = e instanceof X402Error ? e.code : 'offer_invalid_format';
    return {
      valid: false,
      usedHint: false,
      errors: [{ code, message: msg }],
      termMatching: preMatchTermMatching,
    };
  }

  const payload = normalizeOfferPayload(rawPayload);

  // 3. DoS guard: check accepts array count
  if (accepts.length > maxAccepts) {
    errors.push({
      code: 'accept_too_many_entries',
      message: `Too many accept entries: ${accepts.length} exceeds limit of ${maxAccepts}`,
    });
    return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
  }

  // 3b. Validate accept entry shapes and sizes
  for (let i = 0; i < accepts.length; i++) {
    const entry = accepts[i];

    const shapeError = validateAcceptEntryShape(entry, i);
    if (shapeError) {
      errors.push(shapeError);
      return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
    }

    const entryError = validateAcceptEntrySize(entry as AcceptEntry, i);
    if (entryError) {
      errors.push(entryError);
      return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
    }

    const fieldError = validateAcceptFieldBytes(entry as AcceptEntry, i);
    if (fieldError) {
      errors.push(fieldError);
      return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
    }
  }

  // 3c. DoS guard: total accepts byte size
  const maxBytes = config?.maxTotalAcceptsBytes ?? MAX_TOTAL_ACCEPTS_BYTES;
  const acceptsBytes = countJsonBytes(accepts, maxBytes + 1);
  if (acceptsBytes === -1 || acceptsBytes > maxBytes) {
    errors.push({
      code: 'accept_too_many_entries',
      message: `Accepts array too large: exceeds limit of ${maxBytes} bytes`,
    });
    return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
  }

  // 4. Validate offer payload required fields
  const payloadErrors = validateOfferPayloadFields(rawPayload);
  if (payloadErrors.length > 0) {
    return {
      valid: false,
      usedHint: false,
      errors: payloadErrors,
      termMatching: preMatchTermMatching,
    };
  }

  // 5. Amount validation
  if (strictAmount) {
    const amountError = validateAmount(payload.amount, 'offer');
    if (amountError) {
      errors.push(amountError);
      return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
    }
  }

  // 6. Network validation
  if (strictNetwork && payload.network) {
    const networkError = validateNetwork(payload.network, 'offer');
    if (networkError) {
      errors.push(networkError);
      return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
    }
  }

  // 7. Version check
  if (!supportedVersions.includes(payload.version)) {
    errors.push({
      code: 'offer_version_unsupported',
      message: `Offer version ${payload.version} is not supported. Supported: ${supportedVersions.join(', ')}`,
      field: 'payload.version',
    });
    return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
  }

  // 8. Expiry check (with offerExpiryPolicy)
  if (payload.validUntil !== undefined) {
    // Expiry is present: check if expired
    if (payload.validUntil <= now - clockSkew) {
      errors.push({
        code: 'offer_expired',
        message: `Offer expired at ${payload.validUntil}, current time is ${now} (skew: ${clockSkew}s)`,
        field: 'payload.validUntil',
      });
      return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
    }
  } else {
    // No expiry: check policy
    if (offerExpiryPolicy === 'require') {
      errors.push({
        code: 'offer_no_expiry',
        message:
          'Offer has no expiry (validUntil absent or zero); offerExpiryPolicy requires expiry',
        field: 'payload.validUntil',
      });
      return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
    }
    // 'allow_missing': continue without expiry
  }

  // 9. Accept selection via term-matching
  if (accepts.length === 0) {
    errors.push({
      code: 'accept_no_match',
      message: 'No accept entries provided',
    });
    return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
  }

  return verifyWithMismatchPolicy(
    payload,
    accepts,
    acceptIndex,
    mismatchPolicy,
    errors,
    addressComparator
  );
}

// ---------------------------------------------------------------------------
// Layer 3: Receipt Semantic Verification
// ---------------------------------------------------------------------------

/**
 * Verify an x402 signed receipt
 *
 * Extracts and normalizes payload, then performs:
 * - Required field validation (version, network, resourceUrl, payer, issuedAt)
 * - Version check
 * - Payer format check
 * - issuedAt recency check
 * - Network validation
 */
export function verifyReceipt(
  receipt: RawSignedReceipt,
  config?: X402AdapterConfig
): ReceiptVerification {
  const errors: VerificationError[] = [];
  const supportedVersions = config?.supportedVersions ?? DEFAULT_SUPPORTED_VERSIONS;
  const strictNetwork = config?.strictNetworkValidation ?? true;
  const recencySeconds = config?.receiptRecencySeconds ?? DEFAULT_RECEIPT_RECENCY_SECONDS;
  const now = config?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const clockSkew = config?.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  const maxJwsBytes = config?.maxCompactJwsBytes;

  // 1. Wire validation
  const wireResult = verifyReceiptWire(receipt);
  if (!wireResult.valid) {
    return { valid: false, errors: wireResult.errors };
  }

  // 2. Extract and normalize payload
  let rawPayload: RawReceiptPayload;
  try {
    rawPayload = extractReceiptPayload(receipt, maxJwsBytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = e instanceof X402Error ? e.code : 'receipt_invalid_format';
    return { valid: false, errors: [{ code, message: msg }] };
  }

  const payload = normalizeReceiptPayload(rawPayload);

  // 3. Validate required fields
  const fieldErrors = validateReceiptPayloadFields(rawPayload);
  if (fieldErrors.length > 0) {
    return { valid: false, errors: fieldErrors };
  }

  // 4. Version check
  if (!supportedVersions.includes(payload.version)) {
    errors.push({
      code: 'receipt_version_unsupported',
      message: `Receipt version ${payload.version} is not supported. Supported: ${supportedVersions.join(', ')}`,
      field: 'payload.version',
    });
    return { valid: false, errors };
  }

  // 5. Network validation
  if (strictNetwork && payload.network) {
    const networkError = validateNetwork(payload.network, 'receipt');
    if (networkError) {
      errors.push(networkError);
      return { valid: false, errors };
    }
  }

  // 6. Payer validation (non-empty string)
  if (!payload.payer || typeof payload.payer !== 'string' || payload.payer.trim() === '') {
    errors.push({
      code: 'receipt_payer_invalid',
      message: 'Receipt payer must be a non-empty string',
      field: 'payload.payer',
    });
    return { valid: false, errors };
  }

  // 7. issuedAt recency check
  if (payload.issuedAt < now - recencySeconds - clockSkew) {
    errors.push({
      code: 'receipt_issuedAt_stale',
      message: `Receipt issuedAt ${payload.issuedAt} is too old (current: ${now}, recency window: ${recencySeconds}s, skew: ${clockSkew}s)`,
      field: 'payload.issuedAt',
    });
    return { valid: false, errors };
  }

  // 8. Transaction validation (if present, must be non-empty string)
  if (
    payload.transaction !== undefined &&
    (typeof payload.transaction !== 'string' || payload.transaction.trim() === '')
  ) {
    errors.push({
      code: 'receipt_invalid_format',
      message: 'Receipt transaction, if present, must be a non-empty string',
      field: 'payload.transaction',
    });
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

// ---------------------------------------------------------------------------
// Layer 4: Offer-Receipt Consistency
// ---------------------------------------------------------------------------

/**
 * Verify consistency between an offer and a receipt
 *
 * Checks:
 * - resourceUrl must match (exact string comparison)
 * - network must match
 * - issuedAt freshness relative to offer validity window
 * - payer must match one of payerCandidates (if provided, network-aware)
 */
export function verifyOfferReceiptConsistency(
  offerPayload: NormalizedOfferPayload,
  receiptPayload: NormalizedReceiptPayload,
  config?: X402AdapterConfig,
  options?: ConsistencyOptions
): ConsistencyVerification {
  const errors: VerificationError[] = [];
  const clockSkew = config?.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  const addressComparator =
    options?.addressComparator ?? config?.addressComparator ?? defaultAddressComparator;

  // 1. resourceUrl must match
  if (offerPayload.resourceUrl !== receiptPayload.resourceUrl) {
    errors.push({
      code: 'receipt_resource_mismatch',
      message: `Receipt resourceUrl "${receiptPayload.resourceUrl}" does not match offer resourceUrl "${offerPayload.resourceUrl}"`,
      field: 'payload.resourceUrl',
    });
  }

  // 2. network must match
  if (offerPayload.network !== receiptPayload.network) {
    errors.push({
      code: 'receipt_network_mismatch',
      message: `Receipt network "${receiptPayload.network}" does not match offer network "${offerPayload.network}"`,
      field: 'payload.network',
    });
  }

  // 3. issuedAt freshness: receipt must be issued within the offer's validity window
  if (
    offerPayload.validUntil !== undefined &&
    receiptPayload.issuedAt > offerPayload.validUntil + clockSkew
  ) {
    errors.push({
      code: 'receipt_issuedAt_stale',
      message: `Receipt issuedAt ${receiptPayload.issuedAt} is after offer validUntil ${offerPayload.validUntil}`,
      field: 'payload.issuedAt',
    });
  }

  // 4. Payer candidate check
  if (options?.payerCandidates && options.payerCandidates.length > 0) {
    const network = receiptPayload.network;
    const payer = receiptPayload.payer;
    const matched = options.payerCandidates.some((candidate) =>
      addressComparator(payer, candidate, network)
    );
    if (!matched) {
      errors.push({
        code: 'receipt_payer_not_in_candidates',
        message: `Receipt payer "${payer}" does not match any expected payer candidate`,
        field: 'payload.payer',
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Term Matching
// ---------------------------------------------------------------------------

/**
 * Match normalized offer payload fields against a single accept entry
 *
 * Compares: network, asset, payTo, amount, scheme
 * All fields must match. Amount comparison is string-based.
 * payTo comparison uses the address comparator (network-aware).
 * @returns Array of mismatched field names (empty = match)
 */
export function matchAcceptTerms(
  payload: NormalizedOfferPayload,
  accept: AcceptEntry,
  addressComparator: AddressComparator = defaultAddressComparator
): string[] {
  const mismatches: string[] = [];

  if (payload.network !== accept.network) {
    mismatches.push('network');
  }
  if (payload.asset !== accept.asset) {
    mismatches.push('asset');
  }
  // Network-aware address comparison
  if (!addressComparator(payload.payTo, accept.payTo, payload.network)) {
    mismatches.push('payTo');
  }
  if (payload.amount !== accept.amount) {
    mismatches.push('amount');
  }
  // scheme is always compared (required per upstream)
  if (payload.scheme !== accept.scheme) {
    mismatches.push('scheme');
  }

  return mismatches;
}

// ---------------------------------------------------------------------------
// Accept Selection
// ---------------------------------------------------------------------------

/**
 * Select the matching accept entry from the list
 *
 * Selection logic:
 * - If acceptIndex provided: bounds-check, then term-match that entry
 * - If absent: scan all entries for a unique match
 * - If multiple matches: fail closed (ambiguous)
 * - If no matches: fail closed
 */
export function selectAccept(
  payload: NormalizedOfferPayload,
  accepts: AcceptEntry[],
  acceptIndex?: number,
  addressComparator: AddressComparator = defaultAddressComparator
): { entry: AcceptEntry; index: number; usedHint: boolean } {
  if (accepts.length === 0) {
    throw new X402Error('accept_no_match', 'No accept entries provided');
  }

  if (acceptIndex !== undefined) {
    if (acceptIndex < 0 || acceptIndex >= accepts.length) {
      throw new X402Error(
        'accept_index_out_of_range',
        `acceptIndex ${acceptIndex} is out of range [0, ${accepts.length - 1}]`,
        {
          field: 'acceptIndex',
          details: { acceptIndex, acceptsLength: accepts.length },
        }
      );
    }

    const entry = accepts[acceptIndex];
    const mismatches = matchAcceptTerms(payload, entry, addressComparator);
    if (mismatches.length > 0) {
      throw new X402Error(
        'accept_term_mismatch',
        `acceptIndex ${acceptIndex} does not match signed payload on: ${mismatches.join(', ')}`,
        {
          field: 'acceptIndex',
          details: { acceptIndex, mismatches },
        }
      );
    }

    return { entry, index: acceptIndex, usedHint: true };
  }

  const matches: Array<{ entry: AcceptEntry; index: number }> = [];

  for (let i = 0; i < accepts.length; i++) {
    const mismatches = matchAcceptTerms(payload, accepts[i], addressComparator);
    if (mismatches.length === 0) {
      matches.push({ entry: accepts[i], index: i });
    }
  }

  if (matches.length === 0) {
    throw new X402Error('accept_no_match', 'No accept entry matches the signed offer payload');
  }

  if (matches.length > 1) {
    throw new X402Error(
      'accept_ambiguous',
      `${matches.length} accept entries match the offer payload; provide acceptIndex to disambiguate`,
      {
        details: { matchedIndices: matches.map((m) => m.index) },
      }
    );
  }

  return { entry: matches[0].entry, index: matches[0].index, usedHint: false };
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Validate raw offer payload required fields
 */
function validateOfferPayloadFields(p: RawOfferPayload): VerificationError[] {
  const errors: VerificationError[] = [];

  const requiredFields: Array<[string, unknown, string]> = [
    ['version', p.version, 'number'],
    ['network', p.network, 'string'],
    ['asset', p.asset, 'string'],
    ['amount', p.amount, 'string'],
    ['payTo', p.payTo, 'string'],
    ['resourceUrl', p.resourceUrl, 'string'],
    ['scheme', p.scheme, 'string'],
  ];

  for (const [name, value, expectedType] of requiredFields) {
    if (value === undefined || value === null) {
      errors.push({
        code: 'payload_missing_field',
        message: `Offer payload missing required field: ${name}`,
        field: `payload.${name}`,
      });
    } else if (typeof value !== expectedType) {
      errors.push({
        code: 'offer_invalid_format',
        message: `Offer payload.${name} must be ${expectedType}, got ${typeof value}`,
        field: `payload.${name}`,
      });
    }
  }

  // resourceUrl must be non-empty
  if (typeof p.resourceUrl === 'string' && p.resourceUrl.trim() === '') {
    errors.push({
      code: 'offer_invalid_format',
      message: 'Offer payload.resourceUrl must be a non-empty string',
      field: 'payload.resourceUrl',
    });
  }

  return errors;
}

/**
 * Validate raw receipt payload required fields
 */
function validateReceiptPayloadFields(p: RawReceiptPayload): VerificationError[] {
  const errors: VerificationError[] = [];

  const requiredFields: Array<[string, unknown, string]> = [
    ['version', p.version, 'number'],
    ['network', p.network, 'string'],
    ['resourceUrl', p.resourceUrl, 'string'],
    ['payer', p.payer, 'string'],
    ['issuedAt', p.issuedAt, 'number'],
  ];

  for (const [name, value, expectedType] of requiredFields) {
    if (value === undefined || value === null) {
      errors.push({
        code: 'payload_missing_field',
        message: `Receipt payload missing required field: ${name}`,
        field: `payload.${name}`,
      });
    } else if (typeof value !== expectedType) {
      errors.push({
        code: 'receipt_invalid_format',
        message: `Receipt payload.${name} must be ${expectedType}, got ${typeof value}`,
        field: `payload.${name}`,
      });
    }
  }

  return errors;
}

function validateAmount(amount: string, kind: 'offer' | 'receipt'): VerificationError | null {
  if (amount.length > MAX_AMOUNT_LENGTH) {
    return {
      code: 'amount_invalid',
      message: `${kind} amount exceeds maximum length of ${MAX_AMOUNT_LENGTH} characters`,
      field: 'payload.amount',
    };
  }
  if (!AMOUNT_RE.test(amount)) {
    return {
      code: 'amount_invalid',
      message: `${kind} amount must be a non-negative integer string (got: "${amount}")`,
      field: 'payload.amount',
    };
  }
  return null;
}

function validateAcceptEntrySize(entry: AcceptEntry, index: number): VerificationError | null {
  const entryBytes = countJsonBytes(entry, MAX_ENTRY_BYTES + 1);
  if (entryBytes === -1) {
    return {
      code: 'accept_entry_invalid',
      message: `accepts[${index}] contains circular reference`,
      field: `accepts[${index}]`,
    };
  }
  if (entryBytes > MAX_ENTRY_BYTES) {
    return {
      code: 'accept_entry_invalid',
      message: `accepts[${index}] exceeds max entry size of ${MAX_ENTRY_BYTES} bytes`,
      field: `accepts[${index}]`,
    };
  }
  return null;
}

function validateAcceptFieldBytes(entry: AcceptEntry, index: number): VerificationError | null {
  const fields: Array<[string, string | undefined]> = [
    ['network', entry.network],
    ['asset', entry.asset],
    ['payTo', entry.payTo],
    ['scheme', entry.scheme],
  ];

  for (const [name, value] of fields) {
    if (value && getByteLength(value) > MAX_FIELD_BYTES) {
      return {
        code: 'accept_too_many_entries',
        message: `accepts[${index}].${name} exceeds max field size of ${MAX_FIELD_BYTES} bytes`,
        field: `accepts[${index}].${name}`,
      };
    }
  }

  if (entry.amount && entry.amount.length > MAX_AMOUNT_LENGTH) {
    return {
      code: 'amount_invalid',
      message: `accepts[${index}].amount exceeds max length of ${MAX_AMOUNT_LENGTH}`,
      field: `accepts[${index}].amount`,
    };
  }

  return null;
}

function validateNetwork(network: string, kind: 'offer' | 'receipt'): VerificationError | null {
  const parts = network.split(':');
  if (parts.length !== 2) {
    return {
      code: 'network_invalid',
      message: `${kind} network must be CAIP-2 format (namespace:reference), got "${network}"`,
      field: 'payload.network',
    };
  }
  const [namespace, reference] = parts;
  if (!CAIP2_NAMESPACE_RE.test(namespace)) {
    return {
      code: 'network_invalid',
      message: `${kind} network namespace invalid: "${namespace}" (expected 3-8 lowercase chars starting with letter)`,
      field: 'payload.network',
    };
  }
  if (!CAIP2_REFERENCE_RE.test(reference)) {
    return {
      code: 'network_invalid',
      message: `${kind} network reference invalid: "${reference}" (expected 1-64 alphanumeric chars with hyphens/underscores)`,
      field: 'payload.network',
    };
  }
  return null;
}

/**
 * Verify offer with mismatchPolicy support
 */
function verifyWithMismatchPolicy(
  payload: NormalizedOfferPayload,
  accepts: AcceptEntry[],
  acceptIndex: number | undefined,
  mismatchPolicy: MismatchPolicy,
  errors: VerificationError[],
  addressComparator: AddressComparator
): OfferVerification {
  const hintProvided = acceptIndex !== undefined;

  if (mismatchPolicy === 'ignore_and_scan') {
    return verifyWithScan(payload, accepts, errors, hintProvided, false, addressComparator);
  }

  if (acceptIndex === undefined) {
    return verifyWithScan(payload, accepts, errors, false, false, addressComparator);
  }

  if (acceptIndex < 0 || acceptIndex >= accepts.length) {
    if (mismatchPolicy === 'warn_and_scan') {
      return verifyWithScan(payload, accepts, errors, true, true, addressComparator);
    }
    errors.push({
      code: 'accept_index_out_of_range',
      message: `acceptIndex ${acceptIndex} is out of range [0, ${accepts.length - 1}]`,
      field: 'acceptIndex',
    });
    return {
      valid: false,
      usedHint: true,
      errors,
      termMatching: { method: 'hint', hintProvided: true, hintMismatchDetected: true },
    };
  }

  const entry = accepts[acceptIndex];
  const mismatches = matchAcceptTerms(payload, entry, addressComparator);

  if (mismatches.length === 0) {
    return {
      valid: true,
      matchedAccept: entry,
      matchedIndex: acceptIndex,
      usedHint: true,
      errors: [],
      termMatching: { method: 'hint', hintProvided: true, hintMismatchDetected: false },
    };
  }

  if (mismatchPolicy === 'fail') {
    errors.push({
      code: 'accept_term_mismatch',
      message: `acceptIndex ${acceptIndex} does not match signed payload on: ${mismatches.join(', ')}`,
      field: 'acceptIndex',
    });
    return {
      valid: false,
      usedHint: true,
      errors,
      termMatching: { method: 'hint', hintProvided: true, hintMismatchDetected: true },
    };
  }

  return verifyWithScan(payload, accepts, errors, true, true, addressComparator);
}

function verifyWithScan(
  payload: NormalizedOfferPayload,
  accepts: AcceptEntry[],
  errors: VerificationError[],
  hintProvided: boolean,
  hintMismatchDetected: boolean,
  addressComparator: AddressComparator
): OfferVerification {
  const matches: Array<{ entry: AcceptEntry; index: number }> = [];

  for (let i = 0; i < accepts.length; i++) {
    const mismatches = matchAcceptTerms(payload, accepts[i], addressComparator);
    if (mismatches.length === 0) {
      matches.push({ entry: accepts[i], index: i });
    }
  }

  const termMatching = {
    method: 'scan' as const,
    hintProvided,
    hintMismatchDetected,
  };

  if (matches.length === 0) {
    errors.push({
      code: 'accept_no_match',
      message: 'No accept entry matches the signed offer payload',
    });
    return { valid: false, usedHint: false, errors, termMatching };
  }

  if (matches.length > 1) {
    errors.push({
      code: 'accept_ambiguous',
      message: `${matches.length} accept entries match; provide acceptIndex to disambiguate`,
    });
    return { valid: false, usedHint: false, errors, termMatching };
  }

  return {
    valid: true,
    matchedAccept: matches[0].entry,
    matchedIndex: matches[0].index,
    usedHint: false,
    errors: [],
    termMatching,
  };
}
