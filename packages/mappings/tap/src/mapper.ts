/**
 * TAP to PEAC control evidence mapper.
 *
 * Maps Visa Trusted Agent Protocol proofs to PEAC control.chain[].
 */

import { verifySignature, parseSignature, type SignatureRequest } from '@peac/http-signatures';
import type {
  TapRequest,
  TapKeyResolver,
  TapVerifyOptions,
  TapControlEntry,
  TapEvidence,
  TapVerificationResult,
} from './types.js';
import { TAP_CONSTANTS } from './types.js';
import { ErrorCodes, TapError } from './errors.js';
import { validateTapTimeConstraints, validateTapAlgorithm, validateTapTag } from './validator.js';
import { getHeader } from './helpers.js';

/**
 * Verify TAP proof and map to PEAC control evidence.
 *
 * @param request - TAP request with headers
 * @param options - Verification options
 * @returns Verification result with control entry
 */
export async function verifyTapProof(
  request: TapRequest,
  options: TapVerifyOptions
): Promise<TapVerificationResult> {
  const {
    keyResolver,
    now = Math.floor(Date.now() / 1000),
    clockSkewSeconds = TAP_CONSTANTS.CLOCK_SKEW_SECONDS,
    allowUnknownTags = false,
  } = options;

  try {
    // Get signature headers
    const signatureInput = getHeader(request.headers, 'signature-input');
    const signature = getHeader(request.headers, 'signature');

    if (!signatureInput || !signature) {
      return {
        valid: false,
        errorCode: 'E_SIGNATURE_MISSING',
        errorMessage: 'Missing Signature-Input or Signature header',
      };
    }

    // Parse signature to get params for TAP validation
    const parsed = parseSignature(signatureInput, signature);

    // Validate TAP-specific constraints
    validateTapAlgorithm(parsed.params.alg);
    validateTapTimeConstraints(parsed.params, now);
    validateTapTag(parsed.params.tag, allowUnknownTags);

    // Extract issuer from keyid (format: https://issuer.example.com/keys/keyid)
    // For TAP, keyid often includes the issuer URL
    const issuer = extractIssuerFromKeyid(parsed.params.keyid, request);

    // Resolve key via JWKS
    const verifier = await keyResolver(issuer, parsed.params.keyid);
    if (!verifier) {
      return {
        valid: false,
        errorCode: 'E_KEY_NOT_FOUND',
        errorMessage: `Key not found: ${parsed.params.keyid}`,
      };
    }

    // Convert to SignatureRequest
    const sigRequest: SignatureRequest = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
    };

    // Verify signature using http-signatures
    const result = await verifySignature(sigRequest, {
      keyResolver: async () => verifier,
      now,
      clockSkewSeconds,
    });

    if (!result.valid) {
      return {
        valid: false,
        errorCode: result.errorCode ?? ErrorCodes.TAP_SIGNATURE_INVALID,
        errorMessage: result.errorMessage ?? 'Signature verification failed',
      };
    }

    // Build control entry
    const evidence: TapEvidence = {
      protocol: 'visa-tap',
      tag: parsed.params.tag ?? 'unknown',
      keyid: parsed.params.keyid,
      created: parsed.params.created,
      expires: parsed.params.expires!,
      nonce: parsed.params.nonce,
      coveredComponents: parsed.params.coveredComponents,
      signatureBase64: parsed.signatureBase64,
      verified: true,
      jwksSource: '/.well-known/jwks', // Default, could be enhanced
    };

    const controlEntry: TapControlEntry = {
      engine: 'tap',
      result: 'allow',
      evidence,
    };

    return {
      valid: true,
      controlEntry,
    };
  } catch (error) {
    if (error instanceof TapError) {
      return {
        valid: false,
        errorCode: error.code,
        errorMessage: error.message,
      };
    }

    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Extract issuer from keyid or request.
 *
 * TAP keyids may be:
 * - Full URL: https://issuer.example.com/.well-known/jwks#key1
 * - Plain keyid: key1 (issuer from request host)
 */
function extractIssuerFromKeyid(keyid: string, request: TapRequest): string {
  // If keyid looks like a URL, extract origin
  if (keyid.startsWith('https://') || keyid.startsWith('http://')) {
    try {
      const url = new URL(keyid);
      return url.origin;
    } catch {
      // Fall through to request-based extraction
    }
  }

  // Extract from request URL or host header
  try {
    const url = new URL(request.url);
    return url.origin;
  } catch {
    // Try host header
    const host = getHeader(request.headers, 'host');
    if (host) {
      return `https://${host}`;
    }
  }

  // Last resort: return keyid as-is
  return keyid;
}

/**
 * Create a control entry for a denied TAP verification.
 */
export function createDeniedControlEntry(
  params: {
    keyid: string;
    tag?: string;
    created: number;
    expires: number;
    nonce?: string;
    coveredComponents: string[];
    signatureBase64: string;
  },
  reason: string
): TapControlEntry {
  const evidence: TapEvidence = {
    protocol: 'visa-tap',
    tag: params.tag ?? 'unknown',
    keyid: params.keyid,
    created: params.created,
    expires: params.expires,
    nonce: params.nonce,
    coveredComponents: params.coveredComponents,
    signatureBase64: params.signatureBase64,
    verified: false,
    jwksSource: '/.well-known/jwks',
  };

  return {
    engine: 'tap',
    result: 'deny',
    evidence,
  };
}
