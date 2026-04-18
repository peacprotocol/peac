# Benchmark methodology

This document describes how the numbers published in [SLO.md](SLO.md) are
produced, what they measure, and how to reproduce them. It is the reference
companion to the in-repo benchmark infrastructure.

## Scope

- `@peac/crypto` primitives (Ed25519 sign / verify, JCS, hashing).
- `@peac/schema` validation and byte-budget checks.
- `@peac/protocol` `issue()` and `verifyLocal()`.
- `apps/api` `/v1/verify` round-trip (loopback; with and without JWKS
  resolution).
- `@peac/mcp-server` `tools/call` round-trip emitting a PEAC receipt.

Out of scope: Hosted Verify performance (operated separately) and any future
execution-surface carrier (tracked for v0.14.1).

## Machine profile (baseline capture target)

Baseline captures run on the PEAC reference machine profile. Production
performance varies with hardware, network, workload, and receipt size.

| Field      | Value                                                          |
| ---------- | -------------------------------------------------------------- |
| CPU        | Documented at capture time in `reference/bench/<package>.json` |
| Memory     | Documented at capture time                                     |
| OS         | Documented at capture time (macOS or Linux)                    |
| Node.js    | v24.14.1 (current Active LTS; canonical per `.node-version`)   |
| pnpm       | Pinned via `packageManager` in root `package.json`             |
| Filesystem | Local APFS or ext4; loopback HTTP for `/v1/verify` runs        |

`PEAC_BENCH_JSON=<path>` emits a structured record including `platform` and
`node_version` alongside per-operation metrics.

## Fixture set

- Class A: ~1 KB Wire 0.2 record (typical agent observation).
- Class B: ~8 KB record (commerce evidence with attached upstream artifact).
- Class C: ~64 KB record (per-extension-group kernel constraint ceiling per
  [Kernel constraints spec](specs/KERNEL-CONSTRAINTS.md)).

Unless a result row states otherwise, published numbers reflect Class A.

## Measurement protocol

| Phase       | Iterations (default) | Notes                                     |
| ----------- | -------------------- | ----------------------------------------- |
| Warmup      | 50                   | Discarded; amortizes JIT and cache warmup |
| Measured    | 300                  | Retained; feeds percentile aggregation    |
| Aggregation | n/a                  | p50 (median), p95, p99, min, max, mean    |

Target thresholds and iteration counts are codified in
[`specs/benchmarks/slo.json`](../specs/benchmarks/slo.json) (machine-readable
SLO spec). The in-repo regression gate
[`scripts/benchmarks/verify-slo.mjs`](../scripts/benchmarks/verify-slo.mjs)
compares captured results against
[`specs/benchmarks/baseline.json`](../specs/benchmarks/baseline.json) and
fails when `p95 > max_ratio * baseline` (default `max_ratio = 2.0`).

## Reproduction

```bash
# Clone at the baseline commit stamped in docs/SLO.md.
git fetch --tags origin
git checkout v0.12.12
pnpm install --frozen-lockfile
pnpm build

# vitest bench across crypto / schema / protocol packages;
# outputs JSON into reference/bench/<package>.json.
node scripts/bench-capture.mjs

# Wire 0.2 SLO gate (verifyLocal p95 <= 10 ms; issue() soft target):
pnpm --filter @peac/protocol exec vitest run tests/perf/wire02-slo.test.ts
# Optional: emit structured metrics.
PEAC_BENCH_JSON=/tmp/wire02-slo.json \
  pnpm --filter @peac/protocol exec vitest run tests/perf/wire02-slo.test.ts

# Repeated-run aggregation (default N=5) across the Wire 0.2 gate:
bash scripts/bench-repeated.sh --runs 5 --output tests/perf/repeated-results.json

# Regression gate (exits 1 if p95 exceeds 2x baseline):
node scripts/benchmarks/verify-slo.mjs
```

To reproduce the reference verifier `/v1/verify` row, start the loopback
server (see [Reference verifier recipes](../surfaces/reference-verifier/)) and
replay a fixture using the fetch-based client of your choice; record `p50`,
`p95`, and `p99` on a clean run after one warmup request.

## Output artifacts

| Artifact                           | Source                                                 | Purpose                                           |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `reference/bench/<package>.json`   | `scripts/bench-capture.mjs`                            | Per-package vitest bench JSON                     |
| `tests/perf/wire02-slo.json`       | `tests/perf/wire02-slo.test.ts` (with env var)         | Wire 0.2 SLO run metrics                          |
| `tests/perf/repeated-results.json` | `scripts/bench-repeated.sh`                            | Cross-run p95 aggregation                         |
| `specs/benchmarks/baseline.json`   | Human-maintained; refreshed on intended baseline drift | Regression-gate reference                         |
| `specs/benchmarks/slo.json`        | Human-maintained                                       | Machine-readable SLO targets and iteration counts |

## Regression gate (CI)

`scripts/benchmarks/verify-slo.mjs` runs as part of the performance lane in
CI. It fails the build when any captured p95 exceeds `max_ratio *
baseline.p95`. Absolute CI-target breaches warn but do not fail, because CI
runners are shared; the repeated-run aggregation in
`scripts/bench-repeated.sh` is the primary guard against shared-runner
noise.

## Limitations

- Loopback measurement does not capture wide-area latency; the published
  reference-verifier numbers are loopback by design.
- JWKS-resolution numbers assume a warm cache. Cold-cache numbers depend on
  upstream issuer latency and are not published here.
- Go parity numbers are tracked separately in
  [`sdks/go`](../sdks/go) with its own benchmark suite; cross-language parity
  fixtures live under
  [`specs/conformance/fixtures/go-interaction-record/`](../specs/conformance/fixtures/go-interaction-record/).

## Related documents

- [SLO.md](SLO.md)
- [Stability contract](STABILITY-CONTRACT.md)
- [Threat model](THREAT_MODEL.md)
- [Trust artifacts](TRUST-ARTIFACTS.md)
