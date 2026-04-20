# External audit scope

Scope definition for an external security and protocol audit of the PEAC Protocol codebase. This document lists the artifacts an external auditor is expected to review, the artifact-version rules that apply during an audit engagement, and the readiness state of each artifact.

This document is not a statement that an audit is underway or complete. It defines the scope an audit would cover.

## Scope boundary

### In scope

- **Wire format and normative behavior.** `docs/specs/WIRE-0.2.md`, `docs/specs/PROTOCOL-BEHAVIOR.md`, `docs/specs/EVIDENCE-CARRIER-CONTRACT.md`, and the frozen `peac-receipt/0.1` wire identifier quarantine path.
- **Reference verifier.** The `apps/api` implementation, the contract expressed by `packages/schema/openapi/verify.yaml` at OpenAPI 3.1.1, and the security model declared in `docs/specs/VERIFIER-SECURITY-MODEL.md`.
- **Crypto primitives.** `@peac/crypto` (`packages/crypto/`), covering Ed25519 signing and verification, JWS composition, JCS canonicalization per RFC 8785, SHA-256 hashing, and the JOSE hardening rules documented in `docs/specs/WIRE-0.2.md`.
- **Schema enforcement.** `@peac/schema` (`packages/schema/`), covering record shape validation, kernel-constraint enforcement, and type-to-extension mapping.
- **Kernel constants and registries.** `specs/kernel/` and the derived `packages/kernel/` sources; error taxonomy in `docs/specs/ERRORS.md`; the 12 extension groups registry.
- **Threat coverage.** `docs/THREAT_MODEL.md` and per-threat test links; `scripts/verify-trust-artifacts.mjs` integrity check.
- **Stability contract.** `docs/STABILITY-CONTRACT.md` classifications against actual public surfaces.
- **SLOs and benchmark methodology.** `docs/SLO.md` and `docs/BENCHMARK-METHODOLOGY.md`; the stable Go benchmark subset at `sdks/go/bench/`.
- **Operational controls.** `docs/SECURITY-OPERATIONS.md`, `docs/KEY-CUSTODY-AND-TENANCY.md`, `SECURITY.md`.
- **Conformance artifacts.** Every fixture under `specs/conformance/` including the extended JCS parity corpus at `specs/conformance/parity-corpus/jcs-extended/`.
- **Compatibility matrices.** `docs/COMPATIBILITY_MATRIX.md` and `docs/compatibility/*`.
- **Supply-chain provenance.** OIDC-based npm Trusted Publishing in `.github/workflows/publish.yml`; SLSA v1.2 / in-toto v1.0 attestations referenced in `SECURITY.md`.
- **Release-state integrity.** Post-release truth reconciliation via `scripts/verify-release-closeout.mjs`; two-stage Mode 2 release automation in `.github/workflows/publish.yml` and `.github/workflows/promote-latest.yml`.

### Out of scope

- **Hosted services.** The managed Hosted Verify instance operated separately from this repository is out of scope; it is reviewed under its own audit.
- **Third-party issuer or verifier implementations.** External parties that adopt PEAC ship independent audits of their own integrations.
- **Adjacent protocols.** The x402, A2A, ACP, MPP, UCP, and ERC-8004 upstream specifications are not in scope; only PEAC's mappings into them (`packages/mappings/*`, `packages/adapters/*`) are.
- **Runtime governance, policy engines, trust-score systems, payment rails, identity providers, and orchestration layers.** See `docs/WHAT-PEAC-STANDARDIZES.md` for the boundary.

## Artifact readiness

The table below lists the state of each in-scope artifact. `GREEN` means the artifact is at the right version and is ready for external review. `YELLOW` means the artifact exists but requires a minor refresh or extension before an external engagement begins. `RED` means the artifact is absent or materially incomplete.

