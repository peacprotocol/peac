/**
 * PEAC Transport Profile Parsers
 *
 * Implements parsing for transport profiles per TRANSPORT-PROFILES.md:
 * - Header profile (PEAC-Receipt header)
 * - Pointer profile (PEAC-Receipt-Pointer header)
 * - Body profile (peac_receipt/peac_receipts in JSON body)
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Transport profile type
 */
export type TransportProfile = 'header' | 'pointer' | 'body';

/**
 * Result of parsing a header transport profile
 */
export interface HeaderProfileResult {
  profile: 'header';
  receipt: string;
}

/**
 * Result of parsing a pointer transport profile
 */
export interface PointerProfileResult {
  profile: 'pointer';
  digestAlg: 'sha256';
  digestValue: string;
  url: string;
  /**
   * Extension parameters (keys starting with ext_).
   * Stored separately from normative fields for forward-compatibility.
   * Consumers SHOULD NOT rely on extension keys for core verification logic.
   */
  extensions?: Record<string, string>;
}

/**
 * Result of parsing a body transport profile
 */
export interface BodyProfileResult {
  profile: 'body';
  receipts: string[];
}

/**
 * Parsed transport profile (discriminated union)
 */
export type ParsedTransportProfile = HeaderProfileResult | PointerProfileResult | BodyProfileResult;

/**
 * Transport profile parse error
 */
export interface TransportProfileError {
  ok: false;
  reason: 'invalid_transport' | 'malformed_receipt' | 'pointer_fetch_blocked';
  errorCode: string;
  message: string;
}

/**
 * Transport profile parse success
 */
export interface TransportProfileSuccess<
  T extends ParsedTransportProfile = ParsedTransportProfile,
> {
  ok: true;
  result: T;
}

/**
 * Transport profile parse result
 */
export type TransportProfileParseResult<T extends ParsedTransportProfile = ParsedTransportProfile> =
  | TransportProfileSuccess<T>
  | TransportProfileError;

// ---------------------------------------------------------------------------
// Header Profile Parser
// ---------------------------------------------------------------------------

/**
 * Parse PEAC-Receipt header
 *
 * Per TRANSPORT-PROFILES.md:
 * - Multiple headers MUST be rejected
 * - Comma-separated values MUST be rejected
 * - Value MUST be JWS compact serialization (three dot-separated segments)
 *
 * @param headerValue - PEAC-Receipt header value (string or array if multiple)
 * @returns Parse result
 */
export function parseHeaderProfile(
  headerValue: string | string[] | undefined
): TransportProfileParseResult<HeaderProfileResult> {
  // Check for missing header
  if (headerValue === undefined || headerValue === '') {
    return {
      ok: false,
      reason: 'invalid_transport',
      errorCode: 'E_VERIFY_INVALID_TRANSPORT',
      message: 'PEAC-Receipt header is missing',
    };
  }

  // Check for multiple headers (array)
  if (Array.isArray(headerValue)) {
    return {
      ok: false,
      reason: 'invalid_transport',
      errorCode: 'E_VERIFY_INVALID_TRANSPORT',
      message: 'Multiple PEAC-Receipt headers are not allowed',
    };
  }

  // Check for comma-separated values (HTTP header list syntax)
  if (headerValue.includes(',')) {
    // Could be comma in base64url, but JWS compact has exactly 2 periods
    // If there are commas between periods, it's likely multiple values
    const parts = headerValue.split('.');
    if (parts.length !== 3 || parts.some((p) => p.includes(','))) {
      return {
        ok: false,
        reason: 'invalid_transport',
        errorCode: 'E_VERIFY_INVALID_TRANSPORT',
        message: 'Comma-separated PEAC-Receipt values are not allowed',
      };
    }
  }

  // Validate JWS compact serialization structure (three segments)
  const segments = headerValue.split('.');
  if (segments.length !== 3) {
    return {
      ok: false,
      reason: 'malformed_receipt',
      errorCode: 'E_VERIFY_MALFORMED_RECEIPT',
      message: `Invalid JWS compact serialization: expected 3 segments, got ${segments.length}`,
    };
  }

  // All segments must be non-empty base64url strings
  const base64urlRegex = /^[A-Za-z0-9_-]*$/;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.length === 0) {
      return {
        ok: false,
        reason: 'malformed_receipt',
        errorCode: 'E_VERIFY_MALFORMED_RECEIPT',
        message: `Invalid JWS compact serialization: segment ${i + 1} is empty`,
      };
    }
    if (!base64urlRegex.test(segment)) {
      return {
        ok: false,
        reason: 'malformed_receipt',
        errorCode: 'E_VERIFY_MALFORMED_RECEIPT',
        message: `Invalid JWS compact serialization: segment ${i + 1} contains invalid characters`,
      };
    }
  }

  return {
    ok: true,
    result: {
      profile: 'header',
      receipt: headerValue,
    },
  };
}

