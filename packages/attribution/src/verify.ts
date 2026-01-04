/**
 * Attribution Verification (v0.9.26+)
 *
 * Verification functions for attribution attestations.
 */
import type { PEACError } from '@peac/schema';
import {
  ATTRIBUTION_LIMITS,
  validateAttributionAttestation,
  isAttributionExpired,
  isAttributionNotYetValid,
  type AttributionAttestation,
  type ChainVerificationResult,
} from '@peac/schema';
import {
  createInvalidFormatError,
  createExpiredError,
  createNotYetValidError,
  createSizeExceededError,
} from './errors.js';
import { verifyContentHash } from './hash.js';
import { verifyChain, type ChainVerificationOptions, type ReceiptResolver } from './chain.js';

/**
 * Verification options.
 */
export interface VerifyOptions {
  /** Clock skew tolerance in milliseconds (default: 30000) */
  clockSkew?: number;

  /** Skip expiration check (for testing) */
  skipExpirationCheck?: boolean;

  /** Skip time validity check (for testing) */
  skipTimeValidityCheck?: boolean;

  /** Verify attribution chain (requires resolver) */
  verifyChain?: boolean;

  /** Chain verification options */
  chainOptions?: ChainVerificationOptions;
}

/**
 * Verification result.
 */
export interface VerifyResult {
  /** Whether the attestation is valid */
  valid: boolean;

  /** Validated attestation (if valid) */
  attestation?: AttributionAttestation;

  /** Error details (if invalid) */
  error?: PEACError;

  /** Chain verification result (if chain verification was performed) */
  chain?: ChainVerificationResult;
}

/**
 * Verify an attribution attestation.
 *
 * Performs schema validation, time checks, and optional chain verification.
 *
 * @param data - Unknown data to verify
 * @param options - Verification options
 * @returns Verification result
 *
 * @example
 * ```typescript
 * const result = await verify(attestationData, {
 *   verifyChain: true,
 *   chainOptions: {
 *     resolver: async (ref) => fetchAndParseReceipt(ref),
 *   },
 * });
 *
 * if (result.valid) {
 *   console.log('Attribution verified:', result.attestation);
 * } else {
 *   console.error('Verification failed:', result.error);
 * }
 * ```
 */
export async function verify(data: unknown, options: VerifyOptions = {}): Promise<VerifyResult> {
  const clockSkew = options.clockSkew ?? 30000;

  // Schema validation
  const schemaResult = validateAttributionAttestation(data);
  if (!schemaResult.ok) {
    return {
      valid: false,
      error: createInvalidFormatError(schemaResult.error),
    };
  }

  const attestation = schemaResult.value;

  // Size check
  const serialized = JSON.stringify(attestation);
  if (serialized.length > ATTRIBUTION_LIMITS.maxAttestationSize) {
    return {
      valid: false,
      error: createSizeExceededError(serialized.length, ATTRIBUTION_LIMITS.maxAttestationSize),
    };
  }

  // Time validity check
  if (!options.skipTimeValidityCheck && isAttributionNotYetValid(attestation, clockSkew)) {
    return {
      valid: false,
      error: createNotYetValidError(attestation.issued_at),
    };
  }

  // Expiration check
  if (!options.skipExpirationCheck && isAttributionExpired(attestation, clockSkew)) {
    return {
      valid: false,
      error: createExpiredError(attestation.expires_at!),
    };
  }

  // Chain verification (if requested)
  let chainResult: ChainVerificationResult | undefined;
  if (options.verifyChain) {
    chainResult = await verifyChain(attestation, options.chainOptions);
    if (!chainResult.valid) {
      return {
        valid: false,
        error: createInvalidFormatError(chainResult.error ?? 'Chain verification failed'),
        chain: chainResult,
      };
    }
  }

  return {
    valid: true,
    attestation,
    chain: chainResult,
  };
}

/**
 * Verify content against a source's content hash.
 *
 * @param content - Content to verify
 * @param attestation - Attribution attestation
 * @param receiptRef - Receipt reference to find
 * @returns true if content matches the hash for the given receipt
 */
export function verifySourceContent(
  content: string | Uint8Array,
  attestation: AttributionAttestation,
  receiptRef: string
): boolean {
  const source = attestation.evidence.sources.find((s) => s.receipt_ref === receiptRef);
  if (!source || !source.content_hash) {
    return false;
  }
  return verifyContentHash(content, source.content_hash);
}

/**
 * Verify an excerpt against a source's excerpt hash.
 *
 * @param excerpt - Excerpt to verify
 * @param attestation - Attribution attestation
 * @param receiptRef - Receipt reference to find
 * @returns true if excerpt matches the hash for the given receipt
 */
export function verifySourceExcerpt(
  excerpt: string,
  attestation: AttributionAttestation,
  receiptRef: string
): boolean {
  const source = attestation.evidence.sources.find((s) => s.receipt_ref === receiptRef);
  if (!source || !source.excerpt_hash) {
    return false;
  }
  return verifyContentHash(excerpt, source.excerpt_hash);
}

/**
 * Verify the output hash matches derived content.
 *
 * @param output - Derived output content
 * @param attestation - Attribution attestation
 * @returns true if output matches the output_hash
 */
export function verifyOutput(
  output: string | Uint8Array,
  attestation: AttributionAttestation
): boolean {
  if (!attestation.evidence.output_hash) {
    return false;
  }
  return verifyContentHash(output, attestation.evidence.output_hash);
}

/**
 * Quick validation without async chain verification.
 *
 * Performs only synchronous checks: schema, size, time.
 *
 * @param data - Unknown data to verify
 * @param options - Verification options (excluding chain options)
 * @returns Verification result
 */
export function verifySync(
  data: unknown,
  options: Omit<VerifyOptions, 'verifyChain' | 'chainOptions'> = {}
): Omit<VerifyResult, 'chain'> {
  const clockSkew = options.clockSkew ?? 30000;

  // Schema validation
  const schemaResult = validateAttributionAttestation(data);
  if (!schemaResult.ok) {
    return {
      valid: false,
      error: createInvalidFormatError(schemaResult.error),
    };
  }

  const attestation = schemaResult.value;

  // Size check
  const serialized = JSON.stringify(attestation);
  if (serialized.length > ATTRIBUTION_LIMITS.maxAttestationSize) {
    return {
      valid: false,
      error: createSizeExceededError(serialized.length, ATTRIBUTION_LIMITS.maxAttestationSize),
    };
  }

  // Time validity check
  if (!options.skipTimeValidityCheck && isAttributionNotYetValid(attestation, clockSkew)) {
    return {
      valid: false,
      error: createNotYetValidError(attestation.issued_at),
    };
  }

  // Expiration check
  if (!options.skipExpirationCheck && isAttributionExpired(attestation, clockSkew)) {
    return {
      valid: false,
      error: createExpiredError(attestation.expires_at!),
    };
  }

  return {
    valid: true,
    attestation,
  };
}
