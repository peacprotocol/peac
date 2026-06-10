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
const MCP_PROTOCOL_VERSION = '2025-11-25';

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: {
    content?: Array<{ type: string; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };
  error?: { code: number; message: string };
}

let requestId = 0;

/**
 * POST a JSON-RPC request to the MCP endpoint.
 *
 * Streamable HTTP responses can arrive as plain JSON or as a Server-Sent
 * Events stream; both are handled. The `Mcp-Session-Id` response header from
 * `initialize` must be echoed on every subsequent request.
 */
async function mcpCall(
  method: string,
  params: Record<string, unknown>,
  sessionId?: string
): Promise<{ body: JsonRpcResponse; sessionId?: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
  });

  const responseSessionId = res.headers.get('mcp-session-id') ?? undefined;
  const contentType = res.headers.get('content-type') ?? '';
  const raw = await res.text();

  let body: JsonRpcResponse;
  if (contentType.includes('text/event-stream')) {
    // Take the last `data:` event line as the JSON-RPC response.
    const dataLines = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((line) => line.length > 0);
    if (dataLines.length === 0) {
      throw new Error(`Empty SSE response (HTTP ${res.status})`);
    }
    body = JSON.parse(dataLines[dataLines.length - 1]) as JsonRpcResponse;
  } else if (contentType.includes('application/json')) {
    body = JSON.parse(raw) as JsonRpcResponse;
  } else {
    throw new Error(`Unexpected response (HTTP ${res.status}): ${raw.slice(0, 200)}`);
  }

  return { body, sessionId: responseSessionId };
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
  let mcpVerified = false;
  try {
    // Initialize the session; capture Mcp-Session-Id from the response headers.
    const init = await mcpCall('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'quickstart', version: '1.0.0' },
    });

    if (init.body.error) {
      console.log(`   MCP initialize FAILED: ${init.body.error.message}`);
    } else if (!init.sessionId) {
      console.log('   MCP initialize returned no Mcp-Session-Id header');
    } else {
      console.log(`   MCP session initialized (Mcp-Session-Id: ${init.sessionId.slice(0, 8)}...)`);

      // Notify initialized, then call the peac_verify tool. The tool input
      // field for the compact JWS is `jws`; passing the public key keeps the
      // verification offline (no issuer discovery).
      await mcpCall('notifications/initialized', {}, init.sessionId);
      const verifyRes = await mcpCall(
        'tools/call',
        {
          name: 'peac_verify',
          arguments: { jws, public_key_base64url: Buffer.from(publicKey).toString('base64url') },
        },
        init.sessionId
      );

      if (verifyRes.body.error) {
        console.log(`   MCP peac_verify FAILED: ${verifyRes.body.error.message}`);
      } else if (verifyRes.body.result?.content?.[0]) {
        const text = verifyRes.body.result.content[0].text;
        console.log(`   MCP verify result: ${text.slice(0, 100)}...`);
        mcpVerified = true;
      } else {
        console.log('   MCP peac_verify returned no content');
      }
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`   MCP server not reachable at ${MCP_URL} (${reason})`);
    console.log('   Start it with: npx -y @peac/mcp-server --transport http --port 3000');
  }

  if (!mcpVerified) {
    console.log('   NOTE: the MCP HTTP path did NOT verify the receipt.');
    console.log('   The local verification below is a FALLBACK, not the MCP path.');
  }

  // Step 4: Always verify locally as proof (offline; no network)
  console.log(`\n3. Local verification (${mcpVerified ? 'cross-check' : 'FALLBACK'})...`);
  const result = await verifyLocal(jws, publicKey);
  if (result.valid) {
    console.log('   Verified: true');
    console.log(`   Issuer:   ${result.claims.iss}`);
    console.log(`   Type:     ${result.claims.type}`);
    console.log(`   Kind:     ${result.claims.kind}`);
  } else {
    console.log(`   Verification failed: ${result.code}`);
    process.exitCode = 1;
  }

  console.log(`\nQuickstart complete. MCP path verified: ${mcpVerified}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
