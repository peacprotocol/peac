# Trust artifacts

The single index over PEAC's trust artifacts. Each artifact below has one
canonical home; this page points at all of them and normalizes the
reference-verifier versus Hosted Verify distinction once so the rest of
the documentation can link here.

## Engineering trust

- [SLO](SLO.md): operator-facing service-level objectives with
  versioned baseline stamps.
- [Benchmark methodology](BENCHMARK-METHODOLOGY.md): machine profile,
  fixture set, measurement protocol, and reproduction commands.
- [Stability contract](STABILITY-CONTRACT.md): every public surface
  classified `stable`, `experimental`, `deprecated`, `archived`, or `internal-only`.
- [Threat model](THREAT_MODEL.md): consolidated threat catalog with
  per-threat test-coverage links.

## Disclosure and supply chain

- [SECURITY.md](../SECURITY.md): coordinated disclosure contact,
  supported versions, supply-chain controls, external review cadence.
- [Security operations](SECURITY-OPERATIONS.md): support windows, runtime
  support, incident handling SLAs, supply-chain provenance, logging
  boundaries, tenant isolation, data residency.
- [Key custody and tenancy](KEY-CUSTODY-AND-TENANCY.md): key
  custody, tenancy, procurement, stewardship.

## Architecture and deep detail

- [Architecture](ARCHITECTURE.md): package layering and dependency
  direction.
- [Reference architectures](REFERENCE_ARCHITECTURES.md): topology and
  integration-flow patterns.
- [Security considerations spec](specs/SECURITY-CONSIDERATIONS.md):
  signing model, JOSE hardening, SSRF prevention, key lifecycle.
- [Verifier security model spec](specs/VERIFIER-SECURITY-MODEL.md):
  verification modes, size limits, error categories.
- [HTTP transport security](security/HTTP-TRANSPORT-SECURITY.md): MCP
  server deployment checklist.
- [OWASP ASI mapping](security/OWASP-ASI-MAPPING.md).

## Reference verifier versus Hosted Verify

PEAC ships two distinct verification surfaces. The stability contract,
SLO, threat model, and security operations apply to the **reference
verifier** unless a row is explicitly scoped to Hosted Verify.

| Aspect             | Reference verifier                                                              | Hosted Verify                                       |
| ------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| Location           | [`apps/api`](../apps/api) in this repository                                    | Operated separately; not part of this repository    |
| Hosting model      | Self-hostable, tenantless                                                       | Managed, multi-tenant                               |
| Deployment recipes | [`surfaces/reference-verifier/`](../surfaces/reference-verifier/)               | Not published here                                  |
| SLA                | None (operator-managed availability)                                            | Per-contract                                        |
| Contract           | [`packages/schema/openapi/verify.yaml`](../packages/schema/openapi/verify.yaml) | [Hosted Verify contract](HOSTED_VERIFY_CONTRACT.md) |
| Threat model       | [`docs/THREAT_MODEL.md`](THREAT_MODEL.md)                                       | Operated under its own threat model                 |
| SLO scope          | [`docs/SLO.md`](SLO.md)                                                         | Published by the Hosted Verify operator             |

## Machine-readable and conformance artifacts

- [Public API contracts](../contracts/api/) for `@peac/crypto`,
  `@peac/kernel`, `@peac/protocol`, `@peac/schema`.
- [Reference-verifier OpenAPI](../packages/schema/openapi/verify.yaml).
- [Conformance fixtures](../specs/conformance/).
- [Registries spec](specs/REGISTRIES.md) +
  [`specs/kernel/registries.json`](../specs/kernel/registries.json).
- [Error taxonomy](specs/ERRORS.md) +
  [`specs/kernel/errors.json`](../specs/kernel/errors.json).
- [Benchmark SLO spec](../specs/benchmarks/slo.json) and
  [baseline](../specs/benchmarks/baseline.json).
- [Repo surface status](../REPO_SURFACE_STATUS.json) →
  [Surface status view](SURFACE_STATUS.md).
- [Package status](PACKAGE_STATUS.md).

## Compatibility

- [Compatibility matrix](COMPATIBILITY_MATRIX.md): runtime,
  wire-format, and deprecation compatibility.
- [Deprecation policy](DEPRECATION_POLICY.md): support windows and
  archive protocol.
- [Compatibility docs by protocol](compatibility/): commerce,
  runtime, A2A, MCP, Copilot, Go middleware.

## Compliance mappings

- [ISO/IEC 42001:2023 Clause 8 mapping](compliance/ISO-42001-MAPPING.md):
  operational planning and control objectives mapped to supporting PEAC
  artifacts.
- [EU AI Act Annex IV mapping](compliance/EU-AI-ACT-ANNEX-IV-MAPPING.md):
  technical-documentation points 1(a) through 5 mapped to supporting
  PEAC artifacts. Applicability context: Regulation (EU) 2024/1689
  applies from 2 August 2026, with exceptions under Article 113.
- [Compliance index](compliance/README.md): framing, non-claim statement,
  companion framework guides.

## Privacy-aware verification (deployment guidance)

Operator-facing privacy guidance for PEAC deployments. Complements
the normative receipt-side
[privacy profile](specs/PRIVACY-PROFILE.md). Each document leads with
a boundary-first block (what PEAC does / what PEAC does not do / what
deployers still own).

- [Data classification](privacy/DATA-CLASSIFICATION.md): which PEAC
  surfaces likely hold personal data, pseudonymous data, or
  operator-controlled content.
- [Retention and deletion](privacy/RETENTION-AND-DELETION.md):
  retention classes, the evidence-vs-derived deletion model, and
  linked-index purge.
- [Deployment roles](privacy/DEPLOYMENT-ROLES.md): controller /
  processor posture for each of the four common deployment shapes.
- [Data-subject rights](privacy/DATA-SUBJECT-RIGHTS.md): access,
  rectification, erasure, restriction, objection, portability,
  automated-decision-making; AIPREF is not consent.
- [DPIA starter](privacy/DPIA-STARTER.md): risk-tier starter and
  PEAC-specific mitigation levers.
- [Privacy directory index](privacy/README.md): boundary-first
  discipline plus preferred / avoided public wording.

PEAC supports privacy-aware verification and GDPR-aligned
deployments. PEAC does not replace operator legal review, lawful-basis
decisions, or controller obligations.

## Carrier surfaces

Execution-surface carriers shipped in v0.14.1 and provisioning lifecycle
carriers shipped in v0.14.2 are classified `stable` in
[Stability contract](STABILITY-CONTRACT.md) and have CLI surfaces under
`@peac/cli` (`peac observe command`, `peac record command`, `peac emit lifecycle`).
The earlier forward-looking security controls described for these
carriers are now superseded by their shipped specs:

- [`docs/specs/CLI-CARRIER-PROFILE.md`](specs/CLI-CARRIER-PROFILE.md)
- [`docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md`](specs/LIFECYCLE-OBSERVATION-PROFILE.md)
- [`docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md`](specs/PROVISIONING-LIFECYCLE-PROFILE.md)
