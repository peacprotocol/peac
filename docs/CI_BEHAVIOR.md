# PEAC Protocol CI Behavior

**Version:** 0.12.6
**Status:** Authoritative

This document describes the Continuous Integration pipeline behavior for the PEAC Protocol monorepo.

---

## Overview

CI runs on GitHub Actions for all pushes to `main` and for all pull requests. Release validation (tag builds, publication) is handled by separate workflows (`publish.yml`, `nightly.yml`), not the primary CI workflow. The primary workflow (`.github/workflows/ci.yml`) uses concurrency groups (`ci-${{ github.ref }}`) with cancel-in-progress to avoid redundant runs.

**Node.js:** Version determined by `.node-version` file (currently 24.x Active LTS). Engine requirement: `>=22.0.0`. CI also tests Node 22 (Maintenance LTS) and Node 25 (forward-compat, non-blocking).

**Package manager:** pnpm (version from `packageManager` field in root `package.json`). All CI jobs use `--frozen-lockfile`.

---

## Primary Workflow Jobs

The primary CI workflow uses a `detect-changes` job to classify changed files, then runs up to five parallel lanes. A `ci` aggregator job evaluates all lane results and is the stable required check for branch protection. Three satellite jobs run independently.

**Gating behavior:** `fast-guards` always runs. `type-build` and `tests-core` run on `main` or when source/CI/root-config files changed (skipped for docs-only PRs). `examples-apps` runs when examples, apps, core, adapters, or root config changed, or on `main`. `pack-smoke` runs when published package surfaces or root config changed, or on `main`. Skipped jobs report `success` (not `pending`) because gating uses job-level `if:`, not workflow-level path filters. Release validation (tags, publication) is handled by separate workflows.

### Change Detection

The `detect-changes` job (ubuntu-latest, ~2 min) uses `dorny/paths-filter` to classify changed files into categories: `core`, `adapters`, `examples`, `apps`, `published`, `ci`, `root_config`, `any_src`. The `root_config` category covers `.node-version`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig*.json`, `vitest*.config.*`, and ESLint/Prettier config, ensuring root build/runtime changes always trigger heavy lanes. Downstream lanes use job-level `if:` conditions (not workflow-level path filters) so that skipped jobs report `success` instead of staying `pending`.

### 0. `workflow-lint` (Always runs, ~2 min)

**Runner:** ubuntu-latest

Standalone workflow validation using a pinned actionlint binary (v1.7.11) with SHA-256 checksum verification. Does not use the local composite action; validates CI workflow files independently of the setup it is checking.

### 1. `fast-guards` (Always runs, ~5 min)

**Runner:** ubuntu-latest

Format, lint, security scans, forbidden strings, distribution and manifest checks, protocol verification:

- Prettier format check
- ESLint lint
- Dependency architecture check (dep-cruiser)
- Trojan Source detection (CVE-2021-42574) and targeted Unicode scan
- Domain guard (`scripts/guard.sh`): 30+ safety invariants
- Planning leak check (local-only)
- Forbidden strings (`scripts/ci/forbid-strings.sh`)
- Worker surface typechecks and distribution surface validation
- Package hygiene (drift, duplicates, private + publishConfig)
- Publish-manifest closure and invariants checks
- Protocol string verification (forbidden patterns)
- Spec drift verification (constants parity)
- Error code parity (advisory)

### 2. `type-build` (Gated, ~10 min)

**Runner:** ubuntu-latest
**Condition:** Runs on `main` or when core/adapters/any_src/ci/root_config changed. Skipped for docs-only PRs.

TypeScript checks, build, codegen drift, architecture enforcement:

- TypeScript check (core packages, blocking; legacy and apps advisory)
- Build all packages
- Capture-core exports verification
- Codegen drift check
- Error codes codegen drift check
- Generated profiles drift check
- Layer boundary enforcement
- Version coherence check

### 3. `tests-core` (Gated, ~10 min)

**Runner:** ubuntu-latest
**Condition:** Same as `type-build`: runs on `main` or when core/adapters/any_src/ci/root_config changed.

Core tests, conformance, performance:

- Core tests (`pnpm test:core`)
- Schema meta-validation
- Fixture integrity (per-fixture versioning)
- Conformance tests (all suites)
- Bundle vectors sanity check
- Working tree cleanliness check
- Performance SLO gate (advisory in this workflow; blocking in nightly/release workflows)
- Extension regression gate (advisory)
- Benchmark artifact upload (90-day retention)

### 4. `examples-apps` (Conditional, ~10 min)

**Runner:** ubuntu-latest
**Condition:** Runs when examples, apps, core, adapters, or root config changed, or on `main`.

- Examples typecheck
- Quickstart demo (issue + verify)
- ERC-8004 mapping conformance
- No X-PEAC headers check
- App builds and tests (sandbox-issuer, verifier, api)
- Sandbox issuer health smoke test

### 5. `pack-smoke` (Conditional, ~8 min)

**Runner:** ubuntu-latest
**Condition:** Runs when published package surfaces or root config changed, or on `main`.

- Pack and install gate
- OTel pack-and-import smoke test

### 6. `ci` (Aggregator, Blocking, ~1 min)

**Runner:** ubuntu-latest

Evaluates all lane results. Required lanes (`workflow-lint`, `fast-guards`, `type-build`, `tests-core`) must succeed. Optional lanes (`examples-apps`, `pack-smoke`) may be skipped. Uses `if: always()` so it always runs. This is the stable required check for branch protection.

### Branch-Protection Continuity

The required check name `Build, Lint, Test` (job id: `ci`) is preserved. The old single serial job is replaced internally by the aggregator over parallel lanes. No branch-protection configuration change is needed for this check. `ci-windows`, `node-compat`, and `scope-guard` remain as separate jobs; whether they are required in branch protection depends on repository configuration.

### 7. `ci-windows` (Blocking, ~10 min timeout)

**Runner:** windows-latest

Cross-platform audit gate validation:

- Audit gate (default mode)
- Audit gate (strict mode with `AUDIT_STRICT=1`)
- Audit gate vitest tests

### 8. `node-compat` (Blocking, ~15 min timeout)

**Runner:** ubuntu-latest
**Strategy:** Matrix `[22, 25]`, fail-fast: false

Node.js compatibility validation:

- Build core packages (kernel, schema, crypto, protocol)
- Test core packages
- Extension regression (advisory)
- Compat benchmark artifact upload

**Release contract:** Node 24.x LTS (canonical) and Node 22.x Maintenance LTS must both pass. Node 25 is NON-BLOCKING.

### 9. `scope-guard` (Blocking, ~2 min timeout, PR-only)

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

| Metric               | Threshold        | Status                                           |
| -------------------- | ---------------- | ------------------------------------------------ |
| p95 verify latency   | <=10 ms          | Advisory (blocking in nightly/release workflows) |
| Extension regression | <=5% degradation | Advisory                                         |

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
