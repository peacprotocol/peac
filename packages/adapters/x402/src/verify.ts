/**
 * x402 Offer/Receipt verification
 *
 * Verification strategy (PEAC-first):
 * 1. Structural validation (format, required fields)
 * 2. DoS guards (accepts array limits)
 * 3. Amount validation (non-negative integer string)
 * 4. Network validation (CAIP-2 format)
 * 5. Expiry check (validUntil vs current time)
 * 6. Version check (supported versions)
 * 7. Signature format validation (EIP-712 or JWS structure)
 * 8. Term-matching (offer payload vs accept entry)
 *
 * IMPORTANT: Cryptographic signature verification (EIP-712 recovery, JWS validation)
 * is NOT performed here. That requires a crypto provider (viem, ethers, etc.)
 * and should be done by the caller before passing artifacts to this adapter.
 *
 * `valid: true` does NOT imply cryptographic signature validity unless a
 * CryptoVerifier is supplied and `verification.cryptographic.verified` is true.
 *
 * The focus of this module is TERM-MATCHING: ensuring the signed payload
 * fields match the declared accept terms. This is the binding mechanism
 * that makes unsigned acceptIndex irrelevant for security.
 */

import { X402Error } from './errors.js';
import type {
  OfferPayload,
  SignedOffer,
  SignedReceipt,
  AcceptEntry,
  OfferVerification,
  ReceiptVerification,
  VerificationError,
  X402AdapterConfig,
  MismatchPolicy,
} from './types.js';
import { MAX_ACCEPT_ENTRIES, MAX_AMOUNT_LENGTH, MAX_TOTAL_ACCEPTS_BYTES } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SUPPORTED_VERSIONS = ['1'];
const DEFAULT_CLOCK_SKEW_SECONDS = 60;

// Per-field DoS limits (prevent giant strings in individual fields)
// These are BYTE limits, not character counts, to handle UTF-8 multibyte strings
const MAX_FIELD_BYTES = 256; // Generous limit for network/asset/payTo/scheme

// Per-entry total size limit (bounds settlement objects + all fields)
// With 128 entries max, 2KB each = 256KB total (matches MAX_TOTAL_ACCEPTS_BYTES)
const MAX_ENTRY_BYTES = 2048;

// Portable byte length calculation (works in Node.js and edge runtimes)
const textEncoder = new TextEncoder();
function getByteLength(str: string): number {
  return textEncoder.encode(str).length;
}

// Regex for JWS compact serialization: header.payload.signature
const JWS_COMPACT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// Regex for EIP-712 hex signature: 0x + 130 hex chars (65 bytes: r + s + v)
const EIP712_SIG_RE = /^0x[0-9a-fA-F]{130}$/;

// Regex for amount: non-negative integer string (no decimals, no leading zeros except "0")
const AMOUNT_RE = /^(0|[1-9][0-9]*)$/;

// CAIP-2 network format: namespace:reference
// Per CAIP-2 spec: https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md
// namespace: 3-8 chars (lowercase letters, digits, hyphens)
// reference: 1-64 chars (letters, digits, hyphens, underscores)
// Examples: eip155:1, eip155:8453, cosmos:cosmoshub-4, solana:mainnet
const CAIP2_NAMESPACE_RE = /^[a-z][a-z0-9-]{2,7}$/;
const CAIP2_REFERENCE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

// ---------------------------------------------------------------------------
// Offer Verification
// ---------------------------------------------------------------------------

/**
 * Verify an x402 signed offer against accept terms
 *
 * This performs structural validation, expiry/version checks, and
 * term-matching against the provided accept entries. It does NOT verify
 * the cryptographic signature (that is the caller's responsibility).
 *
 * @param offer - The signed offer to verify
 * @param accepts - The list of acceptable payment terms
 * @param acceptIndex - Optional hint index (unsigned, treat as advisory)
 * @param config - Optional adapter configuration
 * @returns Verification result with matched accept entry or errors
 */
