/**
 * Paymentauth header parsing: envelope-first, raw + normalized.
 *
 * Parses WWW-Authenticate: Payment challenges, Authorization: Payment
 * credentials, and Payment-Receipt headers per draft-ryan-httpauth-payment-01.
 *
 * SECURITY:
 * - Raw header values MUST NOT appear in thrown errors or debug output
 * - Parser limits enforced: header size, param count, payload size, JSON depth
 * - Decoded bytes preserved alongside strings for non-UTF-8 safety
 * - Method-specific payloads typed as `unknown`; no eager interpretation
 */

import {
  MAX_HEADER_BYTES,
  MAX_AUTH_PARAMS,
  MAX_DECODED_PAYLOAD_BYTES,
  MAX_JSON_NESTING_DEPTH,
  PAYMENTAUTH_SCHEME,
} from './constants.js';
import { PaymentauthError } from './errors.js';
import type {
  RawPaymentauthChallenge,
  RawPaymentauthCredential,
  RawPaymentauthReceipt,
  NormalizedPaymentauthChallenge,
  NormalizedPaymentauthCredential,
  NormalizedPaymentauthReceipt,
} from './types.js';

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Redact a paymentauth header value for safe logging.
 *
 * Preserves the scheme name and challenge id (if present) but replaces
 * credential/receipt payload with "[REDACTED]".
 */
export function redactPaymentauthHeader(header: string): string {
  if (!header) return '[empty]';
  const schemeEnd = header.indexOf(' ');
  if (schemeEnd === -1) return header;
  const scheme = header.substring(0, schemeEnd);

  // For challenges (WWW-Authenticate), try to preserve id param
  const idMatch = header.match(/\bid="([^"]{1,64})"/);
  if (idMatch) {
    return `${scheme} id="${idMatch[1]}" [REDACTED]`;
  }

  return `${scheme} [REDACTED]`;
}

// ---------------------------------------------------------------------------
// Base64url Helpers
// ---------------------------------------------------------------------------

/**
 * Decode base64url without padding (RFC 4648 Section 5).
 * Returns raw bytes as Uint8Array.
 */
function decodeBase64url(input: string): Uint8Array {
  // Validate characters
  if (!/^[A-Za-z0-9_-]*$/.test(input)) {
    throw new PaymentauthError('PARSE_INVALID_BASE64URL', 'Invalid base64url characters');
  }

  try {
    // Add padding
    const padded = input + '==='.slice(0, (4 - (input.length % 4)) % 4);
    const standard = padded.replace(/-/g, '+').replace(/_/g, '/');

    // Use Buffer in Node.js for predictable server-side behavior
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(standard, 'base64'));
    }

    // Fallback to atob for non-Node environments
    const binaryStr = atob(standard);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch {
    throw new PaymentauthError('PARSE_INVALID_BASE64URL', 'Failed to decode base64url value');
  }
}

/**
 * Try to decode bytes as UTF-8 string.
 * Returns null if bytes are not valid UTF-8.
 */
