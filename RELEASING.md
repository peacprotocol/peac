# PEAC Release Guide

## Critical: Use pnpm for Publishing

**NEVER use `npm publish` directly.** Always use `pnpm publish` or `pnpm --filter` to publish packages. This is required because:

- pnpm resolves `workspace:*` dependencies to actual version numbers
- npm does not understand the workspace protocol and will publish broken packages

## Quick Release Checklist

### 1. Pre-Release Validation

```bash
# Sync to main
git fetch origin && git checkout main && git pull --ff-only

# Install and build
pnpm install --frozen-lockfile
pnpm build

# Run all gates
pnpm lint
pnpm typecheck:core
pnpm test:core
pnpm format:check
./scripts/guard.sh
./scripts/check-publish-list.sh
```

### 2. Create and Push Tag

```bash
# Create annotated tag
git tag -a vX.Y.Z -m "vX.Y.Z"

# Push tag
git push origin vX.Y.Z
```

### 3. Publish Packages (22 public packages)

**IMPORTANT: Use pnpm, not npm!**

```bash
# Verify npm auth
npm whoami  # Should show: peacprotocol

# Publish all public packages with pnpm (resolves workspace:* correctly)
# Use dist-tag 'next' for pre-1.0 releases
pnpm --filter "@peac/kernel" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/schema" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/crypto" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/protocol" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/control" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/cli" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/server" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/core" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/receipts" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/pref" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/disc" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/pay402" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/sdk" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/http-signatures" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/jwks-cache" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/policy-kit" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/rails-stripe" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/rails-x402" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/mappings-acp" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/mappings-mcp" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/mappings-rsl" publish --access public --tag next --no-git-checks
pnpm --filter "@peac/mappings-tap" publish --access public --tag next --no-git-checks
```

### 4. Verify Publication

```bash
# Check dist-tags (next should show new version)
npm view @peac/protocol dist-tags
npm view @peac/crypto dist-tags

# Verify workspace:* was resolved correctly
npm view @peac/protocol@next dependencies
# Should show "@peac/schema": "X.Y.Z", NOT "workspace:*"
```

### 5. Smoke Test

```bash
# Test in fresh environment
mkdir -p /tmp/peac-smoke-test && cd /tmp/peac-smoke-test
rm -rf node_modules package.json package-lock.json
npm init -y
npm install @peac/protocol@next @peac/crypto@next @peac/schema@next

# Verify import works
node -e "import('@peac/protocol').then(m => console.log('verifyReceipt OK:', typeof m.verifyReceipt === 'function'))"
```

### 6. Create GitHub Release

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "Release notes here..."
```

## Package List (22 public packages)

Managed by `./scripts/check-publish-list.sh`:

**Core:** kernel, schema, crypto, protocol, control
**Runtime:** cli, server, core (deprecated), receipts, pref, disc, pay402, sdk
**Security:** http-signatures, jwks-cache
**Policy:** policy-kit
**Rails:** rails-stripe, rails-x402
**Mappings:** mappings-acp, mappings-mcp, mappings-rsl, mappings-tap

**Private (not published):** rails-razorpay, worker-cloudflare, middleware-nextjs

## Dist-Tag Policy

- `next`: All v0.9.x pre-1.0 releases
- `latest`: Reserved for v1.0+ stable releases

## Common Mistakes to Avoid

1. **Using npm publish instead of pnpm publish** - Results in broken packages with unresolved `workspace:*` dependencies
2. **Forgetting --no-git-checks** - pnpm will refuse to publish from non-main branches
3. **Publishing before tagging** - Tag first, then publish
4. **Not running smoke test** - Always verify packages work after publish