// ---------------------------------------------------------------------------
// Pointer Profile Parser
// ---------------------------------------------------------------------------

/**
 * Parse PEAC-Receipt-Pointer header
 *
 * Per TRANSPORT-PROFILES.md:
 * - Format: RFC 8941 dictionary with sha256 and url parameters
 * - Multiple headers MUST be rejected
 * - URL MUST be HTTPS
 *
 * Example: sha256="7d8f...", url="https://receipts.example.com/abc123"
 *
 * @param headerValue - PEAC-Receipt-Pointer header value (string or array if multiple)
 * @returns Parse result
 */
export function parsePointerProfile(
  headerValue: string | string[] | undefined
): TransportProfileParseResult<PointerProfileResult> {
  // Check for missing header
  if (headerValue === undefined || headerValue === '') {
    return {
      ok: false,
      reason: 'invalid_transport',
      errorCode: 'E_VERIFY_INVALID_TRANSPORT',
      message: 'PEAC-Receipt-Pointer header is missing',
    };
  }

  // Check for multiple headers (array)
  if (Array.isArray(headerValue)) {
    return {
      ok: false,
      reason: 'invalid_transport',
      errorCode: 'E_VERIFY_INVALID_TRANSPORT',
      message: 'Multiple PEAC-Receipt-Pointer headers are not allowed',
    };
  }

  // Parse RFC 8941 dictionary format
  // Format: sha256="<hex>", url="<url>"
  // We use a simple parser here instead of a full RFC 8941 implementation

  const parseResult = parseSimpleDictionary(headerValue);

  // Strict: Reject duplicate parameters
  if (parseResult.duplicates.length > 0) {
    return {
      ok: false,
      reason: 'invalid_transport',
      errorCode: 'E_VERIFY_INVALID_TRANSPORT',
      message: `PEAC-Receipt-Pointer has duplicate parameter: ${parseResult.duplicates[0]}`,
    };
  }

  // Strict: Reject unknown parameters (only sha256, url, and ext_* are valid)
  // Extension keys (ext_*) are allowed for forward-compatibility
  const ALLOWED_KEYS = new Set(['sha256', 'url']);
  const unknownKeys = parseResult.keys.filter((k) => !ALLOWED_KEYS.has(k) && !k.startsWith('ext_'));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      reason: 'invalid_transport',
      errorCode: 'E_VERIFY_INVALID_TRANSPORT',
      message: `PEAC-Receipt-Pointer has unknown parameter: ${unknownKeys[0]}`,
    };
  }

  const params = parseResult.params;

  if (!params.sha256) {
    return {
      ok: false,
      reason: 'invalid_transport',
      errorCode: 'E_VERIFY_INVALID_TRANSPORT',
      message: 'PEAC-Receipt-Pointer missing sha256 parameter',
    };
  }

  if (!params.url) {
    return {
      ok: false,
      reason: 'invalid_transport',
      errorCode: 'E_VERIFY_INVALID_TRANSPORT',
      message: 'PEAC-Receipt-Pointer missing url parameter',
    };
  }

  // Validate digest is lowercase hex
  const hexRegex = /^[0-9a-f]{64}$/;
  if (!hexRegex.test(params.sha256)) {
    return {
      ok: false,
      reason: 'invalid_transport',
      errorCode: 'E_VERIFY_INVALID_TRANSPORT',
      message: 'PEAC-Receipt-Pointer sha256 must be 64 lowercase hex characters',
    };
  }

  // Validate URL is HTTPS
  try {
    const url = new URL(params.url);
    if (url.protocol !== 'https:') {
      return {
        ok: false,
        reason: 'pointer_fetch_blocked',
        errorCode: 'E_VERIFY_POINTER_FETCH_BLOCKED',
        message: 'Pointer URL must use HTTPS',
      };
    }
  } catch {
    return {
      ok: false,
      reason: 'invalid_transport',
      errorCode: 'E_VERIFY_INVALID_TRANSPORT',
      message: 'PEAC-Receipt-Pointer url is not a valid URL',
    };
  }

  // Extract extension keys (ext_*) for forward-compatibility
  const extensions: Record<string, string> = {};
  for (const key of parseResult.keys) {
    if (key.startsWith('ext_')) {
      extensions[key] = params[key];
    }
  }

  return {
    ok: true,
    result: {
      profile: 'pointer',
      digestAlg: 'sha256',
      digestValue: params.sha256,
      url: params.url,
      ...(Object.keys(extensions).length > 0 && { extensions }),
    },
  };
}

