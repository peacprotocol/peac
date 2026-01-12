/**
 * @peac/mappings-ucp - Webhook signature verification
 *
 * Verifies UCP webhook signatures using detached JWS (RFC 7797).
 * Supports ES256, ES384, ES512 algorithms with ECDSA keys.
 *
 * Verification strategy (raw-first, JCS fallback):
 * 1. Try verifying against raw request body bytes
 * 2. If that fails AND body is valid JSON, try JCS-canonicalized body
 * 3. Record all attempts for evidence
 *
 * The UCP spec is ambiguous on canonicalization for webhooks (unlike AP2 which
 * explicitly requires JCS). This implementation tries raw bytes first because
 * the spec says "detached JWT over the request body".
 */

import * as jose from 'jose';
import type {
  UcpProfile,
  UcpSigningKey,
  UcpJwsHeader,
  ParsedDetachedJws,
  VerifyUcpWebhookOptions,
  VerifyUcpWebhookResult,
  VerificationAttempt,
  UcpSignatureAlgorithm,
} from './types.js';
import { ErrorCodes, ucpError, UcpError } from './errors.js';
import { jcsCanonicalizeSync, base64urlEncode } from './util.js';

/**
 * Supported ECDSA algorithms and their curve mappings.
 */
const ALG_TO_CURVE: Record<UcpSignatureAlgorithm, string> = {
  ES256: 'P-256',
  ES384: 'P-384',
  ES512: 'P-521',
};

/**
 * Known/understood critical header parameters.
 * Per JOSE rules: if `crit` exists, every entry MUST be understood by the implementation.
 */
const UNDERSTOOD_CRIT_PARAMS = new Set(['b64']);

/**
 * Parse a detached JWS from the Request-Signature header.
 * Format: <protected>..<signature> (empty payload section)
 */
export function parseDetachedJws(headerValue: string): ParsedDetachedJws {
  const trimmed = headerValue.trim();

  // Detached JWS format: header..signature (double dot, empty payload)
  const parts = trimmed.split('.');

  if (parts.length !== 3) {
    throw ucpError(
      ErrorCodes.SIGNATURE_MALFORMED,
      'Invalid detached JWS format, expected 3 parts',
      {
        parts: parts.length,
      }
    );
  }

  const [protectedB64url, payloadPart, signatureB64url] = parts;

  // Payload MUST be empty for detached JWS
  if (payloadPart !== '') {
    throw ucpError(ErrorCodes.SIGNATURE_MALFORMED, 'Detached JWS must have empty payload section', {
      payloadLength: payloadPart.length,
    });
  }

  // Decode protected header
  let header: UcpJwsHeader;
  try {
    const headerJson = base64urlDecode(protectedB64url);
    header = JSON.parse(new TextDecoder('utf-8').decode(headerJson));
  } catch (err) {
    throw ucpError(ErrorCodes.SIGNATURE_MALFORMED, 'Failed to decode protected header', {
      error: String(err),
    });
  }

  // Validate algorithm
  if (!header.alg || !['ES256', 'ES384', 'ES512'].includes(header.alg)) {
    throw ucpError(
      ErrorCodes.SIGNATURE_ALGORITHM_UNSUPPORTED,
      `Unsupported algorithm: ${header.alg}`,
      {
        alg: header.alg,
        supported: ['ES256', 'ES384', 'ES512'],
      }
    );
  }

  // Validate kid
  if (!header.kid) {
    throw ucpError(ErrorCodes.SIGNATURE_MALFORMED, 'Missing kid in protected header');
  }

  // Validate b64 parameter type if present (must be boolean)
  if ('b64' in header && typeof header.b64 !== 'boolean') {
    throw ucpError(
      ErrorCodes.SIGNATURE_MALFORMED,
      `b64 header must be a boolean, got ${typeof header.b64}`,
      { b64_type: typeof header.b64 }
    );
  }

  // Validate crit parameter if present
  if ('crit' in header) {
    // crit must be an array
    if (!Array.isArray(header.crit)) {
      throw ucpError(
        ErrorCodes.SIGNATURE_MALFORMED,
        `crit header must be an array, got ${typeof header.crit}`,
        { crit_type: typeof header.crit }
      );
    }

    // crit must contain only strings
    const nonStrings = header.crit.filter((param) => typeof param !== 'string');
    if (nonStrings.length > 0) {
      throw ucpError(ErrorCodes.SIGNATURE_MALFORMED, 'crit array must contain only strings', {
        invalid_types: nonStrings.map((p) => typeof p),
      });
    }

    // crit must not contain duplicates
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const param of header.crit) {
      if (seen.has(param)) {
        duplicates.push(param);
      }
      seen.add(param);
    }
    if (duplicates.length > 0) {
      throw ucpError(
        ErrorCodes.SIGNATURE_MALFORMED,
        `crit array contains duplicates: ${duplicates.join(', ')}`,
        { duplicates }
      );
    }

    // Enforce JOSE crit semantics: reject unknown critical parameters
    const unknownCrit = header.crit.filter((param) => !UNDERSTOOD_CRIT_PARAMS.has(param));
    if (unknownCrit.length > 0) {
      throw ucpError(
        ErrorCodes.SIGNATURE_MALFORMED,
        `Unknown critical header parameters: ${unknownCrit.join(', ')}`,
        { unknown_crit: unknownCrit, understood: [...UNDERSTOOD_CRIT_PARAMS] }
      );
    }
  }

  // Handle b64 parameter
  const isUnencodedPayload = header.b64 === false;

  // If b64=false is used, it MUST be in crit (RFC 7797 requirement)
  if (isUnencodedPayload) {
    if (!header.crit || !header.crit.includes('b64')) {
      throw ucpError(
        ErrorCodes.SIGNATURE_B64_INVALID,
        'When b64=false, "b64" must be in the "crit" array'
      );
    }
  }

  return {
    raw_header_value: trimmed,
    header: header as UcpJwsHeader,
    protected_b64url: protectedB64url,
    signature_b64url: signatureB64url,
    is_unencoded_payload: isUnencodedPayload,
  };
}

