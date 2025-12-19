# PEAC Protocol Examples

Canonical flow examples demonstrating PEAC protocol integration patterns.

## Examples

| Example                                   | Description                                      |
| ----------------------------------------- | ------------------------------------------------ |
| [pay-per-inference](./pay-per-inference/) | Agent handles 402, obtains receipt, retries      |
| [pay-per-crawl](./pay-per-crawl/)         | Policy evaluation + receipt flow for AI crawlers |
| [rsl-collective](./rsl-collective/)       | RSL integration and core claims parity           |

## Prerequisites

From the repository root:

```bash
pnpm install
pnpm build
```

## Running Examples

Each example has a `demo` script:

```bash
# Pay-per-inference flow
cd examples/pay-per-inference && pnpm demo

# Pay-per-crawl with policy
cd examples/pay-per-crawl && pnpm demo

# RSL collective integration
cd examples/rsl-collective && pnpm demo
```

## CI Verification

From the repository root:

```bash
pnpm examples:check
```

This typechecks all examples without running them.

## No External Dependencies

All examples use:

- Local keypair generation
- Simulated payment services
- In-memory verification

No network calls, no secrets required.

## Key Concepts Demonstrated

### 402 Payment Required

Resources return HTTP 402 with payment requirements:

- `PEAC-Price`: Amount in smallest currency unit
- `PEAC-Currency`: ISO 4217 currency code
- `PEAC-Issuer`: URL of receipt issuer

### Receipt Verification

Before granting access, verify:

1. JWS signature is valid (cryptographic)
2. `aud` matches resource URL (audience)
3. `amt`/`cur` meet price requirements (payment)

### Core Claims Parity

`toCoreClaims()` extracts semantic fields for comparison:

- Strips rail-specific evidence
- Produces byte-identical JCS output regardless of source
- Requires RFC 8785 canonicalization for comparison

### Policy Evaluation

`@peac/policy-kit` provides:

- YAML/JSON policy parsing
- First-match-wins rule evaluation
- Artifact generation (peac.txt, robots.txt)
