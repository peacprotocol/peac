/**
 * Transport Profile Selection and Response Wrapping
 *
 * Implements transport profile selection and body wrapping per TRANSPORT-PROFILES.md.
 *
 * @packageDocumentation
 */

import { HEADERS } from '@peac/kernel';
import { sha256Hex } from '@peac/crypto';
import { CONFIG_DEFAULTS } from './config.js';
import type { MiddlewareConfig } from './types.js';

/**
 * Maximum pointer header size (prevents oversized headers)
 */
const MAX_POINTER_HEADER_SIZE = 2048;

/**
 * Validate pointer URL for safety (SSRF prevention and header injection)
 *
 * @throws Error if URL is invalid or unsafe
 */
function validatePointerUrl(url: string): void {
  // Must be absolute HTTPS URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Pointer URL is not a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Pointer URL must use HTTPS');
  }

  // Prevent header injection via URL content
  // RFC 8941 quoted strings cannot contain " or \ without escaping
  if (url.includes('"') || url.includes('\\')) {
    throw new Error('Pointer URL contains invalid characters for structured header');
  }

  // Control characters are never valid in headers
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(url)) {
    throw new Error('Pointer URL contains control characters');
  }

  // Sanity check on length to prevent oversized headers
  if (url.length > MAX_POINTER_HEADER_SIZE) {
    throw new Error(`Pointer URL exceeds maximum length (${MAX_POINTER_HEADER_SIZE})`);
  }
}

/**
 * Calculate receipt size and determine appropriate transport
 *
 * Falls back from header to body if receipt exceeds maxHeaderSize.
 * Pointer transport is only used if explicitly configured (never auto-selected).
 *
 * @param receipt - JWS compact serialization
 * @param config - Transport configuration (optional fields)
 * @returns Selected transport profile
 *
 * @example
 * ```typescript
 * const transport = selectTransport(receipt, { maxHeaderSize: 4096 });
 * // Returns 'header' if receipt fits, 'body' otherwise
 *
 * // Also accepts empty config for defaults
 * const transport = selectTransport(receipt, {});
 * ```
 */
export function selectTransport(
  receipt: string,
  config: Partial<Pick<MiddlewareConfig, 'transport' | 'maxHeaderSize'>> = {}
): 'header' | 'body' | 'pointer' {
  const preferredTransport = config.transport ?? CONFIG_DEFAULTS.transport;
  const maxHeaderSize = config.maxHeaderSize ?? CONFIG_DEFAULTS.maxHeaderSize;

  // Pointer is only used when explicitly configured
  if (preferredTransport === 'pointer') {
    return 'pointer';
  }

  // Body is used when explicitly configured
  if (preferredTransport === 'body') {
    return 'body';
  }

  // For header preference, check size and fallback to body if needed
  // Header profile uses the receipt directly as the header value
  const receiptBytes = new TextEncoder().encode(receipt);
  if (receiptBytes.length > maxHeaderSize) {
    return 'body';
  }

  return 'header';
}

/**
 * Wrap a response body with a PEAC receipt (for body transport profile)
 *
 * Creates a wrapper object containing the original data and the receipt.
 * Per TRANSPORT-PROFILES.md, the body format is:
 * `{ "data": <original>, "peac_receipt": "<jws>" }`
 *
 * @param data - Original response body
 * @param receipt - JWS compact serialization
 * @returns Wrapped response body
 *
 * @example
 * ```typescript
 * const original = { items: [1, 2, 3] };
 * const wrapped = wrapResponse(original, receipt);
 * // { data: { items: [1, 2, 3] }, peac_receipt: "eyJ..." }
 * res.json(wrapped);
 * ```
 */
export function wrapResponse<T>(data: T, receipt: string): { data: T; peac_receipt: string } {
  return {
    data,
    peac_receipt: receipt,
  };
}

/**
 * Build response headers for a receipt based on transport profile
 *
 * For header profile: adds PEAC-Receipt header
 * For pointer profile: adds PEAC-Receipt-Pointer header
 * For body profile: returns empty headers (receipt is in body)
 *
 * @param receipt - JWS compact serialization
 * @param transport - Transport profile to use
 * @param pointerUrl - URL for pointer profile (required if transport is 'pointer')
 * @returns Headers to add to response
 */
export async function buildResponseHeaders(
  receipt: string,
  transport: 'header' | 'body' | 'pointer',
  pointerUrl?: string
): Promise<Record<string, string>> {
  switch (transport) {
    case 'header':
      return {
        [HEADERS.receipt]: receipt,
      };

    case 'pointer': {
      if (!pointerUrl) {
        throw new Error('pointerUrl is required for pointer transport');
      }
      // Validate pointer URL (SSRF prevention, header injection prevention)
      validatePointerUrl(pointerUrl);
      // Compute SHA-256 digest of receipt (lowercase hex)
      const digestHex = await sha256Hex(receipt);
      // RFC 8941 structured header dictionary format with quoted strings
      return {
        [HEADERS.receiptPointer]: `sha256="${digestHex}", url="${pointerUrl}"`,
      };
    }

    case 'body':
      // No headers for body profile
      return {};

    default:
      throw new Error(`Unknown transport profile: ${transport}`);
  }
}

/**
 * Input for building complete receipt result
 */
export interface BuildReceiptResultInput {
  receipt: string;
  transport: 'header' | 'body' | 'pointer';
  pointerUrl?: string;
  originalBody?: unknown;
}

/**
 * Build complete receipt result with headers and optional body wrapper
 *
 * @param input - Receipt and transport information
 * @returns Complete receipt result ready for response
 */
export async function buildReceiptResult(input: BuildReceiptResultInput): Promise<{
  receipt: string;
  transport: 'header' | 'body' | 'pointer';
  headers: Record<string, string>;
  bodyWrapper?: { data: unknown; peac_receipt: string };
}> {
  const headers = await buildResponseHeaders(input.receipt, input.transport, input.pointerUrl);

  const result: {
    receipt: string;
    transport: 'header' | 'body' | 'pointer';
    headers: Record<string, string>;
    bodyWrapper?: { data: unknown; peac_receipt: string };
  } = {
    receipt: input.receipt,
    transport: input.transport,
    headers,
  };

  // Add body wrapper for body transport
  if (input.transport === 'body' && input.originalBody !== undefined) {
    result.bodyWrapper = wrapResponse(input.originalBody, input.receipt);
  }

  return result;
}
