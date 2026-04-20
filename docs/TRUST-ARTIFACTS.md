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
  classified `stable`, `experimental`, `deprecated`, or `internal-only`.
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

## Forward-looking

- Execution-surface carriers (CLI execution evidence; observational
  lifecycle records) are scheduled for v0.14.1; their pre-doctrine
  security controls are declared in the
  [Threat model forward-looking subsection](THREAT_MODEL.md#future-carrier-surfaces-pre-doctrine)
  and [Stability contract forthcoming subsection](STABILITY-CONTRACT.md#forthcoming-surfaces-pre-doctrine).
