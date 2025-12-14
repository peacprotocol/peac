# Manual QA Checklist

This document provides a manual QA checklist for validating PEAC Protocol releases.

## Pre-Release Checklist

Run these checks before tagging a new release:

### 1. Build and Test

```bash
# Clean install
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Build all packages
pnpm build

# Run core tests (must pass)
pnpm test:core

# Run full test suite
pnpm test

# TypeScript checks
pnpm typecheck:core    # Blocking - must pass
pnpm typecheck:legacy  # Advisory
```

### 2. Lint and Format

```bash
# ESLint
pnpm lint

# Prettier format check
pnpm format:check
```

### 3. Policy Kit CLI

```bash
# Initialize a policy file
peac policy init

# Validate the generated policy
peac policy validate peac-policy.yaml

# Explain a rule
peac policy explain peac-policy.yaml --subject-type agent --purpose train

# Generate artifacts (dry run)
peac policy generate peac-policy.yaml --well-known --dry-run

# Generate artifacts (write files)
peac policy generate peac-policy.yaml --well-known --out dist/peac
```

### 4. Version Consistency

```bash
# Check all packages have the same version
grep -r '"version":' package.json packages/*/package.json | grep -v node_modules

# Search for stale version references (update version numbers as needed)
rg "0\.9\.16|v0\.9\.16" --glob '!CHANGELOG.md' --glob '!archive/**' --glob '!pnpm-lock.yaml'
```

### 5. Guard Scripts

```bash
# Domain guard (no peac.dev references)
./scripts/guard.sh

# Planning leak check
./scripts/check-planning-leak.sh
```

## Post-Release Verification

After tagging and pushing a release:

### 1. Verify Tag

```bash
git tag -l 'v0.9.*' | tail -5
git log --oneline -3 origin/main
```

### 2. Smoke Test Install (optional)

```bash
# In a fresh directory
mkdir /tmp/peac-test && cd /tmp/peac-test
pnpm init
pnpm add @peac/protocol @peac/schema @peac/crypto
# Verify packages install correctly
```

## CI Validation

The following CI checks run automatically on every PR:

| Check               | Command                 | Status   |
| ------------------- | ----------------------- | -------- |
| Format              | `pnpm format:check`     | Blocking |
| Lint                | `pnpm lint`             | Blocking |
| Domain Guard        | `scripts/guard.sh`      | Blocking |
| TypeScript (core)   | `pnpm typecheck:core`   | Blocking |
| TypeScript (legacy) | `pnpm typecheck:legacy` | Advisory |
| Build               | `pnpm build`            | Blocking |
| Core Tests          | `pnpm test:core`        | Blocking |
| Conformance         | `tests/conformance/`    | Blocking |
| Performance         | P95 verify <=5ms        | Advisory |

See [CI_BEHAVIOR.md](./CI_BEHAVIOR.md) for detailed CI documentation.
