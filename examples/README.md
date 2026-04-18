# Examples

Runnable examples that demonstrate PEAC Protocol integration patterns. Each example has a `pnpm demo` script and is exercised in CI.

## Start here

If you are new to PEAC, try these five in order:

| #   | Example                                                   | What it shows                                                          |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | [`hello-world`](./hello-world/)                           | Minimal issue and offline verify in a single Node script.              |
| 2   | [`mcp-tool-call`](./mcp-tool-call/)                       | MCP server attaches a signed record to each tool-call response.        |
| 3   | [`x402-node-server`](./x402-node-server/)                 | HTTP 402 flow with PEAC records carried on the response.               |
| 4   | [`managed-agents-export`](./managed-agents-export/)       | Export portable evidence from a managed-agent runtime event.           |
| 5   | [`commerce-evidence-bundle`](./commerce-evidence-bundle/) | Bundle x402, ACP, and paymentauth observations into a portable bundle. |

Outcome-led recipes walk through the full story for each of these: [`docs/SOLUTIONS/`](../docs/SOLUTIONS/).

## Full catalog

Every example below builds and runs end-to-end. The shipped list is the source of truth; new additions arrive alongside their corresponding spec or profile.

| Example                                                           | Description                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`hello-world`](./hello-world/)                                   | Issue a record, verify it offline.                                                        |
| [`minimal`](./minimal/)                                           | Minimal issuer with typed accessor helpers.                                               |
| [`mcp-http-quickstart`](./mcp-http-quickstart/)                   | MCP server with the Streamable HTTP transport.                                            |
| [`mcp-tool-call`](./mcp-tool-call/)                               | MCP tool-call with budget enforcement and attached records.                               |
| [`x402-node-server`](./x402-node-server/)                         | x402 payment flow with PEAC records.                                                      |
| [`x402-upto-evidence`](./x402-upto-evidence/)                     | x402 settlement-proof observational mapping.                                              |
| [`pay-per-inference`](./pay-per-inference/)                       | Agent handles 402, obtains receipt, retries.                                              |
| [`pay-per-crawl`](./pay-per-crawl/)                               | Policy evaluation plus record flow for AI crawlers.                                       |
| [`acp-delegated-checkout`](./acp-delegated-checkout/)             | ACP delegated-payment observation mapping.                                                |
| [`acp-session-lifecycle`](./acp-session-lifecycle/)               | ACP session-lifecycle observation mapping.                                                |
| [`mpp-payment-attempt`](./mpp-payment-attempt/)                   | MPP payment-attempt observation mapping.                                                  |
| [`paymentauth-evidence`](./paymentauth-evidence/)                 | paymentauth / MPP settlement observation mapping.                                         |
| [`paymentauth-jsonrpc`](./paymentauth-jsonrpc/)                   | paymentauth carried over JSON-RPC transport.                                              |
| [`stripe-spt-evidence`](./stripe-spt-evidence/)                   | Stripe SPT observation mapping.                                                           |
| [`stripe-projects-provisioning`](./stripe-projects-provisioning/) | Stripe projects provisioning observation.                                                 |
| [`x402-dual-header-read`](./x402-dual-header-read/)               | x402 dual-header precedence (`PEAC-Receipt` > `PAYMENT-RESPONSE` > `X-PAYMENT-RESPONSE`). |
| [`commerce-evidence-bundle`](./commerce-evidence-bundle/)         | Build a portable bundle across multiple commerce rails.                                   |
| [`managed-agents-export`](./managed-agents-export/)               | Export signed records from a managed-agent runtime.                                       |
| [`a2a-gateway-pattern`](./a2a-gateway-pattern/)                   | Agent-to-Agent gateway pattern.                                                           |
| [`agent-identity`](./agent-identity/)                             | Agent identity binding with DIDs and actor proofs.                                        |
| [`did-verification`](./did-verification/)                         | DID-based issuer verification.                                                            |
| [`content-signals`](./content-signals/)                           | Content-signals observation mapping.                                                      |
| [`rsl-collective`](./rsl-collective/)                             | Really Simple Licensing (RSL) integration and core claims parity.                         |
| [`erc8004-feedback`](./erc8004-feedback/)                         | PEAC records as ERC-8004 reputation evidence.                                             |
| [`openclaw-capture`](./openclaw-capture/)                         | OpenClaw tool calls as signed interaction records.                                        |
| [`telemetry-otel`](./telemetry-otel/)                             | OpenTelemetry integration with privacy modes.                                             |
| [`external-pilot`](./external-pilot/)                             | External pilot integration skeleton.                                                      |

## Prerequisites

From the repository root:

```bash
pnpm install
pnpm build
```

## Running

Each example exposes `pnpm demo`:

```bash
cd examples/hello-world && pnpm demo
```

Or run from the workspace root with a filter:

```bash
pnpm --filter @peac/example-hello-world demo
```

## CI

Every example is verified in CI via `pnpm examples:check` (TypeScript compilation) and, for examples with a `demo` target, runtime exercises in the release pipeline. Forbidden patterns (such as `X-`-prefixed PEAC headers) are blocked by the workspace lint configuration.

## Requirements

- Node.js 22+
- pnpm 8+
