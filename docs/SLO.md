# PEAC Protocol SLO

> **Status:** Operator-facing service-level objectives for the open-source
> reference verifier and the published `@peac/protocol` package. Numbers are
> baseline measurements against a documented machine profile; see
> [Benchmark methodology](BENCHMARK-METHODOLOGY.md). These are SLOs, not
> SLAs. The open-source reference verifier carries no contractual SLA. The
> managed Hosted Verify instance is operated separately under its own
> contract and is not part of this repository.

## Baseline metadata

| Field                      | Value                                                                       |
| -------------------------- | --------------------------------------------------------------------------- |
| `baseline_commit`          | `0c6d2047`                                                                  |
| `baseline_date`            | `2026-05-21`                                                                |
| `baseline_machine_profile` | See [Benchmark methodology](BENCHMARK-METHODOLOGY.md)                       |
| Capture method             | `PEAC_BENCH_JSON=<path> pnpm exec vitest run tests/perf/wire02-slo.test.ts` |

The local protocol operations table below carries captured values for
`issue()` and `verifyLocal()` measured against the `baseline_commit` on
the documented machine profile. The reference verifier and MCP
round-trip tables remain unmeasured this cycle; those rows are outside
the current measured baseline and require dedicated benchmarks.
Real-world performance varies with hardware, network, workload, and
record size.

## Local protocol operations (`@peac/protocol` v0.14.4)

| Operation                               | Median (p50) | p95    | p99    | Notes                                                                   |
| --------------------------------------- | ------------ | ------ | ------ | ----------------------------------------------------------------------- |
| `issue()` (Ed25519, ~1 KB record)       | 0.4 ms       | 0.5 ms | 0.6 ms | Measured on the Wire 0.2 issuance path used by `issue()`; Ed25519 only. |
| `verifyLocal()` (Ed25519, ~1 KB record) | 1.5 ms       | 1.7 ms | 1.9 ms | Local validation; no network.                                           |

The existing SLO gate in [tests/perf/wire02-slo.test.ts](../tests/perf/wire02-slo.test.ts)
asserts `verifyLocal` p95 MUST be ≤ 10 ms. That gate runs in CI on every PR.

## Reference verifier (`apps/api` `/v1/verify`)

| Operation                                                     | Median (p50)            | p95                     | p99                     | Notes                                        |
| ------------------------------------------------------------- | ----------------------- | ----------------------- | ----------------------- | -------------------------------------------- |
| `/v1/verify` (Ed25519, ~1 KB record)                          | Not measured this cycle | Not measured this cycle | Not measured this cycle | Loopback; no JWKS resolution                 |
| `/v1/verify` with JWKS resolution (single issuer, warm cache) | Not measured this cycle | Not measured this cycle | Not measured this cycle | Measured after first request; JWKS cache hot |

> Reference verifier rows are outside the current measured baseline and require dedicated benchmarks against the same machine profile.

## MCP tool-call round-trip with record issuance

| Operation                                                                 | Median (p50)            | p95                     | p99                     | Notes                 |
| ------------------------------------------------------------------------- | ----------------------- | ----------------------- | ----------------------- | --------------------- |
| MCP `tools/call` round-trip emitting `_meta.org.peacprotocol/receipt_jws` | Not measured this cycle | Not measured this cycle | Not measured this cycle | Local stdio transport |

> MCP round-trip row is outside the current measured baseline and requires a dedicated benchmark against the same machine profile.

## Record size classes used in the table

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
  and record size.
- Carrier-specific capture overhead is not measured this cycle. The local
  signing and verification cost for records emitted by those carriers is
  represented by the `issue()` and `verifyLocal()` rows above.

## Regression policy

- `verifyLocal()` p95 is gated by the existing CI benchmark regression
  check in [tests/perf/wire02-slo.test.ts](../tests/perf/wire02-slo.test.ts).
- `issue()` baseline is published here. It is not a blocking regression
  gate until a dedicated gate is added and documented.
- Reference verifier `/v1/verify` baseline is not published in this cycle.
  It enters regression policy only after a measured baseline is captured
  against the documented machine profile.

## Related documents

- [Benchmark methodology](BENCHMARK-METHODOLOGY.md)
- [Stability contract](STABILITY-CONTRACT.md)
- [Threat model](THREAT_MODEL.md)
- [Trust artifacts](TRUST-ARTIFACTS.md)
- [SECURITY.md](../SECURITY.md)
- [Compliance mappings](compliance/README.md)