| Artifact                                                                    | State  |
| --------------------------------------------------------------------------- | ------ |
| `docs/specs/WIRE-0.2.md`                                                    | GREEN  |
| `docs/specs/PROTOCOL-BEHAVIOR.md`                                           | GREEN  |
| `docs/specs/EVIDENCE-CARRIER-CONTRACT.md`                                   | GREEN  |
| `packages/schema/openapi/verify.yaml` (OpenAPI 3.1.1)                       | GREEN  |
| `docs/specs/VERIFIER-SECURITY-MODEL.md`                                     | GREEN  |
| `apps/api/` reference verifier                                              | GREEN  |
| `packages/crypto/` Ed25519 / JCS / SHA-256 / JWS                            | GREEN  |
| `packages/schema/` kernel-constraint enforcement                            | GREEN  |
| `specs/kernel/` constants and registries                                    | GREEN  |
| `docs/specs/ERRORS.md` error taxonomy                                       | GREEN  |
| `docs/THREAT_MODEL.md` with per-threat test links                           | GREEN  |
| `docs/STABILITY-CONTRACT.md` classifications                                | GREEN  |
| `docs/SLO.md` with baseline stamps                                          | GREEN  |
| `docs/BENCHMARK-METHODOLOGY.md`                                             | GREEN  |
| `sdks/go/bench/` stable subset + committed baseline scaffold                | YELLOW |
| `docs/SECURITY-OPERATIONS.md`                                               | GREEN  |
| `docs/KEY-CUSTODY-AND-TENANCY.md`                                           | GREEN  |
| `SECURITY.md` disclosure / supply-chain / supported-versions policy         | GREEN  |
| `specs/conformance/` fixtures including `parity-corpus/jcs-extended/`       | GREEN  |
| `docs/COMPATIBILITY_MATRIX.md` and `docs/compatibility/*`                   | GREEN  |
| Supply-chain provenance: OIDC Trusted Publishing + SLSA v1.2 + in-toto v1.0 | GREEN  |
| `scripts/verify-release-closeout.mjs` post-release truth reconciler         | GREEN  |

`sdks/go/bench/` is marked YELLOW because the committed `baseline.json` ships with `baseline_pending: true`; the maintainer-only `bench-gate` workflow with `mode=update-baseline` flips it to `false` after a fresh CI capture. Before an external audit kickoff, the baseline MUST be captured on the declared machine profile and `baseline_pending` MUST be `false`.

## Artifact-version rules during an audit

These rules apply from the audit kickoff date through the audit report delivery. They exist so the auditor works against a stable target without blocking normal development on unrelated surfaces.

- **Frozen artifacts** (no changes during the engagement without auditor notification):
  - `packages/schema/openapi/verify.yaml` (OpenAPI 3.1.1 contract).
  - `specs/kernel/constants.json`, `specs/kernel/errors.json`, `specs/kernel/registries.json`.
  - `docs/specs/WIRE-0.2.md`, `docs/specs/PROTOCOL-BEHAVIOR.md`, `docs/specs/EVIDENCE-CARRIER-CONTRACT.md`, `docs/specs/VERIFIER-SECURITY-MODEL.md`.
  - `sdks/go/bench/baseline.json` (only baseline-refresh workflow may edit).
- **Refreshable artifacts** (changes allowed if the auditor is informed and the change is recorded in the engagement log):
  - `docs/THREAT_MODEL.md`, `docs/STABILITY-CONTRACT.md`, `docs/SLO.md`.
  - `docs/compatibility/*`.
  - `SECURITY.md` and `docs/SECURITY-OPERATIONS.md`.
- **Free-moving surfaces** (changes do not require auditor notification):
  - Layer 4 adapter packages under `packages/adapters/` and `packages/mappings/` unless directly in scope for a specific finding.
  - Documentation under `docs/SOLUTIONS/`, `docs/HOW-IT-WORKS.md`, `docs/START_HERE.md`, and `docs/WHERE-IT-FITS.md`.
  - Examples under `examples/` and integrator kits under `integrator-kits/`.

## What a finding's remediation looks like

An audit finding is remediated by:

1. A tracked PR in this repository that addresses the concrete defect or documentation gap.
2. A test under `specs/conformance/` or `packages/*/tests/` (or the equivalent Go test under `sdks/go/`) that fails before the fix and passes after.
3. A threat-model row update in `docs/THREAT_MODEL.md` when the finding adds or refines a threat or mitigation.
4. A CHANGELOG entry describing the public-facing change.

## Engagement contact

Security contact and disclosure timeline are documented in [`SECURITY.md`](../SECURITY.md). Prospective auditors should start there.

## Related documents

- [Trust artifacts](TRUST-ARTIFACTS.md)
- [Threat model](THREAT_MODEL.md)
- [Stability contract](STABILITY-CONTRACT.md)
- [Security operations](SECURITY-OPERATIONS.md)
- [Compliance mappings](compliance/README.md)
- [SECURITY.md](../SECURITY.md)
