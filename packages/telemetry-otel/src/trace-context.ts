/**
 * W3C Trace Context utilities
 *
 * Provides validation and extraction of W3C traceparent/tracestate values.
 * Used for correlating PEAC receipts with distributed traces.
 *
 * @see https://www.w3.org/TR/trace-context/
 */

/**
 * W3C Trace Context version 00 format regex
 *
 * Format: 00-{trace-id}-{parent-id}-{trace-flags}
 * - version: 2 hex digits (must be "00")
 * - trace-id: 32 hex digits
 * - parent-id: 16 hex digits
 * - trace-flags: 2 hex digits
 */
const TRACEPARENT_REGEX = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

/**
 * All zeros trace-id is invalid per W3C spec
 */
const INVALID_TRACE_ID = '00000000000000000000000000000000';

/**
 * All zeros parent-id is invalid per W3C spec
 */
const INVALID_PARENT_ID = '0000000000000000';

/**
 * Extension keys for receipt binding (vendor-neutral)
 */
export const TRACE_CONTEXT_KEYS = {
  TRACEPARENT: 'w3c/traceparent',
  TRACESTATE: 'w3c/tracestate',
} as const;

/**
 * Parsed traceparent components
 */
export interface TraceparentParts {
  version: string;
  traceId: string;
  parentId: string;
  traceFlags: string;
}

/**
 * Validate a traceparent string against W3C Trace Context spec
 *
 * Returns the value if valid, undefined if invalid.
 * Invalid values are dropped silently for security and interop.
 *
 * @param value - The traceparent string to validate
 * @returns The valid traceparent or undefined
 */
export function validateTraceparent(value: string): string | undefined {
  // Check format
  if (!TRACEPARENT_REGEX.test(value)) {
    return undefined;
  }

  // Extract parts for additional validation
  const parts = value.split('-');
  const traceId = parts[1];
  const parentId = parts[2];

  // All-zeros trace-id is invalid
  if (traceId === INVALID_TRACE_ID) {
    return undefined;
  }

  // All-zeros parent-id is invalid
  if (parentId === INVALID_PARENT_ID) {
    return undefined;
  }

  return value;
}

/**
 * Parse a valid traceparent into its components
 *
 * Only call this on validated traceparent values.
 *
 * @param traceparent - A validated traceparent string
 * @returns Parsed components
 */
export function parseTraceparent(traceparent: string): TraceparentParts {
  const parts = traceparent.split('-');
  return {
    version: parts[0],
    traceId: parts[1],
    parentId: parts[2],
    traceFlags: parts[3],
  };
}

/**
 * Check if a traceparent has the sampled flag set
 *
 * @param traceparent - A validated traceparent string
 * @returns true if sampled
 */
export function isSampled(traceparent: string): boolean {
  const flags = parseInt(traceparent.split('-')[3], 16);
  return (flags & 0x01) === 0x01;
}

/**
 * Extract traceparent from HTTP headers
 *
 * @param headers - HTTP headers (case-insensitive lookup)
 * @returns Validated traceparent or undefined
 */
export function extractTraceparentFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string | undefined {
  const value = headers['traceparent'] ?? headers['Traceparent'] ?? headers['TRACEPARENT'];

  if (typeof value === 'string') {
    return validateTraceparent(value);
  }

  if (Array.isArray(value) && value.length > 0) {
    return validateTraceparent(value[0]);
  }

  return undefined;
}

/**
 * Extract tracestate from HTTP headers
 *
 * Note: tracestate validation is more lenient than traceparent.
 * We only do basic sanity checks.
 *
 * @param headers - HTTP headers
 * @returns Tracestate string or undefined
 */
export function extractTracestateFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string | undefined {
  const value = headers['tracestate'] ?? headers['Tracestate'] ?? headers['TRACESTATE'];

  if (typeof value === 'string' && value.length > 0 && value.length <= 512) {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (first.length > 0 && first.length <= 512) {
      return first;
    }
  }

  return undefined;
}

/**
 * Create extension object for receipt binding
 *
 * @param headers - HTTP headers with trace context
 * @returns Extension object or undefined if no valid trace context
 */
export function createTraceContextExtensions(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> | undefined {
  const traceparent = extractTraceparentFromHeaders(headers);

  if (!traceparent) {
    return undefined;
  }

  const extensions: Record<string, string> = {
    [TRACE_CONTEXT_KEYS.TRACEPARENT]: traceparent,
  };

  const tracestate = extractTracestateFromHeaders(headers);
  if (tracestate) {
    extensions[TRACE_CONTEXT_KEYS.TRACESTATE] = tracestate;
  }

  return extensions;
}
