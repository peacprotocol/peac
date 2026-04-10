# Security Posture

> Version: 0.12.7 | Status: Current

This document describes the operational security posture of the PEAC Protocol: support windows, incident handling, supply chain provenance, logging boundaries, tenant isolation, and data residency.

For cryptographic design, JOSE hardening, and SSRF prevention, see [Security Considerations](specs/SECURITY-CONSIDERATIONS.md). For vulnerability reporting, see [SECURITY.md](../.github/SECURITY.md).

## Support Windows

| Surface state           | Fix policy                               | Minimum window                                   |
| ----------------------- | ---------------------------------------- | ------------------------------------------------ |
| `default` / `supported` | Security, correctness, and feature fixes | Current release train                            |
| `compat-only`           | Security and correctness fixes only      | Until next major or deprecation notice           |
| `deprecated`            | Security fixes only                      | 2 minor releases or 60 days, whichever is longer |
| `archived`              | No fixes                                 | May be removed in any future minor               |

The current deprecation schedule is in [Deprecation Policy](DEPRECATION_POLICY.md). The version support matrix is in [Compatibility Matrix](COMPATIBILITY_MATRIX.md).

### Runtime support commitment

| Runtime                      | Status        | Policy                                                          |
| ---------------------------- | ------------- | --------------------------------------------------------------- |
| Node.js 24 (Active LTS)      | Required      | Primary CI and development target                               |
| Node.js 22 (Maintenance LTS) | Compatibility | `engines.node >= 22.0.0` floor; security fixes backported       |
| Node.js 25+                  | Advisory      | Forward-compat CI lane; no support guarantee                    |
| Go                           | Supported     | Wire 0.2 core (issue and local verify); middleware experimental |
| Python                       | Not started   | API-first via the reference verifier HTTP API                   |

## Incident Disclosure

Vulnerability reports follow the process defined in [SECURITY.md](../.github/SECURITY.md):

| Step                                | SLA                                   |
| ----------------------------------- | ------------------------------------- |
| Report to security@peacprotocol.org | Anytime                               |
| Acknowledgment                      | 48 hours                              |
| Investigation and triage            | 7 days                                |
| Fix and coordinated disclosure      | Per severity; critical within 30 days |

PEAC does not currently operate a bug bounty program.

## Supply Chain Provenance

### npm package provenance

All published packages use npm provenance attestation (`publishConfig.provenance: true`) via GitHub Actions OIDC trusted publishing. Consumers can verify:

```bash
npm audit signatures @peac/protocol
```

### OIDC trusted publishing

All published packages are configured for OIDC trusted publishing through the `peacprotocol/peac` repository's `publish.yml` workflow. The publish manifest (`scripts/publish-manifest.json`) tracks the authoritative package list and OIDC configuration status.

### CI security tooling

| Tool                  | Scope                                                | Policy                                                   |
| --------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| CodeQL                | `javascript-typescript`, `security-extended` queries | Runs on push to main, PRs, and weekly                    |
| Dependency review     | PR-time vulnerability check                          | Blocks `critical` severity; denies `GPL-3.0`, `AGPL-3.0` |
| Dependency audit      | `pnpm audit` via `audit-gate.mjs`                    | Blocks `HIGH` and `CRITICAL` production deps             |
| Trojan Source scanner | All `.ts`, `.md`, `.json`, `.yaml` files             | Fail-closed; runs in `guard.sh`                          |
| GitHub Actions        | SHA-pinned action versions                           | Enforced by CI review                                    |

### SBOM

SBOM generation (SPDX or CycloneDX) is planned but not yet configured. The turbo build pipeline includes an `sbom` task definition for future use.

## Logging Boundaries

### Default logging policy

| Data                                        | Logged by default   | Opt-in                             |
| ------------------------------------------- | ------------------- | ---------------------------------- |
| `receipt_ref` (SHA-256 of compact JWS)      | Yes                 | N/A                                |
| Full JWS content                            | No                  | Never logged by protocol libraries |
| DID identifiers                             | No                  | Opt-in per deployment              |
| URL/URI fields                              | No                  | Opt-in per deployment              |
| Extension values (commerce, identity, etc.) | No                  | Opt-in per deployment              |
| IP addresses                                | Transport-dependent | Reverse proxy controls             |

### Sensitive value handling

`@peac/protocol` and `@peac/mcp-server` follow hash-first principles: inference content is represented as SHA-256 digests, not raw text. Identity-bearing fields (`iss`, `actor`, DID URIs) are opaque strings that operators control.

## Tenant Isolation

### Self-hosted

No multi-tenant surface. All operations are in-process. Operators control all isolation boundaries.

### Hosted Verify (planned, v0.12.8)

| Boundary             | Mechanism                                        |
| -------------------- | ------------------------------------------------ |
| Verification context | Per-API-key isolated; no shared mutable state    |
| JWKS cache           | Per-tenant with TTL-bound expiry (5 min default) |
| Rate limits          | Per-tenant; configurable; default 100 req/min    |
| Logs                 | Tenant-scoped; `receipt_ref` only by default     |
| Audit trail          | Per-tenant; exportable                           |

See [Hosted Verify Contract](HOSTED_VERIFY_CONTRACT.md) for the full isolation design and threat mitigations.

## Data Residency

PEAC Protocol is a client-side library and does not transmit data to external services during signing or local verification. Network I/O occurs only during JWKS resolution (fetching issuer public keys) and only when using hosted or network-enabled verification modes.

The reference verifier HTTP API is self-hostable. Organizations with strict data residency requirements should run `verifyLocal()` or the self-hosted reference verifier with caller-provided public keys; both paths require no external network I/O.

## Deprecation Commitment

Deprecated surfaces remain available for at least 2 minor releases or 60 days (whichever is longer). HTTP deprecation signals follow RFC 8594 (Sunset header) and RFC 8288 (Link relation). All status transitions are documented in release notes and tracked in `REPO_SURFACE_STATUS.json`.

See [Deprecation Policy](DEPRECATION_POLICY.md) for the full lifecycle.

## Related Documents

- [SECURITY.md](../.github/SECURITY.md): Vulnerability reporting, dependency audit policy
- [Security Considerations](specs/SECURITY-CONSIDERATIONS.md): Signing model, JOSE hardening, SSRF prevention, key lifecycle
- [Verifier Security Model](specs/VERIFIER-SECURITY-MODEL.md): Verification modes, security limits, error codes
- [HTTP Transport Security](security/HTTP-TRANSPORT-SECURITY.md): MCP server deployment checklist
- [Enterprise Trust Posture](ENTERPRISE_TRUST_POSTURE.md): Key custody, tenancy, procurement
- [Hosted Verify Contract](HOSTED_VERIFY_CONTRACT.md): API design, threat mitigations, privacy defaults
