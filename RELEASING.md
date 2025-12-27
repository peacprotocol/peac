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

**CRITICAL: Always use pnpm for publishing, never the npm CLI directly.**

pnpm resolves `workspace:*` dependencies to actual version numbers. The npm CLI does not understand the workspace protocol and publishes broken packages.

```bash
# Set NPM auth
export NPM_TOKEN=***your_token***

# 0) DRY-RUN first (no registry writes) - always do this!
pnpm -r --filter "./packages/**" publish --access public --tag next --dry-run --report-summary

# 1a) Stable release (tag: latest)
pnpm -r --filter "./packages/**" publish --access public --report-summary

# 1b) Prerelease channel (tag: next)
pnpm -r --filter "./packages/**" publish --access public --tag next --report-summary
```

**Notes:**

- `pnpm -r` = explicit recursive publish across workspace
- `--filter "./packages/**"` = scope to packages directory only
- `--dry-run` = preview what would publish without touching registry
- `--report-summary` = machine-readable summary of published packages

### 3. Verify Publication

```bash
# Check versions on registry
for pkg in kernel schema crypto protocol control cli server core receipts pref disc pay402 sdk http-signatures jwks-cache policy-kit rails-stripe rails-x402 mappings-acp mappings-mcp mappings-rsl mappings-tap; do
  echo -n "@peac/$pkg: "
  npm view @peac/$pkg@next version 2>/dev/null || echo "NOT FOUND"
done

# Verify workspace:* was resolved correctly
npm view @peac/protocol@next dependencies
# Should show "@peac/schema": "0.9.X", NOT "workspace:*"
```

### 4. Smoke Test

```bash
# Test in fresh environment
TMPDIR=$(mktemp -d); cd "$TMPDIR"
pnpm init -y
pnpm add @peac/core@next @peac/sdk@next
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
- Publishing is done locally via pnpm (not via CI workflow)

## Published Packages (22 total)

**Layer 0-3 (Core):**

- `@peac/kernel` - Types, constants, errors
- `@peac/schema` - Zod schemas, validation
- `@peac/crypto` - Signing, verification
- `@peac/protocol` - High-level protocol APIs
- `@peac/control` - Control flow APIs

**Layer 4 (Adapters):**

- `@peac/http-signatures` - RFC 9421 HTTP Message Signatures
- `@peac/jwks-cache` - Edge-safe JWKS fetch
- `@peac/mappings-acp` - Agent Communication Protocol mapping
- `@peac/mappings-mcp` - Model Context Protocol mapping
- `@peac/mappings-rsl` - RSL usage token mapping
- `@peac/mappings-tap` - Visa TAP mapping
- `@peac/policy-kit` - Policy evaluation engine
- `@peac/rails-stripe` - Stripe payment rail
- `@peac/rails-x402` - x402 payment rail

**Layer 5 (Applications):**

- `@peac/cli` - Command-line interface
- `@peac/server` - Server utilities

**Layer 6 (Consumer SDK):**

- `@peac/core` - Core receipt verification
- `@peac/receipts` - Receipt utilities
- `@peac/pref` - AI preference parsing
- `@peac/disc` - Discovery protocol
- `@peac/pay402` - Payment handling
- `@peac/sdk` - Client SDK

**Private packages** (NOT published):

- `@peac/access`, `@peac/attribution`, `@peac/compliance`, `@peac/consent`
- `@peac/intelligence`, `@peac/privacy`, `@peac/provenance`
- `@peac/rails-razorpay` (India-specific, requires separate npm org)
- `@peac/transport-*` (scaffolds)
