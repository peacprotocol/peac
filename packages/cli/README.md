# @peac/cli

PEAC protocol command-line tools for receipt verification, decoding, policy management, conformance testing, and evidence reconciliation.

## Installation

```bash
pnpm add -g @peac/cli
```

Or run directly without installing:

```bash
npx @peac/cli verify <receipt.jws>
```

## What It Does

`@peac/cli` provides the `peac` command for working with signed interaction receipts from the terminal. It supports verifying receipt signatures, decoding receipt contents, validating issuer configurations, managing policies, running conformance test suites, generating sample receipts, and reconciling evidence bundles.

## How Do I Use It?

### Verify a receipt

```bash
peac verify <jws>
peac verify receipt.jws --verbose
```

Decodes the receipt, displays claims (issuer, audience, amount, payment rail), and verifies the cryptographic signature. Exit code 0 on success, 1 on failure.

### Decode a receipt without verification

```bash
peac decode <jws>
peac decode receipt.jws --json
```

Parses and displays the JWS header and claims payload without checking the signature. Use `--json` for machine-readable output.

### Validate an issuer configuration

```bash
peac validate-issuer path/to/peac-issuer.json
peac validate-issuer https://example.com
```

Validates a `peac-issuer.json` file or fetches and validates one from an issuer URL. Displays issuer metadata including JWKS URI, supported algorithms, and payment rails.

### Policy management

```bash
peac policy init                  # Create a new policy file
peac policy validate policy.yaml  # Validate policy syntax
peac policy explain policy.yaml   # Debug rule matching
peac policy generate policy.yaml  # Compile to deployment artifacts
peac policy list-profiles         # List available policy profiles
peac policy show-profile <name>   # Show profile details
```

Use `--json` for machine-readable output, `--yes` to skip prompts, `--strict` to exit non-zero on warnings.

### Run conformance tests

```bash
peac conformance run                          # Standard level, text output
peac conformance run --level full             # Full level
peac conformance run --output json            # JSON output
peac conformance run --output markdown        # Markdown report
peac conformance run --category claims        # Filter by category
peac conformance run --fixtures ./my-vectors  # Custom fixtures path
```

### List conformance fixtures

```bash
peac conformance list
peac conformance list --category claims
```

### Reconcile evidence bundles

```bash
peac reconcile <bundle-a.json> <bundle-b.json>
```

Merges two evidence bundles and detects conflicts using composite `(iss, jti)` keys with fallback resolution. Conflicts are surfaced for human decision; no auto-resolution.

### Generate sample receipts

```bash
peac samples list                       # List available samples
peac samples show basic-receipt         # Show a specific sample
peac samples generate --output ./out    # Generate sample files
```

## Integrates With

- `@peac/protocol` (Layer 3): Receipt verification and issuance
- `@peac/crypto` (Layer 2): JWS decoding and signature operations
- `@peac/schema` (Layer 1): Receipt schema validation
- `@peac/audit`: Evidence bundle reading for reconciliation
- `@peac/policy-kit`: Policy loading, validation, and compilation
- `@peac/net-node`: SSRF-aware HTTP client used by `peac discover`

## For Agent Developers

If you are building AI agents that produce or consume signed receipts, the CLI is useful for inspecting receipts during development and debugging. For programmatic integration, use `@peac/protocol` directly. For MCP-based tool integration, use [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server).

## For Operators

The CLI supports operator workflows including policy authoring (`peac policy init`), issuer configuration validation (`peac validate-issuer`), conformance testing (`peac conformance run`), and evidence reconciliation (`peac reconcile`). Use `--json` flags for integration with CI pipelines and monitoring systems.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
