/**
 * @peac/mappings-mcp
 *
 * Model Context Protocol (MCP) integration for PEAC.
 * Attach and extract PEAC evidence carriers via MCP _meta keys (DD-125).
 */

// Budget enforcement
export * from './budget';

// Carrier _meta format (v0.11.1+ Evidence Carrier Contract)
export type {
  McpMeta,
  McpResultLike,
  AttachMetaOptions,
  McpExtractResult,
  McpExtractAsyncResult,
} from './meta';

export {
  attachReceiptToMeta,
  extractReceiptFromMeta,
  extractReceiptFromMetaAsync,
  McpCarrierAdapter,
  META_KEY_RECEIPT_REF,
  META_KEY_RECEIPT_JWS,
  META_KEY_RECEIPT_URL,
  META_KEY_AGENT_ID,
  META_KEY_VERIFIED_AT,
  META_KEY_LEGACY_RECEIPT,
  MCP_MAX_CARRIER_SIZE,
} from './meta';

// MCP _meta reserved key guard
export { assertNotMcpReservedKey, isMcpReservedKey } from './guard';

// ---------------------------------------------------------------------------
// Legacy API (backward compatible)
// ---------------------------------------------------------------------------

/**
 * MCP Tool Response
 */
export interface MCPToolResponse {
  tool: string;
  result: unknown;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * MCP Tool Response with PEAC receipt (legacy format)
 */
export interface MCPToolResponseWithReceipt extends MCPToolResponse {
  peac_receipt?: string;
}

/**
 * Attach PEAC receipt to MCP tool response (legacy format).
 *
 * Uses `peac_receipt` top-level key. For new integrations, prefer
 * `attachReceiptToMeta()` which uses the _meta carrier format (DD-125).
 *
 * @param response - MCP tool response
 * @param receiptJWS - PEAC receipt JWS
 * @returns MCP tool response with PEAC receipt attached
 */
export function attachReceipt(
  response: MCPToolResponse,
  receiptJWS: string
): MCPToolResponseWithReceipt {
  return {
    ...response,
    peac_receipt: receiptJWS,
  };
}

/**
 * Extract PEAC receipt from MCP tool response.
 *
 * Reads BOTH legacy `peac_receipt` field AND `_meta` carrier format (DD-125).
 * Prefers _meta format when both are present.
 *
 * @param response - MCP tool response (possibly with receipt)
 * @returns PEAC receipt JWS or null if not present
 */
export function extractReceipt(response: MCPToolResponseWithReceipt): string | null {
  // 1. Try _meta carrier format (v0.11.1+)
  if (response._meta) {
    const meta = response._meta as Record<string, unknown>;
    // New format: receipt_jws key
    const jws = meta['org.peacprotocol/receipt_jws'];
    if (typeof jws === 'string' && jws.length > 0) {
      return jws;
    }
    // Legacy _meta format: receipt key (v0.10.13)
    const legacyJws = meta['org.peacprotocol/receipt'];
    if (typeof legacyJws === 'string' && legacyJws.length > 0) {
      return legacyJws;
    }
  }

  // 2. Fall back to legacy peac_receipt field
  if (typeof response.peac_receipt === 'string' && response.peac_receipt.length > 0) {
    return response.peac_receipt;
  }
  return null;
}

/**
 * Check if MCP tool response has a PEAC receipt
 *
 * @param response - MCP tool response
 * @returns true if receipt is present
 */
export function hasReceipt(response: MCPToolResponseWithReceipt): boolean {
  return extractReceipt(response) !== null;
}

/**
 * Create MCP tool response with PEAC receipt for paid API calls
 *
 * @param tool - Tool name
 * @param result - Tool execution result
 * @param receiptJWS - PEAC receipt JWS
 * @param metadata - Optional metadata
 * @returns MCP tool response with receipt
 */
export function createPaidToolResponse(
  tool: string,
  result: unknown,
  receiptJWS: string,
  metadata?: Record<string, unknown>
): MCPToolResponseWithReceipt {
  const response: MCPToolResponse = {
    tool,
    result,
    ...(metadata && { metadata }),
  };

  return attachReceipt(response, receiptJWS);
}