/**
 * Find the signing key by kid in the profile.
 */
export function findSigningKey(profile: UcpProfile, kid: string): UcpSigningKey | undefined {
  return profile.signing_keys.find((k) => k.kid === kid);
}

/**
 * Verify that a key's curve matches the algorithm.
 */
function validateKeyForAlgorithm(key: UcpSigningKey, alg: UcpSignatureAlgorithm): void {
  const expectedCurve = ALG_TO_CURVE[alg];

  if (key.kty !== 'EC') {
    throw ucpError(ErrorCodes.KEY_ALGORITHM_MISMATCH, `Expected EC key, got ${key.kty}`, {
      kid: key.kid,
      kty: key.kty,
    });
  }

  if (key.crv !== expectedCurve) {
    throw ucpError(
      ErrorCodes.KEY_CURVE_MISMATCH,
      `Algorithm ${alg} requires curve ${expectedCurve}, got ${key.crv}`,
      { kid: key.kid, alg, expected: expectedCurve, got: key.crv }
    );
  }
}

/**
 * Verify a detached JWS signature against payload bytes.
 *
 * For b64=false (RFC 7797 unencoded payload):
 * - jose.flattenedVerify accepts Uint8Array directly as payload
 * - The signing input is: ASCII(BASE64URL(header)) || '.' || payload_bytes
 *
 * For standard JWS (b64=true or absent):
 * - Payload is base64url-encoded in the signing input
 *
 * @param parsed - Parsed detached JWS
 * @param payloadBytes - The payload bytes to verify against
 * @param key - The EC public key (JWK)
 * @returns true if signature is valid
 */