export function verifyOffer(
  offer: SignedOffer,
  accepts: AcceptEntry[],
  acceptIndex?: number,
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

  // Pre-term-matching default: we know if hint was provided, but haven't checked for mismatch yet
  const hintProvided = acceptIndex !== undefined;
  const preMatchTermMatching = {
    method: 'scan' as const,
    hintProvided,
    hintMismatchDetected: false,
  };

  // 1. Structural validation
  const structErrors = validateOfferStructure(offer);
  if (structErrors.length > 0) {
    return { valid: false, usedHint: false, errors: structErrors, termMatching: preMatchTermMatching };
  }

  const payload = offer.payload;

  // 2. DoS guard: check accepts array count
  if (accepts.length > maxAccepts) {
    errors.push({
      code: 'accept_too_many_entries',
      message: `Too many accept entries: ${accepts.length} exceeds limit of ${maxAccepts}`,
    });
    return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
  }

  // 2b. DoS guard: validate per-entry total size (including settlement) BEFORE aggregate stringify
  // This bounds the memory cost of subsequent operations and prevents "stringify bomb" attacks
  for (let i = 0; i < accepts.length; i++) {
    const entry = accepts[i];
    // Check per-entry total size first (bounds settlement + all fields)
    const entryError = validateAcceptEntrySize(entry, i);
    if (entryError) {
      errors.push(entryError);
      return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
    }
    // Then check individual string field sizes for clearer error messages
    const fieldError = validateAcceptFieldBytes(entry, i);
    if (fieldError) {
      errors.push(fieldError);
      return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
    }
  }

  // 2c. DoS guard: check total accepts byte size (safe now since per-entry is bounded)
  const maxBytes = config?.maxTotalAcceptsBytes ?? MAX_TOTAL_ACCEPTS_BYTES;
  const acceptsBytes = getByteLength(JSON.stringify(accepts));
  if (acceptsBytes > maxBytes) {
    errors.push({
      code: 'accept_too_many_entries',
      message: `Accepts array too large: ${acceptsBytes} bytes exceeds limit of ${maxBytes}`,
    });
    return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
  }

  // 3. Amount validation (if enabled)
  if (strictAmount) {
    const amountError = validateAmount(payload.amount, 'offer');
    if (amountError) {
      errors.push(amountError);
      return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
    }
  }

  // 4. Network validation (if enabled)
  if (strictNetwork && payload.network) {
    const networkError = validateNetwork(payload.network, 'offer');
    if (networkError) {
      errors.push(networkError);
      return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
    }
  }

  // 5. Version check
  if (!supportedVersions.includes(payload.version)) {
    errors.push({
      code: 'offer_version_unsupported',
      message: `Offer version "${payload.version}" is not supported. Supported: ${supportedVersions.join(', ')}`,
      field: 'payload.version',
    });
    return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
  }

  // 6. Expiry check (with clock skew tolerance)
  if (payload.validUntil <= now - clockSkew) {
    errors.push({
      code: 'offer_expired',
      message: `Offer expired at ${payload.validUntil}, current time is ${now} (skew: ${clockSkew}s)`,
      field: 'payload.validUntil',
    });
    return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
  }

  // 7. Signature format validation (structural only, not cryptographic)
  const sigError = validateSignatureFormat(offer.signature, offer.format, 'offer');
  if (sigError) {
    errors.push(sigError);
    return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
  }

  // 8. Accept selection via term-matching with mismatchPolicy support
  if (accepts.length === 0) {
    errors.push({
      code: 'accept_no_match',
      message: 'No accept entries provided',
    });
    return { valid: false, usedHint: false, errors, termMatching: preMatchTermMatching };
  }

  return verifyWithMismatchPolicy(payload, accepts, acceptIndex, mismatchPolicy, errors);
}

/**
 * Verify an x402 signed receipt
 *
 * Performs structural validation on the receipt. Does NOT verify
 * the cryptographic signature.
 *
 * @param receipt - The signed receipt to verify
 * @param config - Optional adapter configuration
 * @returns Verification result with errors if invalid
 */
