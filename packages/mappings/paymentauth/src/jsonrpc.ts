/**
 * Paymentauth JSON-RPC transport helpers.
 *
 * Generic JSON-RPC error detection and challenge/receipt extraction
 * per draft-payment-transport-mcp-00 (JSON-RPC section).
 * Separated from MCP-specific sugar in mcp.ts.
 */

import { JSONRPC_PAYMENT_REQUIRED, JSONRPC_VERIFICATION_FAILED } from './constants.js';
import type { RawPaymentauthChallenge, RawPaymentauthReceipt } from './types.js';
import { parsePaymentauthChallenges, parsePaymentauthReceipt } from './parse.js';

/**
 * Check if a JSON-RPC error indicates payment is required.
 */
export function isPaymentRequiredError(error: { code: number }): boolean {
  return error.code === JSONRPC_PAYMENT_REQUIRED;
}

/**
 * Check if a JSON-RPC error indicates verification failed.
 */
export function isVerificationFailedError(error: { code: number }): boolean {
  return error.code === JSONRPC_VERIFICATION_FAILED;
}

/**
 * Extract paymentauth challenge from a JSON-RPC -32042 error.
 *
 * The error data may contain a challenge string (WWW-Authenticate value)
 * or structured challenge parameters.
 */
export function parsePaymentauthFromJsonRpcError(error: {
  code: number;
  data?: unknown;
}): RawPaymentauthChallenge | null {
  if (error.code !== JSONRPC_PAYMENT_REQUIRED) return null;
  if (!error.data) return null;

  // If data is a string, try to parse as WWW-Authenticate value
  if (typeof error.data === 'string') {
    const challenges = parsePaymentauthChallenges(error.data);
    return challenges.length > 0 ? challenges[0] : null;
  }

  // If data is an object with a challenge field, extract params
  if (typeof error.data === 'object' && !Array.isArray(error.data)) {
    const data = error.data as Record<string, unknown>;
    if (typeof data.challenge === 'string') {
      const challenges = parsePaymentauthChallenges(data.challenge);
      return challenges.length > 0 ? challenges[0] : null;
    }
    // Structured challenge params
    if (typeof data.id === 'string' && typeof data.method === 'string') {
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') params[key] = value;
      }
      return { rawHeader: JSON.stringify(error.data), params };
    }
  }

  return null;
}

/**
 * Extract paymentauth receipt from a JSON-RPC result.
 *
 * The result may contain a receipt field (Payment-Receipt value).
 */
export function parsePaymentauthFromJsonRpcResult(result: unknown): RawPaymentauthReceipt | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;

  const obj = result as Record<string, unknown>;
  const receiptValue = obj.receipt;
  if (typeof receiptValue !== 'string') return null;

  try {
    return parsePaymentauthReceipt(receiptValue);
  } catch {
    return null;
  }
}
