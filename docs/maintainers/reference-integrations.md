# Reference Integration Validations

> First-party maintainer attestation that PEAC protocol surfaces work end-to-end.

## Validated Surfaces

Each surface is cataloged in `docs/adoption/integration-evidence.json` with full detail (PR, commit SHA, test files, spec references).

### MCP (Model Context Protocol)

Round-trip receipt issuance and verification via MCP tool calls (`peac_issue`, `peac_verify`). Pack-install smoke verified (ESM, CJS, types).

### A2A (Agent-to-Agent Protocol)

Round-trip through A2A metadata carrier: issue, embed in `metadata[extensionURI]`, extract, verify.

### EAT (Entity Attestation Token)

COSE_Sign1 identity adapter (DD-154). Decodes passport-style attestations and maps claims to PEAC actor binding.

## Maintainer Attestation

All surfaces listed above have been validated through:

- Automated test suites (unit, integration, property-based)
- Pack-install smoke tests (ESM/CJS/types resolution)
- API surface lock verification (snapshot-based contract tests)
- Performance benchmarks (Vitest bench, Node 24 baseline)
