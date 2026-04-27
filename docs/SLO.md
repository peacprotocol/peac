# PEAC Protocol SLO

> **Status:** Operator-facing service-level objectives for the open-source
> reference verifier and the published `@peac/protocol` package. Numbers are
> baseline measurements against a documented machine profile; see
> [Benchmark methodology](BENCHMARK-METHODOLOGY.md). These are SLOs, not
> SLAs. The open-source reference verifier carries no contractual SLA. The
> managed Hosted Verify instance is operated separately under its own
> contract and is not part of this repository.

## Baseline metadata

| Field                      | Value                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `baseline_commit`          | `release-prep` (final value stamped on the v0.12.12 release-prep commit)                        |
| `baseline_date`            | `release-prep` (final value stamped on the v0.12.12 release-prep commit)                        |
| `baseline_machine_profile` | See [Benchmark methodology](BENCHMARK-METHODOLOGY.md)                                           |
| Capture method             | `pnpm test --filter @peac/protocol tests/perf/wire02-slo.test.ts` with `PEAC_BENCH_JSON=<path>` |

All rows below carry `baseline_commit: release-prep` until the release-prep
commit replaces the placeholders with captured numbers. The captured numbers
are the measurement against the `baseline_commit` on the documented machine
profile; real-world performance varies with hardware, network, workload, and
receipt size.

## Local protocol operations (`@peac/protocol` v0.12.12)

| Operation                               | Median (p50)   | p95            | p99            | Notes                        |
| --------------------------------------- | -------------- | -------------- | -------------- | ---------------------------- |
| `issue()` (Ed25519, ~1 KB record)       | `release-prep` | `release-prep` | `release-prep` | Loopback; Ed25519 only       |
| `verifyLocal()` (Ed25519, ~1 KB record) | `release-prep` | `release-prep` | `release-prep` | Local validation; no network |

The existing SLO gate in [tests/perf/wire02-slo.test.ts](../tests/perf/wire02-slo.test.ts)
asserts `verifyLocal` p95 MUST be ≤ 10 ms. That gate runs in CI on every PR.

## Reference verifier (`apps/api` `/v1/verify`)

| Operation                                                     | Median (p50)   | p95            | p99            | Notes                                        |
| ------------------------------------------------------------- | -------------- | -------------- | -------------- | -------------------------------------------- |
| `/v1/verify` (Ed25519, ~1 KB record)                          | `release-prep` | `release-prep` | `release-prep` | Loopback; no JWKS resolution                 |
| `/v1/verify` with JWKS resolution (single issuer, warm cache) | `release-prep` | `release-prep` | `release-prep` | Measured after first request; JWKS cache hot |

## MCP tool-call round-trip with record issuance

| Operation                                                                 | Median (p50)   | p95            | p99            | Notes                 |
| ------------------------------------------------------------------------- | -------------- | -------------- | -------------- | --------------------- |
| MCP `tools/call` round-trip emitting `_meta.org.peacprotocol/receipt_jws` | `release-prep` | `release-prep` | `release-prep` | Local stdio transport |

## Receipt size classes used in the table

- Class A: ~1 KB record (typical agent observation; used in the rows above).
- Class B: ~8 KB record (commerce evidence with attached upstream artifact).
- Class C: ~64 KB record (per-extension-group kernel constraint ceiling; see
  [Kernel constraints spec](specs/KERNEL-CONSTRAINTS.md)).

The published numbers reflect Class A unless a row explicitly states otherwise.

## What these SLOs do not promise

- The open-source reference verifier carries no uptime SLA. Self-hosters
  operate the verifier under their own availability commitments.
- Hosted Verify (managed, multi-tenant, SLA) is a separate offering
  operated outside this repository. See
  [Hosted Verify contract](HOSTED_VERIFY_CONTRACT.md).
- Baseline numbers describe loopback measurement on the documented machine
  profile. Production performance varies with hardware, network, workload,
  and receipt size.
- SLO numbers are not available for future execution-surface carriers (CLI
  execution evidence; observational lifecycle records). Those carriers
  enter the SLO document at v0.14.1; see the forward-looking subsection
  below.

## Regression policy

- `verifyLocal()` p95 is gated by the existing CI benchmark regression
  check in [tests/perf/wire02-slo.test.ts](../tests/perf/wire02-slo.test.ts).
- `issue()` baseline is published here and becomes a regression-gate
  candidate alongside the broader mutation-testing baseline work tracked
  for a future release.
- Reference verifier `/v1/verify` baseline is published here. Regression
  gating is scheduled to evolve alongside the existing Go middleware
  benchmark discipline.

## Future execution-surface carriers (pre-doctrine)

This subsection is forward-looking. It documents the expected SLO
commitments for future public carriers that have not yet shipped. These
rules apply when, and only when, the corresponding carriers land.

- CLI execution-evidence carrier: SLO rows publish at v0.14.1 against the
  same machine profile. Until v0.14.1 ships, no CLI execution-evidence
  SLO is claimed.
- Observational lifecycle-record carrier: SLO rows publish at v0.14.1.
  Lifecycle records are observational-only; SLO measures record-emission
  time on the PEAC side, not the upstream producing system.

## Related documents

- [Benchmark methodology](BENCHMARK-METHODOLOGY.md)
- [Stability contract](STABILITY-CONTRACT.md)
- [Threat model](THREAT_MODEL.md)
- [Trust artifacts](TRUST-ARTIFACTS.md)
- [SECURITY.md](../SECURITY.md)
- [Compliance mappings](compliance/README.md)
