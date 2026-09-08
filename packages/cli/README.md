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

`@peac/cli` provides the `peac` command for working with signed interaction records from the terminal. It supports verifying record signatures, decoding record contents, validating issuer configurations, managing policies, running conformance test suites, generating sample records, and reconciling evidence bundles.

## How Do I Use It?

### Verify a receipt

```bash
peac verify <jws>
peac verify receipt.jws --verbose
```

Decodes the receipt, displays claims (issuer, audience, amount, payment rail), and verifies the cryptographic signature. Without `--public-key`, verification resolves the issuer's keys over the network via issuer discovery. Exit code 0 on success, 1 on failure.

### Verify offline with a supplied public key

```bash
peac verify <jws-or-path> --public-key <jwk-or-single-key-jwks.json>
```

`--public-key <path>` verifies the record locally against the supplied public Ed25519 key using `verifyLocal()` from `@peac/protocol`. No network request, issuer discovery, or JWKS fetch is made, and there is no fallback to the network path. The record structure is validated as well as the signature.

The key file must be one of:

- a bare public Ed25519 JWK (`{"kty":"OKP","crv":"Ed25519","x":"..."}`), or
- a single-key JWKS (`{"keys":[<that JWK>]}`).

The loader fails closed and rejects: a file that is not valid JSON or not an object; a JWKS with no keys or with more than one key; a JWK that contains private key material (`d`); a key that is not `kty` `OKP` with `crv` `Ed25519`; a JWK missing the public value `x`, or whose `x` is not a 32-byte base64url value; and key files larger than 16 KiB. Error messages never echo key material.

Try it on the shipped samples. `samples generate` writes valid records under `valid/` and the matching public key set to `bundles/sandbox-jwks.json`:

```bash
peac samples generate -o ./s
peac verify ./s/valid/basic-record.jws --public-key ./s/bundles/sandbox-jwks.json
```

Expected output:

```text
Signature valid (offline).
```

On failure the command prints `Verification failed: <message>` with the error code (for example `E_INVALID_SIGNATURE` for a modified record) and exits 1.

A valid result establishes that the record was signed by the private key matching the supplied public key and has not changed since. It does not establish that the key or its holder should be trusted, or that the statements inside the record are true.

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

### Generate sample records

```bash
peac samples list                       # List available samples
peac samples show basic-record          # Show a specific sample
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
