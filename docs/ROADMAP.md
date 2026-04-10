# PEAC Protocol Roadmap

PEAC is the portable evidence and audit layer for agentic and machine-payment
flows. Receipts are signed JWS artifacts that verify offline.

## Current wire format

The stable receipt format is the Interaction Record (`interaction-record+jwt`).
The legacy `peac-receipt/0.1` format is frozen until v1.0 for compatibility.

See the `@peac/protocol`, `@peac/crypto`, and `@peac/schema` packages for the
reference implementation.

## Release notes

See [GitHub Releases](https://github.com/peacprotocol/peac/releases) for
per-version release notes.

## Design principles

- **Portable:** receipts verify offline with no network calls
- **Rail-neutral:** evidence only; never custody, settlement, or identity mandates
- **Transport-agnostic:** the same receipt format works across MCP, A2A, HTTP,
  gRPC, and x402
- **Fail-closed:** invalid or missing evidence is always a verification failure
- **Additive:** extensions use reverse-DNS namespacing; unknown keys pass through

## Versioning

PEAC follows semantic versioning. The stable wire format will remain
compatible until v1.0.