/**
 * Simple RFC 8941-like dictionary parser result
 */
interface DictionaryParseResult {
  /** Parsed key-value pairs */
  params: Record<string, string>;
  /** Duplicate keys found (strict mode violation) */
  duplicates: string[];
  /** All keys found (for unknown key detection) */
  keys: string[];
}

/**
 * Simple RFC 8941-like dictionary parser (ReDoS-safe)
 *
 * Parses: key1="value1", key2="value2"
 * Returns map of key -> value (unquoted) plus metadata for strict validation
 *
 * Uses explicit character-by-character parsing to avoid ReDoS vulnerabilities
 * from regex alternation patterns.
 */
function parseSimpleDictionary(input: string): DictionaryParseResult {
  const params: Record<string, string> = {};
  const duplicates: string[] = [];
  const keys: string[] = [];

  let i = 0;
  const len = input.length;

  while (i < len) {
    // Skip whitespace and commas
    while (i < len && (input[i] === ' ' || input[i] === ',' || input[i] === '\t')) {
      i++;
    }
    if (i >= len) break;

    // Parse key (word characters only)
    const keyStart = i;
    while (i < len && /\w/.test(input[i])) {
      i++;
    }
    const key = input.slice(keyStart, i);
    if (!key) break;

    // Skip whitespace before '='
    while (i < len && input[i] === ' ') i++;

    // Expect '='
    if (i >= len || input[i] !== '=') break;
    i++; // skip '='

    // Skip whitespace after '='
    while (i < len && input[i] === ' ') i++;

    // Parse value (quoted or unquoted)
    let value: string;
    if (input[i] === '"') {
      // Quoted value - find closing quote
      i++; // skip opening quote
      const valueStart = i;
      while (i < len && input[i] !== '"') {
        i++;
      }
      value = input.slice(valueStart, i);
      if (i < len) i++; // skip closing quote
    } else {
      // Unquoted value - read until comma or whitespace
      const valueStart = i;
      while (i < len && input[i] !== ',' && input[i] !== ' ' && input[i] !== '\t') {
        i++;
      }
      value = input.slice(valueStart, i);
    }

    keys.push(key);

    // Track duplicates
    if (key in params) {
      duplicates.push(key);
    }

    params[key] = value;
  }

  return { params, duplicates, keys };
}

// ---------------------------------------------------------------------------
// Body Profile Parser
// ---------------------------------------------------------------------------

