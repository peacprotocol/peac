/**
 * MCP Tool Call Example
 *
 * Demonstrates MCP tool integration with PEAC receipts:
 * 1. MCP server exposes a paid tool
 * 2. Receipt is attached to tool response
 * 3. Client extracts and verifies receipt
 *
 * This example uses local stubs - no external services required.
 */

import { issue } from '@peac/protocol';
import { generateKeypair, verify } from '@peac/crypto';
import { type PEACReceiptClaims } from '@peac/schema';
import {
  extractReceipt,
  hasReceipt,
  createPaidToolResponse,
  type MCPToolResponse,
} from '@peac/mappings-mcp';

// Configuration
const ISSUER_URL = 'https://mcp-provider.example.com';
const TOOL_NAME = 'web-search';
const COST_PER_CALL_CENTS = 5; // $0.05
const CURRENCY = 'USD';

/**
 * Simulated MCP tool that performs a web search.
 */
async function webSearchTool(query: string): Promise<{ results: string[] }> {
  // Simulate search
  return {
    results: [
      `Result 1 for "${query}"`,
      `Result 2 for "${query}"`,
      `Result 3 for "${query}"`,
    ],
  };
}

/**
 * MCP server handler for paid tool calls.
 */
async function mcpToolHandler(params: {
  tool: string;
  args: Record<string, unknown>;
  privateKey: Uint8Array;
}): Promise<MCPToolResponse> {
  // Execute tool
  const query = params.args.query as string;
  const toolResult = await webSearchTool(query);

  // Issue receipt
  const receiptResult = await issue({
    iss: ISSUER_URL,
    aud: `mcp:${params.tool}`,
    amt: COST_PER_CALL_CENTS,
    cur: CURRENCY,
    rail: 'mcp',
    reference: `mcp_${Date.now()}`,
    asset: CURRENCY,
    env: 'test',
    evidence: {
      tool: params.tool,
      query,
    },
    privateKey: params.privateKey,
    kid: 'mcp-key-2025',
  });

  // Attach receipt to response
  const response = createPaidToolResponse(params.tool, toolResult, receiptResult.jws, {
    cost_cents: COST_PER_CALL_CENTS,
    currency: CURRENCY,
  });

  return response;
}

/**
 * MCP client that makes paid tool calls.
 */
async function mcpClient(params: {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}): Promise<void> {
  console.log('\n=== PEAC MCP Tool Call Demo ===\n');

  // Make a few tool calls
  const queries = ['PEAC protocol', 'cryptographic receipts', 'agent commerce'];

  for (const query of queries) {
    console.log(`\n--- Tool Call: "${query}" ---`);

    const response = await mcpToolHandler({
      tool: TOOL_NAME,
      args: { query },
      privateKey: params.privateKey,
    });

    // Check for receipt
    if (hasReceipt(response)) {
      const receipt = extractReceipt(response);
      console.log(`  Receipt attached: ${receipt!.length} chars`);

      // Verify receipt
      const { valid, payload } = await verify<PEACReceiptClaims>(receipt!, params.publicKey);
      console.log(`  Receipt valid: ${valid}`);
      console.log(`  Amount: ${payload.amt} ${payload.cur}`);
    }

    // Show results
    const result = response.result as { results: string[] };
    console.log(`  Results: ${result.results.length} items`);
  }

  console.log('\n=== Demo Complete ===\n');
}

// Main execution
async function main() {
  // Generate keypair for demo
  const { privateKey, publicKey } = await generateKeypair();

  // Run client
  await mcpClient({
    privateKey,
    publicKey,
  });
}

main().catch(console.error);
