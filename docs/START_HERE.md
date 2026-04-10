# Start Here

PEAC is most useful where logs are not enough: payments, cross-boundary verification, audit, dispute review, and multi-agent workflows.

Pick the path that matches what you are building.

## I run an API or HTTP service

You want to issue signed receipts proving what terms applied and what happened.

1. Install: `pnpm add @peac/middleware-express @peac/crypto @peac/protocol`
2. Follow the [API Provider Quickstart](guides/quickstart-api-provider.md) (5 minutes)
3. See [examples/hello-world](../examples/hello-world/) for the minimal standalone version

Key packages: `@peac/middleware-express`, `@peac/protocol`, `@peac/crypto`

## I run an MCP server

You want to add receipt operations (verify, inspect, issue, bundle) to your MCP server, or attach receipts to tool responses.

1. Try it now: `npx -y @peac/mcp-server --help`
2. Read the [MCP Integration Kit](../integrator-kits/mcp/README.md) for full setup
3. See [examples/mcp-tool-call](../examples/mcp-tool-call/) for a paid-tool example

Key packages: `@peac/mcp-server`, `@peac/mappings-mcp`

## I want to verify a receipt

You have a receipt (JWS string) and want to verify it offline with a public key.

1. Install: `pnpm add @peac/protocol @peac/crypto`
2. Follow the [Agent Operator Quickstart](guides/quickstart-agent-operator.md) (5 minutes)
3. See [examples/minimal](../examples/minimal/) for typed accessor helpers

Key packages: `@peac/protocol`, `@peac/crypto`

## I build A2A agents

You want to carry receipts across Agent-to-Agent Protocol flows.

1. Install: `pnpm add @peac/mappings-a2a @peac/protocol @peac/crypto`
2. Read the [A2A Integration Kit](../integrator-kits/a2a/README.md)
3. See [examples/a2a-gateway-pattern](../examples/a2a-gateway-pattern/) for the gateway pattern

Key packages: `@peac/mappings-a2a`, `@peac/protocol`

## Integration areas

### Commerce and payment evidence

You want verifiable evidence from commerce and payment flows across paymentauth/MPP, ACP, Stripe SPT, x402, or UCP. Prove what was offered, challenged, paid, or settled across organizational boundaries.

1. Choose your protocol:
   - **paymentauth/MPP**: [paymentauth Integration Kit](../integrator-kits/paymentauth/README.md)
   - **ACP**: [ACP Integration Kit](../integrator-kits/acp/README.md)
   - **x402**: [x402 Integration Kit](../integrator-kits/x402/README.md)
2. See [Commerce Evidence Spec](specs/COMMERCE-EVIDENCE.md) for boundary rules
3. See [examples/](../examples/) for runnable demos

Key packages: `@peac/mappings-paymentauth`, `@peac/mappings-acp`, `@peac/rails-stripe`, `@peac/adapter-x402`, `@peac/mappings-ucp`

### Audit, dispute, and governance evidence

You need signed evidence for audit, dispute review, or governance workflows. Evidence that survives organizational boundaries, not just local logs.

1. Start with the [API Provider Quickstart](guides/quickstart-api-provider.md) to understand issuance
2. See [Evidence Bundles](specs/EVIDENCE-CARRIER-CONTRACT.md) for offline verification bundles
3. Review [Governance Mappings](governance/) for NIST AI RMF, EU AI Act, OWASP ASI alignment

Key packages: `@peac/protocol`, `@peac/audit`

## Core concepts

- **Receipt:** A signed JWS (`interaction-record+jwt`) proving what terms applied and what happened
- **Kind:** `evidence` (records what happened) or `challenge` (requests proof from a peer)
- **Type:** Reverse-DNS identifier for what the receipt represents (e.g., `org.peacprotocol/payment`)
- **Extensions:** Typed data groups (commerce, access, identity, etc.) carrying domain-specific evidence
- **Offline verification:** Receipts verify with just the public key; no network calls required

## Package layering

```text
Layer 0: @peac/kernel       (types, constants)
Layer 1: @peac/schema       (Zod validation)
Layer 2: @peac/crypto       (Ed25519 signing)
Layer 3: @peac/protocol     (issue, verifyLocal)
Layer 4: @peac/mappings-*   (MCP, A2A, x402, etc.)
Layer 5: @peac/mcp-server   (MCP server)
```

Dependencies flow down only. Start at the highest layer you need.

## Reference

- [Compatibility Matrix](COMPATIBILITY_MATRIX.md): wire format support, runtime environments, deprecation schedule
- [Migration Guide](MIGRATION_CURRENT.md): upgrade paths from Wire 0.1, `@peac/core`, legacy API
- [Deprecation Policy](DEPRECATION_POLICY.md): surface lifecycle, removal windows, HTTP deprecation headers
