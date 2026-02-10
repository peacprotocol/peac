# PEAC Flagship Examples

Canonical examples demonstrating PEAC Protocol integration patterns.

## Examples

| Example                                   | Description                                        |
| ----------------------------------------- | -------------------------------------------------- |
| [x402-node-server](./x402-node-server/)   | x402 HTTP 402 payment flow with PEAC receipts      |
| [pay-per-inference](./pay-per-inference/) | Agent handles 402, obtains receipt, retries        |
| [pay-per-crawl](./pay-per-crawl/)         | Policy evaluation + receipt flow for AI crawlers   |
| [rsl-collective](./rsl-collective/)       | RSL integration and core claims parity             |
| [mcp-tool-call](./mcp-tool-call/)         | MCP paid tools with budget enforcement             |
| [telemetry-otel](./telemetry-otel/)       | OpenTelemetry integration with privacy modes       |
| [erc8004-feedback](./erc8004-feedback/)   | PEAC records as ERC-8004 reputation evidence       |
| [openclaw-capture](./openclaw-capture/)   | OpenClaw tool calls as signed interaction evidence |

## Prerequisites

From the repository root:

```bash
pnpm install
pnpm build
```

## Running Examples

Each example has a `demo` script:

```bash
# x402 payment flow with PEAC receipts
cd examples/x402-node-server && pnpm demo

# Pay-per-inference flow
cd examples/pay-per-inference && pnpm demo

# Pay-per-crawl with policy
cd examples/pay-per-crawl && pnpm demo

# RSL collective integration
cd examples/rsl-collective && pnpm demo

# MCP tool call with budget
cd examples/mcp-tool-call && pnpm demo

# OpenTelemetry integration
cd examples/telemetry-otel && pnpm build && pnpm start
```

## CI Harness

All examples are verified in CI:

- `pnpm examples:check` - TypeScript compilation check
- No `X-`-prefixed PEAC headers allowed (use `PEAC-Receipt` instead)

## Requirements

- Node.js 20+
- pnpm 8+
