/**
 * MCP Tool Call Example
 *
 * Demonstrates MCP tool integration with PEAC records:
 * 1. MCP server exposes a paid tool
 * 2. A signed record is attached to the tool response via the _meta carrier
 * 3. Client extracts and verifies the record
 *
 * The record uses `type: 'org.peacprotocol/mcp-tool-call'`. This is an example
 * custom type URI used by the MCP recipe. It is not a registered PEAC extension
 * group or registered receipt type. The reference public verifier
 * (`@peac/protocol.verifyLocal()`) emits a `type_unregistered` warning for
 * unregistered type values, which downstream policy logic may treat as
 * informational.
 *
 * This example uses local stubs - no external services required.
 */

import { issue, verifyLocal } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';
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
    results: [`Result 1 for "${query}"`, `Result 2 for "${query}"`, `Result 3 for "${query}"`],
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

  // Issue a signed record. The `type` value is an example custom URI used by
  // this MCP recipe; it is not a registered PEAC receipt type, so verification
  // will surface a `type_unregistered` warning.
  const receiptResult = await issue({
    iss: ISSUER_URL,
    kind: 'evidence',
    type: 'org.peacprotocol/mcp-tool-call',
    pillars: ['attribution', 'commerce'],
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: 'mcp',
        amount_minor: String(COST_PER_CALL_CENTS),
        currency: CURRENCY,
        reference: `mcp_${Date.now()}`,
        asset: CURRENCY,
        env: 'test',
      },
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
async function mcpClient(params: { privateKey: Uint8Array; publicKey: Uint8Array }): Promise<void> {
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

    // Check for record
    if (hasReceipt(response)) {
      const receipt = extractReceipt(response);
      console.log(`  Record attached: ${receipt!.length} chars`);

      // Verify record. Expect a `type_unregistered` warning because
      // org.peacprotocol/mcp-tool-call is intentionally unregistered.
      const result = await verifyLocal(receipt!, params.publicKey, { issuer: ISSUER_URL });
      if (result.valid) {
        const commerce = (
          result.claims.extensions as
            | { 'org.peacprotocol/commerce'?: { amount_minor?: string; currency?: string } }
            | undefined
        )?.['org.peacprotocol/commerce'];
        const typeUnregistered = result.warnings.some((w) => w.code === 'type_unregistered');
        console.log(`  Record valid: true`);
        console.log(`  Amount: ${commerce?.amount_minor ?? '?'} ${commerce?.currency ?? '?'}`);
        console.log(`  Warning type_unregistered (expected): ${typeUnregistered}`);
      } else {
        console.error(`  Record invalid: ${result.code} ${result.message}`);
      }
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
