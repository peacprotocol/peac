/**
 * Model Context Protocol (MCP) integration
 * Attach PEAC receipts to MCP tool responses
 */

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
 * MCP Tool Response with PEAC receipt
 */
export interface MCPToolResponseWithReceipt extends MCPToolResponse {
  peac_receipt?: string;
}

/**
 * Attach PEAC receipt to MCP tool response
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
 * Extract PEAC receipt from MCP tool response
 *
 * @param response - MCP tool response (possibly with receipt)
 * @returns PEAC receipt JWS or null if not present
 */
export function extractReceipt(response: MCPToolResponseWithReceipt): string | null {
  if (typeof response.peac_receipt === "string" && response.peac_receipt.length > 0) {
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
