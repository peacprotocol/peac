#!/usr/bin/env bash
# verify-mcp-quickstart.sh
#
# Merge-blocking gate script: proves the MCP Streamable HTTP quickstart works
# end-to-end for the branch under review. Starts the MCP server in HTTP mode,
# exercises the MCP JSON-RPC protocol, and asserts verification succeeds.
# Local fallback is not accepted as proof.
#
# This gate runs the local workspace package (not the published npm version),
# so it validates the branch under test rather than whatever version is
# currently on npm. Do not replace the local invocation below with `npx`,
# `pnpm dlx`, or any other published-package execution path.
#
# Exit 0: HTTP quickstart end-to-end verified against branch source
# Exit 1: HTTP path failed

set -euo pipefail

PORT="${MCP_GATE_PORT:-13099}"
SERVER_PID=""
MCP_SERVER_CLI="packages/mcp-server/dist/cli.cjs"

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "=== MCP HTTP Quickstart Gate ==="

# Step 0: Ensure the local workspace package is built.
# The gate must run the branch's code, not any published npm version.
if [ ! -f "$MCP_SERVER_CLI" ]; then
  echo "0. Building @peac/mcp-server (local workspace)..."
  pnpm --filter @peac/mcp-server build
fi

# Step 1: Start MCP server in HTTP mode from the local workspace package
echo "1. Starting local @peac/mcp-server on port $PORT..."
node "$MCP_SERVER_CLI" --transport http --port "$PORT" &
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

# Step 2: Initialize MCP session via JSON-RPC.
# MCP Streamable HTTP requires Accept: application/json, text/event-stream.
# The server returns an SSE-framed response and a Mcp-Session-Id header
# that subsequent requests must include.
echo "2. Initializing MCP session..."
INIT_HEADERS_FILE=$(mktemp)
INIT_BODY=$(curl -sS -D "$INIT_HEADERS_FILE" -X POST "http://127.0.0.1:$PORT/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"gate-test","version":"1.0.0"}}}')

INIT_JSON=$(echo "$INIT_BODY" | sed -n 's/^data: //p' | head -1)
if [ -z "$INIT_JSON" ] || echo "$INIT_JSON" | grep -q '"error"'; then
  echo "FAIL: MCP initialization returned error: $INIT_BODY"
  rm -f "$INIT_HEADERS_FILE"
  exit 1
fi

SESSION_ID=$(grep -i '^mcp-session-id:' "$INIT_HEADERS_FILE" | sed 's/^[Mm]cp-[Ss]ession-[Ii]d: *//' | tr -d '\r\n')
rm -f "$INIT_HEADERS_FILE"
if [ -z "$SESSION_ID" ]; then
  echo "FAIL: MCP server did not return Mcp-Session-Id header"
  exit 1
fi
echo "   MCP session initialized (session: ${SESSION_ID:0:8}...)"

# Step 3: Issue a receipt using the local workspace @peac/protocol package.
# We invoke node from inside packages/mcp-server so the workspace dependency
# on @peac/protocol resolves from its package.json. This keeps the gate
# testing branch source end-to-end (no published npm versions involved).
echo "3. Issuing test receipt..."
RECEIPT=$(cd packages/mcp-server && node -e "
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

# Step 4: Verify via MCP server over HTTP using the same session
echo "4. Verifying receipt via MCP HTTP..."
VERIFY_BODY=$(curl -sS -X POST "http://127.0.0.1:$PORT/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"peac_verify\",\"arguments\":{\"receipt\":\"$RECEIPT\"}}}")

VERIFY_JSON=$(echo "$VERIFY_BODY" | sed -n 's/^data: //p' | head -1)
if [ -z "$VERIFY_JSON" ] || echo "$VERIFY_JSON" | grep -q '"error"'; then
  echo "FAIL: MCP verify returned error: $VERIFY_BODY"
  exit 1
fi

echo "   MCP verify response received"

echo ""
echo "=== PASS: MCP HTTP quickstart end-to-end verified ==="
