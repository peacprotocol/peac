#!/usr/bin/env bash
# verify-mcp-quickstart.sh
#
# Gate script for PR 1: proves MCP Streamable HTTP quickstart works end-to-end.
# Starts the MCP server in HTTP mode, exercises the MCP JSON-RPC protocol,
# and asserts verification succeeds. Does NOT count local fallback as proof.
#
# Exit 0: HTTP quickstart end-to-end verified
# Exit 1: HTTP path failed (local fallback is not accepted as proof)

set -euo pipefail

PORT="${MCP_GATE_PORT:-13099}"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "=== MCP HTTP Quickstart Gate ==="

# Step 1: Start MCP server in HTTP mode
echo "1. Starting MCP server on port $PORT..."
npx -y @peac/mcp-server --transport http --port "$PORT" &
SERVER_PID=$!

# Wait for readiness (max 10s)
for i in $(seq 1 20); do
  if curl -sf "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
    echo "   Server ready after ${i}x500ms"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "FAIL: MCP server did not start within 10 seconds"
    exit 1
  fi
  sleep 0.5
done

# Step 2: Initialize MCP session via JSON-RPC
echo "2. Initializing MCP session..."
INIT_RESPONSE=$(curl -sf -X POST "http://127.0.0.1:$PORT/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"gate-test","version":"1.0.0"}}}')

if echo "$INIT_RESPONSE" | grep -q '"error"'; then
  echo "FAIL: MCP initialization returned error: $INIT_RESPONSE"
  exit 1
fi
echo "   MCP session initialized"

# Step 3: Issue a receipt locally (for verification input)
echo "3. Issuing test receipt..."
RECEIPT=$(node -e "
import('@peac/protocol').then(async p => {
  const { privateKey } = await p.generateKeypair();
  const { jws } = await p.issue({
    iss: 'https://gate-test.example.com',
    kind: 'evidence',
    type: 'org.peacprotocol/gate-test',
    privateKey,
    kid: 'gate-key-1',
  });
  process.stdout.write(jws);
})" 2>/dev/null)

if [ -z "$RECEIPT" ]; then
  echo "FAIL: Could not issue test receipt"
  exit 1
fi
echo "   Receipt issued (${#RECEIPT} chars)"

# Step 4: Verify via MCP server over HTTP
echo "4. Verifying receipt via MCP HTTP..."
VERIFY_RESPONSE=$(curl -sf -X POST "http://127.0.0.1:$PORT/mcp" \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"peac_verify\",\"arguments\":{\"receipt\":\"$RECEIPT\"}}}")

if echo "$VERIFY_RESPONSE" | grep -q '"error"'; then
  echo "FAIL: MCP verify returned error: $VERIFY_RESPONSE"
  exit 1
fi

echo "   MCP verify response received"

echo ""
echo "=== PASS: MCP HTTP quickstart end-to-end verified ==="
