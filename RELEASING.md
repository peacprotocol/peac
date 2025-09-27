# PEAC Release Guide

## Quick Release Checklist

### 1. Pre-Release Validation

```bash
# Build and test everything
pnpm -w build && pnpm -w test

# Run guard scripts
./scripts/guard.sh
node scripts/assert-core-exports.mjs

# Commit release
git add -A
git commit -m "release: vX.Y.Z (description)"
git push
```

### 2. Publish Packages

```bash
# Set NPM auth (locally or in CI)
export NPM_TOKEN=***your_token***

# Publish core packages only (filters out legacy adapters)
pnpm -r \
  --filter @peac/core \
  --filter @peac/receipts \
  --filter @peac/pref \
  --filter @peac/disc \
  --filter @peac/pay402 \
  --filter @peac/sdk \
  publish --access public --no-git-checks
```

### 3. Verify Publication

```bash
# Check versions on registry
pnpm view @peac/core version
pnpm view @peac/sdk version
```

### 4. Smoke Test

```bash
# Test in fresh environment
TMPDIR=$(mktemp -d); cd "$TMPDIR"
pnpm init -y
pnpm add @peac/core@latest @peac/sdk@latest
node -e "import('@peac/core').then(m=>console.log('verifyReceipt OK:', typeof m.verifyReceipt==='function'))"
```

### 5. Tag After Success

```bash
# Only tag after successful publish + smoke test
ALLOW_TAG_PUSH=1 git tag vX.Y.Z
ALLOW_TAG_PUSH=1 git push --tags
```

## CI/CD Notes

- `.npmrc` is configured for `${NPM_TOKEN}` env var
- `publish-branch` allows `main|master|release/.*`
- Pre-push hook blocks accidental tag pushes (set `ALLOW_TAG_PUSH=1` to override)
- `--no-git-checks` bypasses branch restrictions for release branches

## Package Filters

We publish only these packages:

- `@peac/core` - Core receipt verification
- `@peac/receipts` - Receipt utilities
- `@peac/pref` - AI preference parsing
- `@peac/disc` - Discovery protocol
- `@peac/pay402` - Payment handling
- `@peac/sdk` - Client SDK

Legacy adapters (`@peac/adapter-*`) are intentionally excluded.