/**
 * Parse body profile (JSON body with peac_receipt or peac_receipts)
 *
 * Per TRANSPORT-PROFILES.md:
 * - peac_receipt: single receipt (string)
 * - peac_receipts: multiple receipts (array of strings)
 *
 * @param body - Parsed JSON body object
 * @returns Parse result
 */
export function parseBodyProfile(body: unknown): TransportProfileParseResult<BodyProfileResult> {
  if (body === null || typeof body !== 'object') {
    return {
      ok: false,
      reason: 'invalid_transport',
      errorCode: 'E_VERIFY_INVALID_TRANSPORT',
      message: 'Body must be a JSON object',
    };
  }

  const obj = body as Record<string, unknown>;

  // Check for peac_receipts (array, takes precedence)
  if ('peac_receipts' in obj) {
    if (!Array.isArray(obj.peac_receipts)) {
      return {
        ok: false,
        reason: 'invalid_transport',
        errorCode: 'E_VERIFY_INVALID_TRANSPORT',
        message: 'peac_receipts must be an array',
      };
    }

    const receipts: string[] = [];
    for (let i = 0; i < obj.peac_receipts.length; i++) {
      const receipt = obj.peac_receipts[i];
      if (typeof receipt !== 'string') {
        return {
          ok: false,
          reason: 'invalid_transport',
          errorCode: 'E_VERIFY_INVALID_TRANSPORT',
          message: `peac_receipts[${i}] must be a string`,
        };
      }
      receipts.push(receipt);
    }

    if (receipts.length === 0) {
      return {
        ok: false,
        reason: 'invalid_transport',
        errorCode: 'E_VERIFY_INVALID_TRANSPORT',
        message: 'peac_receipts array is empty',
      };
    }

    return {
      ok: true,
      result: {
        profile: 'body',
        receipts,
      },
    };
  }

  // Check for peac_receipt (single)
  if ('peac_receipt' in obj) {
    if (typeof obj.peac_receipt !== 'string') {
      return {
        ok: false,
        reason: 'invalid_transport',
        errorCode: 'E_VERIFY_INVALID_TRANSPORT',
        message: 'peac_receipt must be a string',
      };
    }

    if (obj.peac_receipt.length === 0) {
      return {
        ok: false,
        reason: 'invalid_transport',
        errorCode: 'E_VERIFY_INVALID_TRANSPORT',
        message: 'peac_receipt is empty',
      };
    }

    return {
      ok: true,
      result: {
        profile: 'body',
        receipts: [obj.peac_receipt],
      },
    };
  }

  return {
    ok: false,
    reason: 'invalid_transport',
    errorCode: 'E_VERIFY_INVALID_TRANSPORT',
    message: 'Body must contain peac_receipt or peac_receipts',
  };
}

// ---------------------------------------------------------------------------
// Auto-detect Parser
// ---------------------------------------------------------------------------

/**
 * Auto-detect and parse transport profile from request context
 *
 * @param context - Request context with headers and optional body
 * @returns Parse result
 */
export function parseTransportProfile(context: {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}): TransportProfileParseResult {
  const peacReceipt = context.headers['peac-receipt'] ?? context.headers['PEAC-Receipt'];
  const peacPointer =
    context.headers['peac-receipt-pointer'] ?? context.headers['PEAC-Receipt-Pointer'];

  // Header profile takes precedence
  if (peacReceipt !== undefined) {
    return parseHeaderProfile(peacReceipt);
  }

  // Pointer profile second
  if (peacPointer !== undefined) {
    return parsePointerProfile(peacPointer);
  }

  // Body profile last (if body provided)
  if (context.body !== undefined) {
    return parseBodyProfile(context.body);
  }

  return {
    ok: false,
    reason: 'invalid_transport',
    errorCode: 'E_VERIFY_INVALID_TRANSPORT',
    message:
      'No transport profile detected (missing PEAC-Receipt, PEAC-Receipt-Pointer, or body receipt)',
  };
}
