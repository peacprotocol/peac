# MCP Streamable HTTP Quickstart

Issue and verify a PEAC receipt via the MCP server over Streamable HTTP. End-to-end in under 10 minutes.

## Steps

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start the MCP server (HTTP transport)

In a separate terminal:

```bash
npx -y @peac/mcp-server --transport http --port 3000
```

For issuance via MCP (optional):

```bash
export PEAC_ISSUER_KEY=$(node -e "import('@peac/protocol').then(p=>p.generateKeypair()).then(k=>console.log(Buffer.from(k.privateKey).toString('hex')))")
npx -y @peac/mcp-server --transport http --port 3000 \
  --issuer-key env:PEAC_ISSUER_KEY --issuer-id https://demo.example.com
```

### 3. Run the quickstart

```bash
pnpm demo
```

### Expected output

```
MCP Streamable HTTP Quickstart

1. Issuing a receipt...
   Receipt issued (432 chars)

2. Verifying via MCP server (HTTP)...
   MCP session initialized
   MCP verify result: ...

3. Local verification (always works)...
   Verified: true
   Issuer:   https://quickstart.example.com
   Type:     org.peacprotocol/mcp-tool-call
   Kind:     evidence

Quickstart complete.
```

## What this demonstrates

- PEAC MCP server running over Streamable HTTP (not just stdio)
- Session initialization via JSON-RPC over HTTP
- Receipt verification via `peac_verify` MCP tool
- Local offline verification as fallback (always works without server)
- The server binds to `127.0.0.1` by default for security

## Transport comparison

| Feature           | stdio      | Streamable HTTP                                 |
| ----------------- | ---------- | ----------------------------------------------- |
| Default           | Yes        | `--transport http`                              |
| Session isolation | N/A        | Per-session (CVE-2026-25536)                    |
| Rate limiting     | N/A        | 100 req/min per session                         |
| RFC 9728 PRM      | N/A        | With `--public-url` + `--authorization-servers` |
| Network access    | Local pipe | `127.0.0.1:3000` (configurable)                 |