export function verifyReceipt(
  receipt: SignedReceipt,
  config?: X402AdapterConfig
): ReceiptVerification {
  const errors: VerificationError[] = [];
  const strictAmount = config?.strictAmountValidation ?? true;
  const strictNetwork = config?.strictNetworkValidation ?? true;
  const supportedVersions = config?.supportedVersions ?? DEFAULT_SUPPORTED_VERSIONS;

  // 1. Structural validation (format, required fields)
  const structErrors = validateReceiptStructure(receipt);
  if (structErrors.length > 0) {
    return { valid: false, errors: structErrors };
  }

  // 2. Version check (before semantic validation)
  if (!supportedVersions.includes(receipt.payload.version)) {
    errors.push({
      code: 'receipt_version_unsupported',
      message: `Receipt version "${receipt.payload.version}" is not supported. Supported: ${supportedVersions.join(', ')}`,
      field: 'payload.version',
    });
    return { valid: false, errors };
  }

  // 3. Signature format validation (structural, not cryptographic)
  const sigError = validateSignatureFormat(receipt.signature, receipt.format, 'receipt');
  if (sigError) {
    errors.push(sigError);
    return { valid: false, errors };
  }

  // 4. Amount validation (if present and enabled)
  if (strictAmount && receipt.payload.amount) {
    const amountError = validateAmount(receipt.payload.amount, 'receipt');
    if (amountError) {
      errors.push(amountError);
      return { valid: false, errors };
    }
  }

  // 5. Network validation (if enabled)
  if (strictNetwork && receipt.payload.network) {
    const networkError = validateNetwork(receipt.payload.network, 'receipt');
    if (networkError) {
      errors.push(networkError);
      return { valid: false, errors };
    }
  }

  return { valid: true, errors: [] };
}

// ---------------------------------------------------------------------------
// Term Matching
// ---------------------------------------------------------------------------

/**
 * Match offer payload fields against a single accept entry
 *
 * Compares: network, asset, payTo, amount, scheme, settlement
 * All present fields must match exactly. Amount comparison is string-based
 * (minor units) to avoid floating-point issues.
 *
 * @returns Array of mismatched field names (empty = match)
 */
export function matchAcceptTerms(payload: OfferPayload, accept: AcceptEntry): string[] {
  const mismatches: string[] = [];

  if (payload.network !== accept.network) {
    mismatches.push('network');
  }
  if (payload.asset !== accept.asset) {
    mismatches.push('asset');
  }
  if (payload.payTo !== accept.payTo) {
    mismatches.push('payTo');
  }
  if (payload.amount !== accept.amount) {
    mismatches.push('amount');
  }

  // Optional fields: only compare if both are present
  if (payload.scheme !== undefined && accept.scheme !== undefined) {
    if (payload.scheme !== accept.scheme) {
      mismatches.push('scheme');
    }
  }

  return mismatches;
}

// ---------------------------------------------------------------------------
// Accept Selection
// ---------------------------------------------------------------------------

/**
 * Select the matching accept entry from the list
 *
 * Strategy:
 * - If acceptIndex provided: bounds-check, then term-match that entry
 * - If absent: scan all entries for a unique match
 * - If multiple matches: fail closed (ambiguous)
 * - If no matches: fail closed
 *
 * @param payload - Offer payload to match
 * @param accepts - List of accept entries
 * @param acceptIndex - Optional hint (unsigned, untrusted)
 * @returns The matched entry and its index, or throws X402Error
 */