async function verifyDetachedSignature(
  parsed: ParsedDetachedJws,
  payloadBytes: Uint8Array,
  key: UcpSigningKey
): Promise<boolean> {
  // Import the public key
  const publicKey = await jose.importJWK(
    {
      kty: key.kty,
      crv: key.crv,
      x: key.x,
      y: key.y,
    },
    parsed.header.alg
  );

  // Construct the JWS input for verification
  // jose.flattenedVerify handles b64=false correctly when payload is Uint8Array
  const jws: jose.FlattenedJWSInput = {
    protected: parsed.protected_b64url,
    // For b64=false: pass raw bytes directly (jose handles RFC 7797 semantics)
    // For standard JWS: pass base64url-encoded string
    payload: parsed.is_unencoded_payload ? payloadBytes : base64urlEncode(payloadBytes),
    signature: parsed.signature_b64url,
  };

  try {
    // jose.flattenedVerify handles b64=false correctly when it sees it in the protected header
    await jose.flattenedVerify(jws, publicKey, {
      algorithms: [parsed.header.alg],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify a UCP webhook signature.
 *
 * Strategy: raw-first, JCS fallback
 * 1. Parse the detached JWS from Request-Signature header
 * 2. Find the signing key in the profile by kid
 * 3. Try verifying against raw body bytes
 * 4. If that fails and body is valid JSON, try JCS-canonicalized body
 * 5. Return result with all verification attempts
 *
 * @param options - Verification options
 * @returns Verification result with profile and key information for evidence capture
 */
export async function verifyUcpWebhookSignature(
  options: VerifyUcpWebhookOptions
): Promise<VerifyUcpWebhookResult> {
  const { signature_header, body_bytes, profile_url, profile: providedProfile } = options;

  // Track verification attempts
  const attempts: VerificationAttempt[] = [];

  // Parse the detached JWS
  let parsed: ParsedDetachedJws;
  try {
    parsed = parseDetachedJws(signature_header);
  } catch (err) {
    if (err instanceof UcpError) {
      return {
        valid: false,
        header: { alg: 'ES256', kid: '' } as UcpJwsHeader,
        attempts,
        error_code: err.code,
        error_message: err.message,
      };
    }
    throw err;
  }

  // Get the profile (use provided or fetch)
  let profile: UcpProfile;
  let profileRaw: string | undefined;
  if (providedProfile) {
    profile = providedProfile;
  } else {
    try {
      const fetchResult = await fetchUcpProfile(profile_url);
      profile = fetchResult.profile;
      profileRaw = fetchResult.raw;
    } catch (err) {
      return {
        valid: false,
        header: parsed.header,
        attempts,
        error_code: ErrorCodes.PROFILE_FETCH_FAILED,
        error_message: `Failed to fetch UCP profile: ${err}`,
      };
    }
  }

  // Find the signing key
  const key = findSigningKey(profile, parsed.header.kid);
  if (!key) {
    return {
      valid: false,
      header: parsed.header,
      profile,
      profile_raw: profileRaw,
      attempts,
      error_code: ErrorCodes.KEY_NOT_FOUND,
      error_message: `Key not found in profile: ${parsed.header.kid}`,
    };
  }

  // Validate key matches algorithm
  try {
    validateKeyForAlgorithm(key, parsed.header.alg);
  } catch (err) {
    if (err instanceof UcpError) {
      return {
        valid: false,
        header: parsed.header,
        key,
        profile,
        profile_raw: profileRaw,
        attempts,
        error_code: err.code,
        error_message: err.message,
      };
    }
    throw err;
  }

  // Attempt 1: Verify against raw body bytes
  try {
    const rawValid = await verifyDetachedSignature(parsed, body_bytes, key);
    attempts.push({
      mode: 'raw',
      success: rawValid,
      ...(!rawValid && {
        error_code: ErrorCodes.SIGNATURE_INVALID,
        error_message: 'Signature verification failed',
      }),
    });

    if (rawValid) {
      return {
        valid: true,
        mode_used: 'raw',
        header: parsed.header,
        key,
        profile,
        profile_raw: profileRaw,
        attempts,
      };
    }
  } catch (err) {
    attempts.push({
      mode: 'raw',
      success: false,
      error_code: ErrorCodes.VERIFICATION_FAILED,
      error_message: String(err),
    });
  }

  // Attempt 2: Try JCS-canonicalized body (only if JSON parseable)
  try {
    const bodyText = new TextDecoder('utf-8').decode(body_bytes);
    const parsed_body = JSON.parse(bodyText);
    const canonicalized = jcsCanonicalizeSync(parsed_body);
    const canonicalizedBytes = new TextEncoder().encode(canonicalized);

    const jcsValid = await verifyDetachedSignature(parsed, canonicalizedBytes, key);
    attempts.push({
      mode: 'jcs',
      success: jcsValid,
      ...(!jcsValid && {
        error_code: ErrorCodes.SIGNATURE_INVALID,
        error_message: 'JCS signature verification failed',
      }),
    });

    if (jcsValid) {
      return {
        valid: true,
        mode_used: 'jcs',
        header: parsed.header,
        key,
        profile,
        profile_raw: profileRaw,
        attempts,
      };
    }
  } catch (err) {
    // Body is not valid JSON or JCS canonicalization failed
    // This is fine, we just don't try JCS verification
    if (attempts.length === 1) {
      // Only add JCS attempt if we haven't already
      attempts.push({
        mode: 'jcs',
        success: false,
        error_code: ErrorCodes.PAYLOAD_NOT_JSON,
        error_message: 'Body is not valid JSON, cannot try JCS verification',
      });
    }
  }

  // Both attempts failed
  return {
    valid: false,
    header: parsed.header,
    key,
    profile,
    profile_raw: profileRaw,
    attempts,
    error_code: ErrorCodes.VERIFICATION_FAILED,
    error_message: 'All verification attempts failed',
  };
}

/**
 * Fetch a UCP profile from a URL.
 * Returns both the parsed profile and raw JSON for evidence capture.
 */
async function fetchUcpProfile(url: string): Promise<{ profile: UcpProfile; raw: string }> {
  const response = await fetch(url);

  if (!response.ok) {
    throw ucpError(ErrorCodes.PROFILE_FETCH_FAILED, `HTTP ${response.status} from ${url}`);
  }

  // Capture raw response text for evidence (deterministic)
  const raw = await response.text();
  let profile: UcpProfile;

  try {
    profile = JSON.parse(raw) as UcpProfile;
  } catch {
    throw ucpError(ErrorCodes.PROFILE_INVALID, 'Profile response is not valid JSON');
  }

  if (!profile.signing_keys || !Array.isArray(profile.signing_keys)) {
    throw ucpError(ErrorCodes.PROFILE_NO_SIGNING_KEYS, 'Profile has no signing_keys array');
  }

  if (profile.signing_keys.length === 0) {
    throw ucpError(ErrorCodes.PROFILE_NO_SIGNING_KEYS, 'Profile signing_keys array is empty');
  }

  return { profile, raw };
}

/**
 * Base64url decode to Uint8Array.
 * Uses Buffer for Node.js compatibility (avoids atob issues).
 */
function base64urlDecode(s: string): Uint8Array {
  // Use Buffer.from with 'base64url' encoding (Node.js 15.7.0+)
  // Falls back to manual conversion for older environments
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return new Uint8Array(Buffer.from(s, 'base64url'));
  }

  // Fallback for non-Node environments
  const padded = s + '==='.slice(0, (4 - (s.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
