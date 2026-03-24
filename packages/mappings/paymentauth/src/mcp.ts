/**
 * Paymentauth MCP-specific helpers.
 *
 * Extraction of paymentauth artifacts from MCP _meta keys
 * and capability advertisement typing per draft-payment-transport-mcp-00.
 *
 * Separated from generic JSON-RPC helpers in jsonrpc.ts.
 *
 * Co-existence: paymentauth uses "org.paymentauth/*" keys in _meta,
 * which do not collide with PEAC's "org.peacprotocol/*" keys.
 * Both can appear on the same MCP response.
 */

import { MCP_META_CREDENTIAL, MCP_META_RECEIPT } from './constants.js';

/**
 * Extract paymentauth credential from MCP tool response _meta.
 *
 * Looks for the org.paymentauth/credential key.
 */
export function extractCredentialFromMcpMeta(meta: Record<string, unknown>): string | null {
  const value = meta[MCP_META_CREDENTIAL];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Extract paymentauth receipt from MCP tool response _meta.
 *
 * Looks for the org.paymentauth/receipt key.
 */
export function extractReceiptFromMcpMeta(meta: Record<string, unknown>): string | null {
  const value = meta[MCP_META_RECEIPT];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * MCP capability for paymentauth (experimental.payment).
 *
 * Advertised in MCP InitializeResult.capabilities.experimental.
 */
export interface PaymentauthMcpCapability {
  /** Whether the server supports paymentauth challenges */
  supported: boolean;
  /** Accepted payment methods */
  methods?: string[];
  /** Accepted payment intents */
  intents?: string[];
}

/**
 * Extract paymentauth capability from MCP InitializeResult.
 *
 * Looks for capabilities.experimental.payment.
 */
export function extractPaymentauthCapability(
  capabilities: Record<string, unknown>
): PaymentauthMcpCapability | null {
  const experimental = capabilities.experimental;
  if (!experimental || typeof experimental !== 'object' || Array.isArray(experimental)) {
    return null;
  }

  const payment = (experimental as Record<string, unknown>).payment;
  if (!payment || typeof payment !== 'object' || Array.isArray(payment)) {
    return null;
  }

  const cap = payment as Record<string, unknown>;
  return {
    supported: cap.supported === true,
    methods: Array.isArray(cap.methods)
      ? cap.methods.filter((m): m is string => typeof m === 'string')
      : undefined,
    intents: Array.isArray(cap.intents)
      ? cap.intents.filter((i): i is string => typeof i === 'string')
      : undefined,
  };
}