export function selectAccept(
  payload: OfferPayload,
  accepts: AcceptEntry[],
  acceptIndex?: number
): { entry: AcceptEntry; index: number; usedHint: boolean } {
  if (accepts.length === 0) {
    throw new X402Error('accept_no_match', 'No accept entries provided');
  }

  if (acceptIndex !== undefined) {
    // Bounds check
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

    // Term-match the hinted entry
    const entry = accepts[acceptIndex];
    const mismatches = matchAcceptTerms(payload, entry);
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

  // Full scan: find all matching entries
  const matches: Array<{ entry: AcceptEntry; index: number }> = [];

  for (let i = 0; i < accepts.length; i++) {
    const mismatches = matchAcceptTerms(payload, accepts[i]);
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
 * Validate offer structural requirements (fail-closed)
 */
function validateOfferStructure(offer: SignedOffer): VerificationError[] {
  const errors: VerificationError[] = [];

  if (!offer || typeof offer !== 'object') {
    return [{ code: 'offer_invalid_format', message: 'Offer must be an object' }];
  }

  if (!offer.payload || typeof offer.payload !== 'object') {
    errors.push({
      code: 'offer_invalid_format',
      message: 'Offer payload is required',
      field: 'payload',
    });
    return errors;
  }

  if (!offer.signature || typeof offer.signature !== 'string') {
    errors.push({
      code: 'offer_invalid_format',
      message: 'Offer signature is required',
      field: 'signature',
    });
  }

  if (offer.format !== 'eip712' && offer.format !== 'jws') {
    errors.push({
      code: 'offer_invalid_format',
      message: `Invalid signature format: ${String(offer.format)}`,
      field: 'format',
    });
  }

  // Payload field validation
  const p = offer.payload;
  const requiredFields: Array<[string, unknown, string]> = [
    ['version', p.version, 'string'],
    ['validUntil', p.validUntil, 'number'],
    ['network', p.network, 'string'],
    ['asset', p.asset, 'string'],
    ['amount', p.amount, 'string'],
    ['payTo', p.payTo, 'string'],
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

  return errors;
}

/**
 * Validate receipt structural requirements (fail-closed)
 */
function validateReceiptStructure(receipt: SignedReceipt): VerificationError[] {
  const errors: VerificationError[] = [];

  if (!receipt || typeof receipt !== 'object') {
    return [{ code: 'receipt_invalid_format', message: 'Receipt must be an object' }];
  }

  if (!receipt.payload || typeof receipt.payload !== 'object') {
    errors.push({
      code: 'receipt_invalid_format',
      message: 'Receipt payload is required',
      field: 'payload',
    });
    return errors;
  }

  if (!receipt.signature || typeof receipt.signature !== 'string') {
    errors.push({
      code: 'receipt_invalid_format',
      message: 'Receipt signature is required',
      field: 'signature',
    });
  }

  if (receipt.format !== 'eip712' && receipt.format !== 'jws') {
    errors.push({
      code: 'receipt_invalid_format',
      message: `Invalid signature format: ${String(receipt.format)}`,
      field: 'format',
    });
  }

  const p = receipt.payload;
  const requiredFields: Array<[string, unknown, string]> = [
    ['version', p.version, 'string'],
    ['network', p.network, 'string'],
    ['txHash', p.txHash, 'string'],
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

/**
 * Validate signature format (structural, not cryptographic)
 *
 * @param signature - The signature string to validate
 * @param format - The declared signature format
 * @param kind - 'offer' or 'receipt' for correct error code
 */
function validateSignatureFormat(
  signature: string,
  format: 'eip712' | 'jws',
  kind: 'offer' | 'receipt'
): VerificationError | null {
  const errorCode = kind === 'offer' ? 'offer_signature_invalid' : 'receipt_signature_invalid';

  if (format === 'jws') {
    if (!JWS_COMPACT_RE.test(signature)) {
      return {
        code: errorCode,
        message:
          'JWS signature does not match compact serialization format (header.payload.signature)',
        field: 'signature',
      };
    }
  } else if (format === 'eip712') {
    if (!EIP712_SIG_RE.test(signature)) {
      return {
        code: errorCode,
        message: 'EIP-712 signature must be 0x-prefixed 65-byte hex string',
        field: 'signature',
      };
    }
  }
  return null;
}

/**
 * Validate amount is a non-negative integer string
 *
 * @param amount - The amount string to validate
 * @param kind - 'offer' or 'receipt' for context in error message
 */
function validateAmount(amount: string, kind: 'offer' | 'receipt'): VerificationError | null {
  // Check length first (DoS protection)
  if (amount.length > MAX_AMOUNT_LENGTH) {
    return {
      code: 'amount_invalid',
      message: `${kind} amount exceeds maximum length of ${MAX_AMOUNT_LENGTH} characters`,
      field: 'payload.amount',
    };
  }

  // Check format: non-negative integer string
  if (!AMOUNT_RE.test(amount)) {
    return {
      code: 'amount_invalid',
      message: `${kind} amount must be a non-negative integer string (got: "${amount}")`,
      field: 'payload.amount',
    };
  }

  return null;
}

/**
 * Validate accept entry total size (DoS protection)
 *
 * Bounds the total serialized size of each entry, including settlement objects.
 * This prevents "stringify bomb" attacks where small string fields hide large settlement objects.
 */
function validateAcceptEntrySize(entry: AcceptEntry, index: number): VerificationError | null {
  const entryJson = JSON.stringify(entry);
  const entryBytes = getByteLength(entryJson);

  if (entryBytes > MAX_ENTRY_BYTES) {
    return {
      code: 'accept_too_many_entries',
      message: `accepts[${index}] exceeds max entry size of ${MAX_ENTRY_BYTES} bytes (got ${entryBytes})`,
      field: `accepts[${index}]`,
    };
  }

  return null;
}

/**
 * Validate accept entry field byte lengths (DoS protection)
 *
 * Prevents memory exhaustion from individual giant strings within accept entries.
 * Uses getByteLength (TextEncoder) to handle UTF-8 multibyte characters correctly.
 */
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

  // Amount has its own limit (MAX_AMOUNT_LENGTH = 78 chars, but amount is ASCII-only digits)
  if (entry.amount && entry.amount.length > MAX_AMOUNT_LENGTH) {
    return {
      code: 'amount_invalid',
      message: `accepts[${index}].amount exceeds max length of ${MAX_AMOUNT_LENGTH}`,
      field: `accepts[${index}].amount`,
    };
  }

  return null;
}

/**
 * Validate network matches CAIP-2 format
 *
 * Uses split-based parsing for clarity and debuggability:
 * - Must have exactly one colon separator
 * - namespace: 3-8 chars, starts with letter, lowercase letters/digits/hyphens
 * - reference: 1-64 chars, starts with alphanumeric, letters/digits/hyphens/underscores
 *
 * @param network - The network string to validate
 * @param kind - 'offer' or 'receipt' for context in error message
 */
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
 *
 * Implements the three mismatch policies:
 * - 'fail': Reject on mismatch (default)
 * - 'warn_and_scan': If hint mismatches, scan for match, record mismatch
 * - 'ignore_and_scan': Always scan, ignore hint for matching
 */
function verifyWithMismatchPolicy(
  payload: OfferPayload,
  accepts: AcceptEntry[],
  acceptIndex: number | undefined,
  mismatchPolicy: MismatchPolicy,
  errors: VerificationError[]
): OfferVerification {
  const hintProvided = acceptIndex !== undefined;

  // ignore_and_scan: always scan, ignore acceptIndex for matching
  if (mismatchPolicy === 'ignore_and_scan') {
    return verifyWithScan(payload, accepts, errors, hintProvided, false);
  }

  // No hint provided: scan
  if (acceptIndex === undefined) {
    return verifyWithScan(payload, accepts, errors, false, false);
  }

  // Bounds check
  if (acceptIndex < 0 || acceptIndex >= accepts.length) {
    if (mismatchPolicy === 'warn_and_scan') {
      // Out of range counts as mismatch, fallback to scan
      return verifyWithScan(payload, accepts, errors, true, true);
    }
    // fail policy: reject
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

  // Term-match the hinted entry
  const entry = accepts[acceptIndex];
  const mismatches = matchAcceptTerms(payload, entry);

  if (mismatches.length === 0) {
    // Hint matched: success
    return {
      valid: true,
      matchedAccept: entry,
      matchedIndex: acceptIndex,
      usedHint: true,
      errors: [],
      termMatching: { method: 'hint', hintProvided: true, hintMismatchDetected: false },
    };
  }

  // Hint didn't match
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

  // warn_and_scan: fallback to scan, record mismatch
  return verifyWithScan(payload, accepts, errors, true, true);
}

/**
 * Verify offer by scanning all accept entries
 *
 * @param hintProvided - Whether acceptIndex was provided (for termMatching metadata)
 * @param hintMismatchDetected - Whether the hint was tried and failed (for termMatching metadata)
 */
function verifyWithScan(
  payload: OfferPayload,
  accepts: AcceptEntry[],
  errors: VerificationError[],
  hintProvided: boolean,
  hintMismatchDetected: boolean
): OfferVerification {
  const matches: Array<{ entry: AcceptEntry; index: number }> = [];

  for (let i = 0; i < accepts.length; i++) {
    const mismatches = matchAcceptTerms(payload, accepts[i]);
    if (mismatches.length === 0) {
      matches.push({ entry: accepts[i], index: i });
    }
  }

  // termMatching is always fully populated (no optional booleans for deterministic output)
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
