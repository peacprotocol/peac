# PEAC Flagship Examples

Canonical examples demonstrating PEAC Protocol integration patterns.

## Examples

| Example                                  | Description                                 |
| ---------------------------------------- | ------------------------------------------- |
| [pay-per-inference/](pay-per-inference/) | Agent handles 402, obtains receipt, retries |
| [pay-per-crawl/](pay-per-crawl/)         | Policy Kit + receipts for AI crawlers       |
| [rsl-collective/](rsl-collective/)       | RSL token mapping to PEAC ControlPurpose    |
| [mcp-tool-call/](mcp-tool-call/)         | MCP paid tools with budget enforcement      |

## Running Examples

Each example can be run with:

```bash
cd examples/<name>
pnpm install
pnpm demo
```

## CI Harness

All examples are verified in CI:

- `pnpm examples:check` - TypeScript compilation check
- No X-PEAC headers allowed (use `PEAC-Receipt` instead)

## Requirements

- Node.js 20+
- pnpm 8+
