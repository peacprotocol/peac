# PEAC Protocol Roadmap

## Current Release: v0.10.5

**Wire Format:** `peac-receipt/0.1` (stable)

Key capabilities:

- Receipt issuance and verification (TypeScript + Go)
- Policy Kit for declarative access control
- Dispute bundles for offline verification
- Workflow correlation for multi-agent DAGs
- SSRF-safe networking with DNS pinning
- GitHub Actions npm publish with OIDC Trusted Publishing

## Upcoming

| Theme     | Deliverables                                    |
| --------- | ----------------------------------------------- |
| Transport | WebSocket, streaming receipts                   |
| Security  | External audit, production hardening            |
| Stability | Wire format freeze, cross-implementation parity |

## Version History

See [GitHub Releases](https://github.com/peacprotocol/peac/releases) for detailed release notes.

| Version | Highlights                                           |
| ------- | ---------------------------------------------------- |
| v0.10.x | Wire format normalization, npm publishing, x402 v0.2 |
| v0.9.x  | Core protocol, attestations, Go SDK, Policy Kit      |
