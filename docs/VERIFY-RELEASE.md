# Verifying a PEAC Release

This document describes independent methods for verifying the integrity and provenance of a PEAC Protocol release. Each method addresses a different layer of the supply chain.

## 1. Gate Report (Authoritative Evidence)

Each release includes a machine-generated gate report that records every quality gate result. For stable releases, this includes all DD-90 gates.

```bash
# Generate the authoritative gate report (writes JSON artifact)
bash scripts/release/run-gates.sh --target stable --write-release-artifacts

# Dry-run only (no artifacts, no release claim)
bash scripts/release/run-gates.sh --target stable
```

The `--write-release-artifacts` flag is the authoritative gate path. Without it, the script is a local dry-run that never claims "ready to tag." The JSON artifact at `docs/releases/<version>-gate-report.json` includes: timestamp, commit SHA, Node version, runner metadata, publish-manifest hash, conformance-fixtures hash, and individual gate pass/fail status with duration.

## 2. npm Provenance

PEAC packages published via GitHub Actions OIDC include npm provenance attestations. This cryptographically links each package version to the specific workflow run that produced it.

**Current state (v0.12.0-preview.2):** All 28 publishable packages are configured for OIDC trusted publishing (PR #490). Two packages (`@peac/net-node`, `@peac/adapter-eat`) are deferred because they are not yet published to npm. All packages published through the CI workflow receive `--provenance` attestations.

```bash
# Verify provenance for published packages
# Use a temp project to avoid workspace interference:
mkdir /tmp/peac-verify && cd /tmp/peac-verify
npm init -y
npm install @peac/protocol@next
npm audit signatures
cd - && rm -rf /tmp/peac-verify
```

The provenance attestation confirms:

- The package was built from the declared source repository
- The build ran in a GitHub Actions environment
- No human had direct access to the npm publish token

**Note:** `npm audit signatures` must be run in a project that has installed the packages. Running it with a bare package name does not work.

## 3. Conformance Matrix

The conformance matrix traces every normative requirement (BCP 14 statements) to test coverage.

```bash
# Verify conformance tooling
node scripts/conformance/validate-schemas.mjs
node scripts/conformance/verify-registry-drift.mjs
node scripts/conformance/generate-inventory.mjs --check
```

Artifacts:

- `specs/conformance/requirement-ids.json`: machine-readable requirement registry (146 IDs)
- `docs/specs/CONFORMANCE-MATRIX.md`: generated coverage matrix
- `specs/conformance/fixtures/inventory.json`: fixture inventory with requirement mappings

## 4. API Surface Snapshots

Public API exports are snapshot-locked. Any unreviewed change to the public API surface causes the gate to fail.

```bash
# Verify API surface matches committed snapshots
bash scripts/release/api-surface-lock.sh
```

Snapshots are stored in `scripts/release/api-snapshots/` and cover the primary packages (`kernel`, `schema`, `crypto`, `protocol`, `control`, `mcp-server`, `middleware-core`, `middleware-express`, `sdk-js`).

## 5. Pack-Install Smoke

Representative packages are packed into tarballs, installed in isolated temp directories, and verified for ESM import, CJS require, TypeScript types resolution, and CLI bin execution.

```bash
# Run the pack-install smoke test
bash scripts/release/pack-install-smoke.sh
```

This catches packaging errors that unit tests cannot detect: missing files in the `files` array, broken exports maps, missing bin entries, and CJS/ESM resolution failures.

## 6. Attestations and SBOM (Pending)

The following verification methods are planned but not yet implemented:

- **Sigstore attestations:** Per-package Sigstore attestation bundles (pending PR 6a: OIDC migration)
- **SBOM generation:** CycloneDX or SPDX SBOM for each published package (pending tooling evaluation)
- **Checksum manifest:** SHA-256 checksums for all published tarballs (pending release automation)

These will be added as part of the publisher-trust work tracked in the stable release plan.

## Verification Checklist

For a stable release, all of these should pass:

```bash
# Full authoritative gate suite
bash scripts/release/run-gates.sh --target stable --write-release-artifacts

# Individual checks
bash scripts/release/api-surface-lock.sh
bash scripts/release/pack-install-smoke.sh
node scripts/conformance/verify-registry-drift.mjs
node scripts/conformance/generate-inventory.mjs --check
```
