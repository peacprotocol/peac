# PEAC Protocol CI Behavior

**Version:** 0.9.15
**Status:** Authoritative

This document describes the Continuous Integration pipeline behavior for the PEAC Protocol monorepo.

---

## Overview

CI runs on GitHub Actions for all pushes to `main` and `feat/*` branches, and for all pull requests targeting `main`.

---

## Jobs

### 1. Security Guards (Blocking)

**Purpose:** Enforce repository-wide security and consistency rules.

| Check | Description | Blocking |
|-------|-------------|----------|
| Forbidden Strings | Prevents secrets, vendor lock-in patterns, and prohibited terms | Yes |
| Surface Validator | Validates well-known surfaces and policy files | Yes |

**Script:** `scripts/ci/forbid-strings.sh`, `scripts/ci/surface-validator.sh`

### 2. Lint (Blocking)

**Purpose:** Enforce code style and quality.

| Check | Description | Blocking |
|-------|-------------|----------|
| ESLint | Code style and quality rules | Yes |

**Commands:**
```bash
pnpm run lint
```

### 3. TypeScript (Advisory)

**Purpose:** Type checking across the monorepo.

| Check | Description | Blocking |
|-------|-------------|----------|
| TypeScript | Type checking via `tsc --noEmit` | No (advisory) |

**Note:** TypeScript errors in `archive/`, `examples/`, `scripts/`, and `tests/` are tracked but do not block merges. Published packages (`packages/*`) must be error-free.

**Commands:**
```bash
pnpm run typecheck
```

### 4. Test (Blocking)

**Purpose:** Run unit and integration tests.

| Check | Description | Blocking |
|-------|-------------|----------|
| Vitest | All test suites | Yes |
| Coverage | Uploaded to Codecov | No (advisory) |

**Commands:**
```bash
pnpm test -- --run
```

### 5. Rail Parity (Critical, Blocking)

**Purpose:** Ensure all payment rails produce structurally identical receipts.

This is a **critical** gate. Rail adapters must produce receipts that:
- Have identical envelope structure
- Differ only in rail-specific `evidence` field
- Pass cross-rail verification

**Commands:**
```bash
pnpm test -- tests/conformance/parity.spec.ts --run
```

### 6. Performance Gate (Advisory)

**Purpose:** Enforce verification latency budget.

| Metric | Threshold | Blocking |
|--------|-----------|----------|
| p95 verify latency | ≤ 10ms | No (advisory) |

**Note:** Performance gate is advisory during 0.9.x development phase to track regressions without blocking development velocity.

**Commands:**
```bash
pnpm test -- tests/performance/verify.bench.ts --run
```

### 7. Negative Test Vectors (Blocking)

**Purpose:** Ensure malformed inputs are correctly rejected.

Tests cover:
- Invalid signatures
- Expired receipts
- Malformed JWS
- Schema violations
- Missing required fields

**Commands:**
```bash
pnpm test -- tests/vectors/negative.spec.ts --run
```

---

## Advisory vs Blocking

| Status | Meaning |
|--------|---------|
| **Blocking** | PR cannot merge if check fails |
| **Advisory** | Failure logged but does not block merge |

Current advisory checks:
- TypeScript (tracking legacy debt in archive/examples/scripts/tests)
- Performance gate (tracking regressions)
- Coverage upload

---

## Local Verification

Run the full CI suite locally before pushing:

```bash
# Install dependencies
pnpm install

# Run all checks
pnpm run lint
pnpm run build
pnpm test:core
pnpm run typecheck:core
```

---

## Performance Metrics

Performance benchmarks output to `perf-metrics.json`:

```json
{
  "p50_ms": 0.5,
  "p95_ms": 1.2,
  "p99_ms": 2.8,
  "mean_ms": 0.6,
  "iterations": 1000
}
```

**Budgets:**
- p95 ≤ 10ms (advisory)
- p99 ≤ 50ms (advisory)

---

## Test Categories

| Category | Location | Purpose |
|----------|----------|---------|
| Unit | `packages/*/tests/` | Package-level unit tests |
| Conformance | `tests/conformance/` | Cross-package behavior tests |
| Performance | `tests/performance/` | Latency and throughput benchmarks |
| Vectors | `tests/vectors/` | Golden and negative test cases |
| E2E | `tests/e2e/` | End-to-end integration tests |

---

## Troubleshooting

### TypeScript Errors

If typecheck fails, first ensure all packages are built:

```bash
pnpm -r build
pnpm run typecheck
```

TypeScript errors in published packages (`packages/*` excluding `archive/`) must be fixed. Errors in `archive/`, `examples/`, `scripts/`, and `tests/` are tracked but advisory.

### Performance Gate Failures

1. Check if benchmark ran with cold cache
2. Verify no expensive operations in hot path
3. Profile with `--inspect` flag
4. Check for regression in recent commits

### Forbidden Strings

The guard script checks for:
- API keys and secrets
- Hardcoded vendor names in core packages
- Prohibited URL patterns
- Debug code that shouldn't be committed

To see what's blocked:
```bash
bash scripts/ci/forbid-strings.sh
```

---

## CI Configuration

**File:** `.github/workflows/ci.yml`

**Node version:** 18 (LTS)
**Package manager:** pnpm (version from `packageManager` field in package.json)

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Package structure and dependencies
- [CODING_STANDARDS_PROTOCOL.md](CODING_STANDARDS_PROTOCOL.md) - Development guidelines
- [specs/TEST_VECTORS.md](specs/TEST_VECTORS.md) - Test vector format
