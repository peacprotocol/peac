/**
 * Handler guards -- enforces policy limits and tool enablement
 *
 * ZERO MCP SDK imports (DD-57).
 */

import type { PolicyConfig } from '../infra/policy.js';
import type { HandlerResult } from './types.js';

/**
 * Check if the JWS input exceeds the configured max size.
 * Returns an error result if too large, undefined if OK.
 */
export function checkJwsSize(jws: string, policy: PolicyConfig): HandlerResult | undefined {
  const byteLength = new TextEncoder().encode(jws).length;
  if (byteLength > policy.limits.max_jws_bytes) {
    return {
      text: `Input rejected: JWS is ${byteLength} bytes, exceeding limit of ${policy.limits.max_jws_bytes} bytes`,
      structured: {
        ok: false,
        code: 'E_MCP_INPUT_TOO_LARGE',
        message: `JWS input is ${byteLength} bytes, limit is ${policy.limits.max_jws_bytes}`,
      },
      isError: true,
    };
  }
  return undefined;
}

/**
 * Check if the tool is enabled in policy.
 * Returns an error result if disabled, undefined if OK.
 */
export function checkToolEnabled(
  toolName: string,
  policy: PolicyConfig
): HandlerResult | undefined {
  const toolConfig = policy.tools[toolName];
  if (toolConfig && toolConfig.enabled === false) {
    return {
      text: `Tool "${toolName}" is disabled by server policy`,
      structured: {
        ok: false,
        code: 'E_MCP_TOOL_DISABLED',
        message: `Tool "${toolName}" is disabled by server policy`,
      },
      isError: true,
    };
  }
  return undefined;
}

/**
 * Recursively sum byte lengths of all string values in an object graph.
 * Depth is bounded by checkObjectDepth (called first in wrapHandler).
 * Uses a WeakSet to guard against cyclic references.
 */
function sumStringBytes(value: unknown, seen?: WeakSet<object>): number {
  if (typeof value === 'string') {
    return new TextEncoder().encode(value).length;
  }
  if (typeof value !== 'object' || value === null) return 0;

  // Cycle guard: skip objects we've already visited
  const visited = seen ?? new WeakSet<object>();
  if (visited.has(value as object)) return 0;
  visited.add(value as object);

  if (Array.isArray(value)) {
    let total = 0;
    for (const item of value) {
      total += sumStringBytes(item, visited);
    }
    return total;
  }
  let total = 0;
  for (const v of Object.values(value as Record<string, unknown>)) {
    total += sumStringBytes(v, visited);
  }
  return total;
}

/**
 * Bounded serialized-size estimator. Walks the object graph and estimates
 * JSON serialized bytes WITHOUT materializing the full string. Aborts early
 * when the estimate exceeds the limit (returns Infinity). This prevents
 * memory exhaustion from adversarial inputs with many small non-string values
 * (e.g. large arrays of numbers) that would bypass string-only counting.
 *
 * Accuracy: conservative overestimate for numbers (uses String(n).length),
 * exact for strings (JSON.stringify escapes), exact for structural overhead.
 * Uses a WeakSet cycle guard consistent with sumStringBytes.
 */
function estimateSerializedBytes(value: unknown, limit: number, seen?: WeakSet<object>): number {
  if (value === null) return 4; // "null"
  if (value === undefined) return 0; // omitted in JSON
  if (typeof value === 'boolean') return value ? 4 : 5; // "true" / "false"
  if (typeof value === 'number') return String(value).length;
  if (typeof value === 'string') return Buffer.byteLength(JSON.stringify(value), 'utf8');

  if (typeof value !== 'object') return 0;

  const visited = seen ?? new WeakSet<object>();
  if (visited.has(value as object)) return 0;
  visited.add(value as object);

  let total = 2; // {} or []

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (i > 0) total += 1; // comma
      total += estimateSerializedBytes(value[i], limit, visited);
      if (total > limit) return Infinity; // early exit
    }
    return total;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) total += 1; // comma
    const [k, v] = entries[i];
    total += Buffer.byteLength(JSON.stringify(k), 'utf8') + 1; // key + colon
    total += estimateSerializedBytes(v, limit, visited);
    if (total > limit) return Infinity; // early exit
  }
  return total;
}

/**
 * Check total input size across all string fields (recursive).
 * Prevents memory exhaustion from oversized jwks, public_key_base64url, etc.
 * Traverses the full object graph so nested payloads cannot bypass the limit.
 * Uses 2x max_jws_bytes as the total budget.
 *
 * Also applies a bounded serialized-size estimate (without materializing
 * the full JSON string) to catch large non-string structures like arrays
 * of numbers that bypass string-only counting.
 */
