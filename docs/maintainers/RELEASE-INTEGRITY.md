# Release Integrity Stack

> Canonical reference for PEAC release security practices.
> Updated: 2026-03-06 | Applies to: v0.12.0+

## Overview

PEAC follows a defense-in-depth release integrity model. Every published package
must be traceable from source commit to npm registry artifact, with no long-lived
tokens in the publish path.

## Supply Chain

### OIDC Trusted Publishing (npm)

Publishable packages listed in `scripts/publish-manifest.json` use npm OIDC
trusted publishing via GitHub Actions. No long-lived npm publish tokens exist
in the CI/CD pipeline. Additional packages pending OIDC setup are tracked in
the manifest's `pendingTrustedPublishing` array.

**Setup:** `npm trust` CLI for scripted, auditable OIDC configuration
(not manual web UI per package). See `scripts/setup-trusted-publishing.sh`.

**References:**

- [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/)
- npm positions OIDC as the replacement for long-lived publish tokens

### GitHub Artifact Attestations

Every release publish generates GitHub artifact attestations (Sigstore-based).
Consumers can verify package provenance offline:

```bash
gh attestation verify <artifact> --owner peacprotocol
```

### Dependency Review

`.github/workflows/dependency-review.yml` blocks PRs that introduce dependencies
with known critical-severity vulnerabilities. Denies GPL-3.0 and AGPL-3.0 licenses.
Uses GitHub's `dependency-review-action`.

### Code Scanning

`.github/workflows/codeql.yml` runs GitHub CodeQL with `security-extended` queries
on every push to `main`/`release/*`, on PRs to `main`, and weekly. Covers
JavaScript and TypeScript.

### SBOM Generation

Every release includes a CycloneDX SBOM generated during the publish workflow.
The SBOM is attached to the GitHub release as a downloadable asset.

### Package Verification

Consumers verify published packages via 5 methods documented in
`docs/VERIFY-RELEASE.md`:

1. **Checksums:** SHA-256 of each tarball
2. **SBOM:** CycloneDX bill of materials
3. **npm Provenance:** `npm audit signatures`
4. **GitHub Attestations:** `gh attestation verify`
5. **Gate Report:** committed `docs/releases/<version>-gate-report.json`

### Maintainer Security

- npm org enforces 2FA for all maintainers
- No shared credentials; individual accounts only
- OIDC eliminates the need for npm automation tokens

## CI Matrix

| Node Version              | Role                               | Blocking? |
| ------------------------- | ---------------------------------- | --------- |
| Node 24 (Active LTS)      | Primary gate, canonical benchmarks | Yes       |
| Node 22 (Maintenance LTS) | Compat smoke, informational perf   | No        |

See DD-161 for rationale.

## Gate Architecture

Release decisions are made by `scripts/release/run-gates.sh --write-release-artifacts`.

The `--write-release-artifacts` flag is the **authoritative** gate path. Without it,
the script is a dry-run that never claims "ready to tag." The committed gate report
JSON is the machine-verifiable release evidence.

### Gate Categories

| Category            | Gates                                                                                            | Scope       |
| ------------------- | ------------------------------------------------------------------------------------------------ | ----------- |
| Build & Lint        | build, lint, typecheck, test                                                                     | All targets |
| Guards              | guard, planning-leak, format                                                                     | All targets |
| Architecture        | layer-boundary                                                                                   | All targets |
| Coherence           | version-coherence, codegen-fresh, release-state-coherence                                        | All targets |
| Security            | no-network, wire-01-frozen                                                                       | All targets |
| Conformance         | wire-02-conformance                                                                              | All targets |
| CHANGELOG           | changelog-coverage                                                                               | All targets |
| DD-90 (stable only) | adoption-evidence, perf-benchmarks, fuzz-suite, ssrf-suite, api-surface-lock, pack-install-smoke | Stable only |

### Adoption Evidence

The `adoption-evidence` gate validates `docs/adoption/integration-evidence.json` against schema, checks immutable pointers (test files, spec refs, commit SHAs), and requires >= 2 DD-90 ecosystem integrations. Maintainer reference validations are in `docs/maintainers/reference-integrations.md`. External confirmations in `docs/adoption/confirmations.md` are validated for format when present.
