/**
 * HTTP Message Signature verification.
 *
 * Runtime-neutral verification using SignatureVerifier function type.
 * WebCrypto is used internally but NOT exposed in public API.
 */

import {
  SignatureVerifier,
  KeyResolver,
  SignatureRequest,
  VerifyOptions,
  VerificationResult,
  ParsedSignatureParams,
} from './types.js';
import { parseSignature } from './parser.js';
import { buildSignatureBase, signatureBaseToBytes } from './base.js';
import { ErrorCodes, HttpSignatureError } from './errors.js';

/**
 * Verify an HTTP Message Signature.
 *
 * @param request - Request data with headers
 * @param options - Verification options including key resolver
 * @returns Verification result
 */
export async function verifySignature(
  request: SignatureRequest,
  options: VerifyOptions
): Promise<VerificationResult> {
  const { keyResolver, now = Math.floor(Date.now() / 1000), clockSkewSeconds = 60 } = options;

  try {
    // Get signature headers
    const signatureInput = getHeader(request.headers, 'signature-input');
    const signature = getHeader(request.headers, 'signature');

    // Parse signature
    const parsed = parseSignature(signatureInput, signature, options.label);

    // Validate algorithm
    if (parsed.params.alg !== 'ed25519') {
      throw new HttpSignatureError(
        ErrorCodes.SIGNATURE_ALGORITHM_UNSUPPORTED,
        `Unsupported algorithm: ${parsed.params.alg} (only ed25519 is supported)`
      );
    }

    // Validate time constraints
    validateTimeConstraints(parsed.params, now, clockSkewSeconds);

    // Resolve key
    const verifier = await keyResolver(parsed.params.keyid);
    if (!verifier) {
      throw new HttpSignatureError(
        ErrorCodes.KEY_NOT_FOUND,
        `Key not found: ${parsed.params.keyid}`
      );
    }

    // Build signature base
    const signatureBase = buildSignatureBase(request, parsed.params);
    const signatureBaseBytes = signatureBaseToBytes(signatureBase);

    // Verify signature
    const valid = await verifier(signatureBaseBytes, parsed.signatureBytes);

    if (!valid) {
      throw new HttpSignatureError(ErrorCodes.SIGNATURE_INVALID, 'Signature verification failed');
    }

    return {
      valid: true,
      signature: parsed,
    };
  } catch (error) {
    if (error instanceof HttpSignatureError) {
      return {
        valid: false,
        errorCode: error.code,
        errorMessage: error.message,
      };
    }
    throw error;
  }
}

/**
 * Validate time constraints on signature parameters.
 */
function validateTimeConstraints(
  params: ParsedSignatureParams,
  now: number,
  clockSkewSeconds: number
): void {
  // Check if signature is from the future (with skew tolerance)
  if (isCreatedInFuture(params, now, clockSkewSeconds)) {
    throw new HttpSignatureError(
      ErrorCodes.SIGNATURE_FUTURE,
      `Signature created in future: ${params.created} > ${now + clockSkewSeconds}`
    );
  }

  // Check if signature is expired
  if (isExpired(params, now)) {
    throw new HttpSignatureError(
      ErrorCodes.SIGNATURE_EXPIRED,
      `Signature expired: ${params.expires} < ${now}`
    );
  }
}

/**
 * Check if signature is expired.
 *
 * @param params - Parsed signature parameters
 * @param now - Current Unix timestamp (defaults to current time)
 * @returns true if signature is expired
 */
export function isExpired(
  params: ParsedSignatureParams,
  now: number = Math.floor(Date.now() / 1000)
): boolean {
  if (params.expires === undefined) {
    return false;
  }
  return now > params.expires;
}

/**
 * Check if signature was created in the future (accounting for clock skew).
 *
 * @param params - Parsed signature parameters
 * @param now - Current Unix timestamp (defaults to current time)
 * @param skewSeconds - Allowed clock skew in seconds (defaults to 60)
 * @returns true if signature is from the future
 */
export function isCreatedInFuture(
  params: ParsedSignatureParams,
  now: number = Math.floor(Date.now() / 1000),
  skewSeconds: number = 60
): boolean {
  return params.created > now + skewSeconds;
}

/**
 * Check if Ed25519 WebCrypto is supported in current runtime.
 *
 * @returns true if Ed25519 WebCrypto is available
 */
export async function isEd25519WebCryptoSupported(): Promise<boolean> {
  try {
    // Try to generate a key pair to test support
    const keyPair = await globalThis.crypto.subtle.generateKey('Ed25519', false, [
      'sign',
      'verify',
    ]);
    return keyPair !== null;
  } catch {
    return false;
  }
}

/**
 * Create a SignatureVerifier from a WebCrypto CryptoKey.
 *
 * This is a helper for consumers who have CryptoKey objects.
 * The function is runtime-neutral as it accepts unknown and casts internally.
 *
 * @param key - WebCrypto CryptoKey (passed as unknown for runtime neutrality)
 * @returns SignatureVerifier function
 */
export function createWebCryptoVerifier(key: unknown): SignatureVerifier {
  return async (data: Uint8Array, signature: Uint8Array): Promise<boolean> => {
    // Create proper ArrayBuffer views to satisfy TypeScript
    const sigBuffer = new Uint8Array(signature).buffer;
    const dataBuffer = new Uint8Array(data).buffer;

    // Use type from the actual WebCrypto API to avoid DOM type dependency
    type VerifyKey = Parameters<typeof globalThis.crypto.subtle.verify>[1];

    return globalThis.crypto.subtle.verify('Ed25519', key as VerifyKey, sigBuffer, dataBuffer);
  };
}

/**
 * Get header value by name (case-insensitive).
 */
function getHeader(headers: Record<string, string>, name: string): string {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return '';
}
