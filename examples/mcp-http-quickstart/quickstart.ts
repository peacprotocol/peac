/**
 * MCP Streamable HTTP Quickstart
 *
 * Demonstrates issuing and verifying a PEAC receipt via the MCP server
 * over Streamable HTTP transport. Completes in under 30 seconds.
 *
 * Prerequisites:
 *   Start the MCP server in another terminal:
 *     npx -y @peac/mcp-server --transport http --port 3000 \
 *       --issuer-key env:PEAC_ISSUER_KEY --issuer-id https://demo.example.com
 *
 * Run: pnpm demo
 */

import { generateKeypair, issue, verifyLocal } from '@peac/protocol';

const MCP_URL = process.env.MCP_URL ?? 'http://127.0.0.1:3000/mcp';

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: { content?: Array<{ type: string; text: string }> };
  error?: { code: number; message: string };
}

async function mcpCall(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });
  return (await res.json()) as JsonRpcResponse;
}

async function main() {
  console.log('MCP Streamable HTTP Quickstart\n');

  // Step 1: Generate a keypair for local issuance
  const { privateKey, publicKey } = await generateKeypair();
  const kid = 'quickstart-key-1';

  // Step 2: Issue a receipt locally
  console.log('1. Issuing a receipt...');
  const { jws } = await issue({
    iss: 'https://quickstart.example.com',
    kind: 'evidence',
    type: 'org.peacprotocol/mcp-tool-call',
    privateKey,
    kid,
  });
  console.log(`   Receipt issued (${jws.length} chars)\n`);

  // Step 3: Verify via MCP server (HTTP transport)
  console.log('2. Verifying via MCP server (HTTP)...');
  try {
    // Initialize session
    const initRes = await mcpCall('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'quickstart', version: '1.0.0' },
    });

    if (initRes.error) {
      console.log(`   MCP server not running at ${MCP_URL}`);
      console.log('   Start it with: npx -y @peac/mcp-server --transport http --port 3000\n');
      console.log('   Falling back to local verification...');
    } else {
      console.log('   MCP session initialized');

      // Call peac_verify tool
      const verifyRes = await mcpCall('tools/call', {
        name: 'peac_verify',
        arguments: { receipt: jws },
      });

      if (verifyRes.result?.content?.[0]) {
        const text = verifyRes.result.content[0].text;
        console.log(`   MCP verify result: ${text.slice(0, 100)}...`);
      }
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`   MCP server not reachable at ${MCP_URL} (${reason})`);
    console.log('   Falling back to local verification...');
  }

  // Step 4: Always verify locally as proof
  console.log('\n3. Local verification (always works)...');
  const result = await verifyLocal(jws, publicKey);
  if (result.valid) {
    console.log('   Verified: true');
    console.log(`   Issuer:   ${result.claims.iss}`);
    console.log(`   Type:     ${result.claims.type}`);
    console.log(`   Kind:     ${result.claims.kind}`);
  } else {
    console.log(`   Verification failed: ${result.code}`);
  }

  console.log('\nQuickstart complete.');
}

main().catch(console.error);