export function checkInputSizes(
  input: Record<string, unknown>,
  policy: PolicyConfig
): HandlerResult | undefined {
  const limit = policy.limits.max_jws_bytes * 2;

  // Primary check: recursive string byte sum
  const totalBytes = sumStringBytes(input);
  if (totalBytes > limit) {
    return {
      text: `Input rejected: total input is ${totalBytes} bytes, exceeding limit of ${limit} bytes`,
      structured: {
        ok: false,
        code: 'E_MCP_INPUT_TOO_LARGE',
        message: `Total input is ${totalBytes} bytes, limit is ${limit}`,
      },
      isError: true,
    };
  }

  // Fallback: bounded serialized-size estimate catches large non-string structures
  // without materializing the full JSON string (prevents allocation attacks)
  const estimatedBytes = estimateSerializedBytes(input, limit);
  if (estimatedBytes > limit) {
    return {
      text: `Input rejected: estimated serialized input exceeds limit of ${limit} bytes`,
      structured: {
        ok: false,
        code: 'E_MCP_INPUT_TOO_LARGE',
        message: `Estimated serialized input exceeds limit of ${limit} bytes`,
      },
      isError: true,
    };
  }

  return undefined;
}

/**
 * Check that an object does not exceed maximum nesting depth.
 * Prevents stack overflow from deeply nested input params.
 */
export function checkObjectDepth(
  obj: unknown,
  maxDepth: number = 10,
  currentDepth: number = 0
): boolean {
  if (currentDepth > maxDepth) return false;
  if (typeof obj !== 'object' || obj === null) return true;
  if (Array.isArray(obj)) {
    return obj.every((item) => checkObjectDepth(item, maxDepth, currentDepth + 1));
  }
  return Object.values(obj as Record<string, unknown>).every((value) =>
    checkObjectDepth(value, maxDepth, currentDepth + 1)
  );
}

/**
 * Conservative placeholder id for envelope size estimation.
 * The MCP SDK does not expose the JSON-RPC request id to tool handlers,
 * so we budget for a typical UUID-length string id (36 chars + quotes = 38
 * bytes in JSON). This ensures the size cap is never underestimated due to
 * a longer-than-expected id from the client.
 */
const CONSERVATIVE_ID_PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

/**
 * Measure the byte length of a full JSON-RPC 2.0 response envelope.
 * This models the exact line that will be serialized to stdout by the
 * MCP SDK, including the request id and trailing newline.
 *
 * The +1 accounts for the line-feed delimiter that separates JSON-RPC
 * messages on the stdio transport.
 */
export function measureEnvelopeBytes(
  callToolResult: {
    content: unknown;
    structuredContent?: unknown;
    isError?: boolean;
  },
  id: string | number = CONSERVATIVE_ID_PLACEHOLDER
): number {
  const envelope = {
    jsonrpc: '2.0',
    id,
    result: {
      content: callToolResult.content,
      structuredContent: callToolResult.structuredContent,
      isError: callToolResult.isError,
    },
  };
  return Buffer.byteLength(JSON.stringify(envelope), 'utf8') + 1; // +1 for \n
}

export interface TruncationResult {
  text: string;
  truncated: boolean;
  originalBytes: number;
  returnedBytes: number;
}

const TRUNCATION_SUFFIX = '\n\n[TRUNCATED: response exceeded policy limit]';
const TRUNCATION_SUFFIX_BYTES = new TextEncoder().encode(TRUNCATION_SUFFIX).length;

/**
 * Truncate response text to stay within max_response_bytes.
 * Guarantees the final byte length is <= maxBytes by computing the
 * suffix size exactly and slicing the body budget accordingly.
 * Returns truncation metadata for structured output signaling.
 */
export function truncateResponse(text: string, policy: PolicyConfig): TruncationResult {
  const maxBytes = policy.limits.max_response_bytes;
  const encoded = new TextEncoder().encode(text);
  if (encoded.length <= maxBytes) {
    return { text, truncated: false, originalBytes: encoded.length, returnedBytes: encoded.length };
  }

  // Budget for body = maxBytes - suffix bytes. If maxBytes is tiny,
  // clamp to 0 so we still return the suffix as signal.
  const bodyBudget = Math.max(0, maxBytes - TRUNCATION_SUFFIX_BYTES);
  // Truncate at byte boundary, avoiding mid-character cuts via TextDecoder
  const truncatedText = new TextDecoder().decode(encoded.slice(0, bodyBudget));
  const finalText = truncatedText + TRUNCATION_SUFFIX;
  const finalEncoded = new TextEncoder().encode(finalText);
  return {
    text: finalText,
    truncated: true,
    originalBytes: encoded.length,
    returnedBytes: finalEncoded.length,
  };
}