function tryDecodeUtf8(bytes: Uint8Array): string | null {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Try to parse a string as JSON with depth checking.
 * Returns undefined on any failure.
 */
function tryParseJsonBounded(str: string, maxDepth: number): unknown {
  if (str.length > MAX_DECODED_PAYLOAD_BYTES) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(str);
    if (!checkJsonDepth(parsed, maxDepth, 0)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function checkJsonDepth(value: unknown, maxDepth: number, current: number): boolean {
  if (current > maxDepth) return false;
  if (value === null || typeof value !== 'object') return true;
  if (Array.isArray(value)) {
    return value.every((v) => checkJsonDepth(v, maxDepth, current + 1));
  }
  return Object.values(value as Record<string, unknown>).every((v) =>
    checkJsonDepth(v, maxDepth, current + 1)
  );
}

// ---------------------------------------------------------------------------
// Auth-param Parsing (RFC 9110 Section 11)
// ---------------------------------------------------------------------------

/**
 * Parse auth-params from a challenge string.
 *
 * Handles both token and quoted-string values per RFC 9110.
 * Rejects duplicate params. Bounds-checks param count.
 */
function parseAuthParams(paramStr: string): Record<string, string> {
  const params: Record<string, string> = {};
  let pos = 0;
  let count = 0;

  while (pos < paramStr.length) {
    // Skip whitespace and commas
    while (pos < paramStr.length && /[\s,]/.test(paramStr[pos])) pos++;
    if (pos >= paramStr.length) break;

    // Parse token (key)
    const keyStart = pos;
    while (pos < paramStr.length && /[A-Za-z0-9!#$%&'*+\-.^_`|~]/.test(paramStr[pos])) pos++;
    const key = paramStr.substring(keyStart, pos).toLowerCase();
    if (!key) break;

    // Skip BWS = BWS
    while (pos < paramStr.length && /\s/.test(paramStr[pos])) pos++;
    if (paramStr[pos] !== '=') break;
    pos++; // skip =
    while (pos < paramStr.length && /\s/.test(paramStr[pos])) pos++;

    // Parse value: quoted-string or token
    let value: string;
    if (paramStr[pos] === '"') {
      // Quoted string
      pos++; // skip opening quote
      let escaped = '';
      while (pos < paramStr.length && paramStr[pos] !== '"') {
        if (paramStr[pos] === '\\' && pos + 1 < paramStr.length) {
          pos++;
          escaped += paramStr[pos];
        } else {
          escaped += paramStr[pos];
        }
        pos++;
      }
      if (paramStr[pos] === '"') pos++; // skip closing quote
      value = escaped;
    } else {
      // Token value
      const valStart = pos;
      while (pos < paramStr.length && !/[\s,]/.test(paramStr[pos])) pos++;
      value = paramStr.substring(valStart, pos);
    }

    count++;
    if (count > MAX_AUTH_PARAMS) {
      throw new PaymentauthError(
        'PARSE_TOO_MANY_PARAMS',
        `Challenge exceeds maximum param count (${MAX_AUTH_PARAMS})`
      );
    }

    if (key in params) {
      throw new PaymentauthError('PARSE_TOO_MANY_PARAMS', `Duplicate auth-param: ${key}`);
    }

    params[key] = value;
  }

  return params;
}

// ---------------------------------------------------------------------------
// Challenge Parsing
// ---------------------------------------------------------------------------

/**
 * Parse paymentauth challenges from WWW-Authenticate header value.
 *
 * Parses the FIRST Payment challenge from a WWW-Authenticate header value.
 *
 * NOTE: RFC 9110 allows multiple challenges per header line (Section 7.3),
 * but robust multi-challenge splitting requires a full quote-aware tokenizer.
 * This parser extracts the first Payment challenge reliably. For headers
 * with multiple Payment challenges, use separate WWW-Authenticate header
 * lines (one challenge per line) which is the recommended interoperability
 * approach per RFC 9110.
 *
 * Returns an array for forward compatibility; currently contains at most
 * one challenge.
 */
export function parsePaymentauthChallenges(wwwAuthenticate: string): RawPaymentauthChallenge[] {
  const headerBytes = new TextEncoder().encode(wwwAuthenticate);
  if (headerBytes.length > MAX_HEADER_BYTES) {
    throw new PaymentauthError(
      'PARSE_HEADER_TOO_LARGE',
      `Header exceeds ${MAX_HEADER_BYTES} bytes`
    );
  }

  // Find the first "Payment " occurrence (case-insensitive per RFC 9110)
  const schemePattern = new RegExp(`\\b${PAYMENTAUTH_SCHEME}\\s+`, 'i');
  const match = schemePattern.exec(wwwAuthenticate);
  if (!match) return [];

  const paramStart = match.index + match[0].length;
  const paramStr = wwwAuthenticate.substring(paramStart).trim();

  const params = parseAuthParams(paramStr);

  return [
    {
      rawHeader: wwwAuthenticate,
      rawSegment: wwwAuthenticate.substring(match.index),
      params,
    },
  ];
}

/**
 * Parse paymentauth credential from Authorization header value.
 *
 * Format: "Payment <base64url-nopad>" (Section 5.2)
 */
export function parsePaymentauthCredential(authorization: string): RawPaymentauthCredential {
  const headerBytes = new TextEncoder().encode(authorization);
  if (headerBytes.length > MAX_HEADER_BYTES) {
    throw new PaymentauthError(
      'PARSE_HEADER_TOO_LARGE',
      `Header exceeds ${MAX_HEADER_BYTES} bytes`
    );
  }

  // RFC 9110: authentication scheme tokens are case-insensitive
  const schemePrefixLen = PAYMENTAUTH_SCHEME.length + 1; // "Payment "
  const headerPrefix = authorization.substring(0, schemePrefixLen);
  if (headerPrefix.toLowerCase() !== `${PAYMENTAUTH_SCHEME.toLowerCase()} `) {
    throw new PaymentauthError(
      'PARSE_MISSING_SCHEME',
      `Expected "${PAYMENTAUTH_SCHEME}" scheme prefix (case-insensitive)`
    );
  }

  const rawValue = authorization.substring(schemePrefixLen).trim();
  if (!rawValue) {
    throw new PaymentauthError('PARSE_INVALID_BASE64URL', 'Empty credential value');
  }

  const decodedBytes = decodeBase64url(rawValue);
  if (decodedBytes.length > MAX_DECODED_PAYLOAD_BYTES) {
    throw new PaymentauthError(
      'PARSE_PAYLOAD_TOO_LARGE',
      `Decoded payload exceeds ${MAX_DECODED_PAYLOAD_BYTES} bytes`
    );
  }

  const decodedString = tryDecodeUtf8(decodedBytes);
  const parsedJson = decodedString
    ? tryParseJsonBounded(decodedString, MAX_JSON_NESTING_DEPTH)
    : undefined;

  return { rawValue, decodedBytes, decodedString, parsedJson };
}

/**
 * Parse paymentauth receipt from Payment-Receipt header value.
 *
 * Format: base64url-nopad (Section 5.3)
 */
export function parsePaymentauthReceipt(headerValue: string): RawPaymentauthReceipt {
  const headerBytes = new TextEncoder().encode(headerValue);
  if (headerBytes.length > MAX_HEADER_BYTES) {
    throw new PaymentauthError(
      'PARSE_HEADER_TOO_LARGE',
      `Header exceeds ${MAX_HEADER_BYTES} bytes`
    );
  }

  const rawValue = headerValue.trim();
  if (!rawValue) {
    throw new PaymentauthError('PARSE_INVALID_BASE64URL', 'Empty receipt value');
  }

  const decodedBytes = decodeBase64url(rawValue);
  if (decodedBytes.length > MAX_DECODED_PAYLOAD_BYTES) {
    throw new PaymentauthError(
      'PARSE_PAYLOAD_TOO_LARGE',
      `Decoded payload exceeds ${MAX_DECODED_PAYLOAD_BYTES} bytes`
    );
  }

  const decodedString = tryDecodeUtf8(decodedBytes);
  const parsedJson = decodedString
    ? tryParseJsonBounded(decodedString, MAX_JSON_NESTING_DEPTH)
    : undefined;

  return { rawValue, decodedBytes, decodedString, parsedJson };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a raw challenge into a stable PEAC-facing projection.
 *
 * Requires id, realm, method, intent, request (common envelope).
 * All other params are optional.
 */
export function normalizeChallenge(raw: RawPaymentauthChallenge): NormalizedPaymentauthChallenge {
  const { params } = raw;

  const required = ['id', 'realm', 'method', 'intent', 'request'] as const;
  for (const key of required) {
    if (!params[key]) {
      throw new PaymentauthError(
        'NORMALIZE_MISSING_FIELD',
        `Missing required challenge param: ${key}`
      );
    }
  }

  // Decode the request param (base64url JSON)
  let decodedRequest: unknown;
  try {
    const requestBytes = decodeBase64url(params.request);
    const requestStr = tryDecodeUtf8(requestBytes);
    decodedRequest = requestStr
      ? tryParseJsonBounded(requestStr, MAX_JSON_NESTING_DEPTH)
      : undefined;
  } catch {
    decodedRequest = undefined;
  }

  return {
    id: params.id,
    realm: params.realm,
    method: params.method,
    intent: params.intent,
    requestRaw: params.request,
    decodedRequest,
    expires: params.expires,
    digest: params.digest,
    description: params.description,
    opaque: params.opaque,
    _raw: raw,
  };
}

/**
 * Normalize a raw credential into a stable PEAC-facing projection.
 *
 * Extracts challenge.id, method, intent, and source from the decoded JSON
 * if it is object-shaped. Method-specific payload remains `unknown`.
 */
export function normalizeCredential(
  raw: RawPaymentauthCredential
): NormalizedPaymentauthCredential {
  const obj = raw.parsedJson;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new PaymentauthError(
      'NORMALIZE_MISSING_FIELD',
      'Credential decoded JSON is not an object'
    );
  }

  const cred = obj as Record<string, unknown>;
  const challenge = cred.challenge as Record<string, unknown> | undefined;

  if (!challenge || typeof challenge !== 'object') {
    throw new PaymentauthError('NORMALIZE_MISSING_FIELD', 'Credential missing challenge object');
  }

  // Require essential envelope fields; do not coerce missing to empty string
  if (typeof challenge.id !== 'string' || !challenge.id) {
    throw new PaymentauthError('NORMALIZE_MISSING_FIELD', 'Credential challenge.id is missing');
  }
  if (typeof challenge.method !== 'string' || !challenge.method) {
    throw new PaymentauthError('NORMALIZE_MISSING_FIELD', 'Credential challenge.method is missing');
  }
  if (typeof challenge.intent !== 'string' || !challenge.intent) {
    throw new PaymentauthError('NORMALIZE_MISSING_FIELD', 'Credential challenge.intent is missing');
  }

  return {
    challengeId: challenge.id,
    method: challenge.method,
    intent: challenge.intent,
    source: typeof cred.source === 'string' ? cred.source : undefined,
    payload: cred.payload,
    _raw: raw,
  };
}

/**
 * Normalize a raw receipt into a stable PEAC-facing projection.
 *
 * Extracts status, method, timestamp, reference from decoded JSON.
 * All other fields go into extras.
 */
export function normalizeReceipt(raw: RawPaymentauthReceipt): NormalizedPaymentauthReceipt {
  const obj = raw.parsedJson;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new PaymentauthError('NORMALIZE_MISSING_FIELD', 'Receipt decoded JSON is not an object');
  }

  const receipt = obj as Record<string, unknown>;

  const knownKeys = new Set(['status', 'method', 'timestamp', 'reference']);
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(receipt)) {
    if (!knownKeys.has(key)) {
      extras[key] = value;
    }
  }

  // Require essential receipt envelope fields
  if (typeof receipt.status !== 'string' || !receipt.status) {
    throw new PaymentauthError('NORMALIZE_MISSING_FIELD', 'Receipt status is missing');
  }
  if (typeof receipt.method !== 'string' || !receipt.method) {
    throw new PaymentauthError('NORMALIZE_MISSING_FIELD', 'Receipt method is missing');
  }

  return {
    status: receipt.status,
    method: receipt.method,
    timestamp: typeof receipt.timestamp === 'string' ? receipt.timestamp : undefined,
    reference: typeof receipt.reference === 'string' ? receipt.reference : undefined,
    extras,
    _raw: raw,
  };
}
