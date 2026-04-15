# GitHub Copilot Enterprise MCP Registry

Register the PEAC Protocol MCP server in a GitHub Copilot org or
enterprise custom MCP registry.

> The GitHub Copilot enterprise MCP registry is documented as public
> preview at time of writing. Treat it as a supported-but-evolving
> compatibility surface; re-verify preview status before a production
> registration.

## Prerequisites

- Admin access to a GitHub enterprise or organization with the Copilot
  MCP registry feature enabled.
- A deployed PEAC MCP server endpoint reachable from GitHub.
- Node.js 22 or newer (for the compatibility checker).

## Compatibility checks (self-controlled)

Run the compatibility checker against your deployed endpoint before
submitting the server to the registry:

```bash
node scripts/check-copilot-compatibility.mjs --base-url https://your-endpoint.example.com
```

The checker validates:

- MCP `initialize` returns 200 with a populated `protocolVersion`.
- `OPTIONS` preflight returns `Access-Control-Allow-Origin` equal to
  `*` or an allow-listed GitHub origin, and
  `Access-Control-Allow-Methods` includes `POST`.
- `tools/list` returns a non-empty tools array.
- Tool `_meta` carries `org.peacprotocol/*` namespaced keys (the PEAC
  MCP server attaches `serverVersion`, `policyHash`, `protocolVersion`
  per DD-54).

Exit 0 means the endpoint matches the currently documented
compatibility requirements. Exit 1 means one or more checks failed;
exit 2 means the endpoint is unreachable (configuration error).

## Register the server (manual ops)

1. Open the Copilot MCP registry settings page for the target org or
   enterprise.
2. Add the PEAC endpoint's `/mcp` URL.
3. Confirm the registry shows the tool list from the checker above.
4. Record the registration in the private operations log.

## Trust boundary

- Distribution class: GitHub Copilot enterprise registry (admin-scoped
  visibility within the org or enterprise).
- The PEAC MCP server does not authenticate requests at the transport
  layer; CORS allow-origin and upstream authentication are the
  registry operator's responsibility.
- Pin the registry entry to an exact PEAC server version; update on
  each release.

## See also

- [PEAC Protocol MCP server](https://github.com/peacprotocol/peac/tree/main/packages/mcp-server)
- [Smithery Remote MCP guide](smithery-remote-mcp.md)
