# PEAC Protocol CI Behavior

**Version:** 0.12.6
**Status:** Authoritative

This document describes the Continuous Integration pipeline behavior for the PEAC Protocol monorepo.

---

## Overview

CI runs on GitHub Actions for all pushes to `main` and for all pull requests. The primary workflow (`.github/workflows/ci.yml`) uses concurrency groups (`ci-${{ github.ref }}`) with cancel-in-progress to avoid redundant runs.

**Node.js:** Version determined by `.node-version` file (currently 24.x Active LTS). Engine requirement: `>=22.0.0`. CI also tests Node 22 (Maintenance LTS) and Node 25 (forward-compat, non-blocking).

**Package manager:** pnpm (version from `packageManager` field in root `package.json`). All CI jobs use `--frozen-lockfile`.

---

## Primary Workflow Jobs

The primary CI workflow has four jobs:

### 1. `ci` (Blocking, ~15 min timeout)

**Runner:** ubuntu-latest

The main build, lint, test, and verification job. Runs ~55 sequential checks covering the full quality surface:

**Format and Lint:**

- Prettier format check
- ESLint lint
- Dependency architecture check (dep-cruiser, `NODE_OPTIONS: --max-old-space-size=4096`)

**Security and Unicode:**

- Trojan Source detection (CVE-2021-42574): scans `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.json`, `.md`, `.yaml`, `.yml` files
- Targeted Unicode scan on previously-flagged files

**Codegen and Guards:**

- Codegen drift check (`verify:codegen-drift`)
- Domain guard (`scripts/guard.sh`): 30+ safety invariants including forbidden imports, domain checks, field regression detection, header casing, wire format isolation, and no-network guard
- Forbidden strings (`scripts/ci/forbid-strings.sh`): RFC/IETF aspiration patterns, emojis, em dashes, vendor names
- Worker surface typechecks and distribution surface validation

**Package and Manifest:**

- Package hygiene (drift, duplicates, private + publishConfig)
- Publish-manifest closure check
- Publish-manifest invariants (no overlaps, no duplicates, OIDC coverage)

**Protocol Verification:**

- Protocol string verification (forbidden patterns)
- Spec drift verification (constants parity)
- Error code parity (advisory)

**TypeScript:**

- TypeScript check (core packages, blocking)
- TypeScript check (legacy packages, advisory)
- TypeScript check (apps, advisory)

**Build and Export:**

- Build all packages (`turbo run build`)
- Capture-core exports verification

**Integration Smoke:**

- Pack-install gate (`scripts/pack-and-install.sh`)
- OTel pack-and-import smoke (`scripts/otel-smoke.sh`)

**Generated Files:**

- Generated profiles drift check
- Error codes codegen drift check

**Architecture:**

- Layer boundary enforcement (`scripts/check-layer-boundaries.sh`)
- Version coherence check (`scripts/check-version-coherence.sh`)

**Conformance:**

- Bundle vectors sanity check
- Core tests (`pnpm test:core`)
- Schema meta-validation
- Fixture integrity (per-fixture versioning)
- Conformance tests (all suites)

**Examples and Apps:**

- Examples typecheck
- Quickstart demo (issue + verify)
- ERC-8004 mapping conformance
- No X-PEAC headers check
- App builds and tests (sandbox-issuer, verifier, api)
- Sandbox issuer health smoke test

**Post-Test:**

- Working tree cleanliness check (no untracked changes after tests)

**Performance (Advisory):**

- Performance SLO gate (p95 verify latency, advisory on PRs, blocking on release tags)
- Extension regression gate (advisory)
- Benchmark artifact upload (90-day retention)

### 2. `ci-windows` (Blocking, ~10 min timeout)

**Runner:** windows-latest

Cross-platform audit gate validation:

- Audit gate (default mode)
- Audit gate (strict mode with `AUDIT_STRICT=1`)
- Audit gate vitest tests

### 3. `node-compat` (Blocking, ~15 min timeout)

**Runner:** ubuntu-latest
**Strategy:** Matrix `[22, 25]`, fail-fast: false

Node.js compatibility validation:

