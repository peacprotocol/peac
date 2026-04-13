# Benchmark SLO

> Since: v0.12.10 | Status: Informational

Performance targets for core PEAC operations. These targets are informational
and regression-oriented; they are not wire-normative and not absolute
shared-runner latency guarantees.

## Targets

| Operation       | p95 Target (CI) | p95 Target (Production) | Iterations | Warmup |
| --------------- | --------------- | ----------------------- | ---------- | ------ |
| `verifyLocal()` | 15 ms           | 10 ms                   | 300        | 50     |
| `issue()`       | 10 ms           | 5 ms                    | 300        | 50     |

## Measurement methodology

- **Iterations:** 300 timed runs after 50 warmup runs
- **Hardware baseline:** GitHub Actions shared runners (CI); operator hardware varies (production)
- **Node.js:** 24 (canonical), 22 (compatibility floor)
- **Timing:** `performance.now()` high-resolution timer
- **Percentiles:** sorted ascending, index-based (p95 = timings[floor(0.95 * n)])

## Regression model

CI gates use regression detection, not absolute thresholds. This avoids
flaky failures on shared runners where latency varies by hardware.

- **Baseline:** checked-in `specs/benchmarks/baseline.json` from a known-good run
- **Regression threshold:** p95 must not exceed 2x the baseline p95
- **Absolute warning:** if p95 exceeds the CI target, a warning is emitted but the gate does not fail
- **Gate failure:** only on regression (p95 > 2x baseline)

Absolute latency gates on dedicated runners are planned for a future release.

## Adapter overhead budget

Adapter-layer operations (normalization, extension building, mapper dispatch)
should add less than 5 ms per call on top of the base `issue()` cost. This
is an informational target, not a gated invariant.

## Non-goals

- These targets are not wire-level guarantees
- Production targets depend on operator hardware and deployment
- Adapter overhead is informational, not enforced
- Real-time latency SLAs require dedicated infrastructure beyond PEAC's scope