- Build core packages (kernel, schema, crypto, protocol)
- Test core packages
- Extension regression (advisory)
- Compat benchmark artifact upload

**Release contract:** Node 24.x LTS (canonical) and Node 22.x Maintenance LTS must both pass. Node 25 is NON-BLOCKING.

### 4. `scope-guard` (Blocking, ~2 min timeout, PR-only)

**Runner:** ubuntu-latest
**Condition:** `github.event_name == 'pull_request'`

PR scope validation: hard-fail when changed files exceed declared scope (opt-in via `scope:*` labels).

---

## Other Workflows

| Workflow                   | Trigger                               | Purpose                                          |
| -------------------------- | ------------------------------------- | ------------------------------------------------ |
| `codeql.yml`               | Push (main, release/\*), PR, schedule | Security analysis (CodeQL)                       |
| `dependency-review.yml`    | PR                                    | Dependency audit review                          |
| `docs-quality.yml`         | PR (paths: docs/\*\*)                 | Doc linting, forbidden headers, RFC refs         |
| `go-sdk.yml`               | Push/PR (paths: sdks/go/\*\*)         | Go SDK format, lint, test                        |
| `nightly.yml`              | Schedule (daily 3 UTC), tags, manual  | Full test suite, integrations, perf              |
| `pr-metadata-lint.yml`     | PR (opened, edited, synchronize)      | PR title/body security checks                    |
| `promote-latest.yml`       | Manual                                | npm dist-tag promotion (next to latest)          |
| `publish.yml`              | Tags (v\*), manual                    | Package publication with OIDC Trusted Publishing |
| `publish-mcp-registry.yml` | Manual                                | MCP Registry publication                         |
| `schema-drift.yml`         | Schedule (Mon 9 UTC), manual          | MCP Registry schema drift                        |
| `x402-drift.yml`           | Schedule (Mon 9 UTC), manual          | x402 upstream spec drift                         |

---

## Advisory vs Blocking

| Status       | Meaning                                 |
| ------------ | --------------------------------------- |
| **Blocking** | PR cannot merge if check fails          |
| **Advisory** | Failure logged but does not block merge |

Current advisory checks:

- TypeScript (legacy and apps)
- Performance SLO gate (on PRs; blocking on release tags)
- Extension regression gate
- Error code parity

---

## Pre-Push Hook (Two-Tier Gate)

**Tier 1 (mandatory, ~10-60s):** Always runs.

- `guard.sh` fast mode
- `format:check`
- Planning leak check (if exists locally)
- Changed-package build + test via turbo filter

**Tier 2 (optional, full CI-parity):** Runs `gate.sh`. Skippable with `PEAC_SKIP_FULL_PRE_PUSH=1`.

---

## Local Verification

```bash
pnpm install
pnpm lint && pnpm build && pnpm typecheck:core && pnpm test
./scripts/guard.sh
pnpm format:check
```

Full CI parity: `pnpm ci:local-parity` (runs `gate.sh`).

Fast pre-push check: `pnpm ci:prepush-fast`.

---

## Performance Budgets

| Metric               | Threshold        | Status                              |
| -------------------- | ---------------- | ----------------------------------- |
| p95 verify latency   | <=10 ms          | Advisory (blocking on release tags) |
| Extension regression | <=5% degradation | Advisory                            |

Benchmark artifacts uploaded to GitHub Actions with 90-day retention.

---

## Test Categories

| Category    | Location                                   | Purpose                                |
| ----------- | ------------------------------------------ | -------------------------------------- |
| Unit        | `packages/*/tests/`                        | Package-level unit tests               |
| Conformance | `tests/conformance/`, `specs/conformance/` | Cross-package behavior, golden vectors |
| Performance | `tests/perf/`                              | Latency and throughput benchmarks      |
| Property    | `packages/*/tests/` (fast-check)           | Property-based testing                 |

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): Package structure and dependencies
- [specs/TEST_VECTORS.md](specs/TEST_VECTORS.md): Test vector format
- [specs/CONFORMANCE-MATRIX.md](specs/CONFORMANCE-MATRIX.md): Conformance coverage
