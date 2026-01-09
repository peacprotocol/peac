# NPM Publishing Policy and Procedures

**Policy:** We publish only the latest version to npm.
**Schedule:** First npm publish deferred until **v0.9.31** (three releases after v0.9.28).
**Last Updated:** 2026-01-09

## Publishing Policy

### Latest-Only Publishing

PEAC Protocol publishes **only the latest version** to npm. We do not publish historical versions or maintain multiple concurrent versions on npm.

**Rationale:**

- **Simplicity:** Single version stream prevents dependency confusion
- **Clarity:** Users always get the latest stable release
- **Maintenance:** No archaeology required for older versions
- **Quality:** Forces stabilization before public distribution

### Deferred Publishing Schedule

**First npm publish:** v0.9.31 (tentative)

**Why deferred from v0.9.28:**

- Edge deployment guides need validation with real platform testing
- Surface adapters need production hardening
- CI documentation guardrails need implementation
- Working examples need verification

**Versions tagged but not published:**

- v0.9.20 - v0.9.30: Tagged in Git, not published to npm

## Pre-Publish Checklist (v0.9.31+)

### 1. Quality Gates (ALL must pass)

```bash
# Core quality gates
pnpm lint                       # ESLint
pnpm build                      # Build all packages
pnpm typecheck:core             # TypeScript (blocking)
pnpm test                       # Core tests
./scripts/guard.sh              # Safety checks
./scripts/check-publish-list.sh # Package list verification

# Format check
pnpm format:check

# Version integrity
./scripts/check-version-integrity.sh
```

### 2. Documentation Verification

```bash
# Verify no forbidden headers in edge guides
! rg "Payment-Signature|Payment-Required" docs/guides/edge/

# Verify RFC references
rg "RFC 9421|RFC 9457|RFC 8615" docs/guides/edge/

# Verify no placeholder text
! rg "issuer\.example\.com|your-.*-id|FIXME|TODO" docs/guides/ --glob '!**/ROADMAP.md'
```

### 3. Package List Verification

**Expected Packages (33 as of v0.9.28):**

```bash
@peac/adapter-core
@peac/adapter-x402-daydreams
@peac/adapter-x402-fluora
@peac/adapter-x402-pinata
@peac/attribution
@peac/cli
@peac/contracts
@peac/control
@peac/core
@peac/crypto
@peac/disc
@peac/http-signatures
@peac/jwks-cache
@peac/kernel
@peac/mappings-acp
@peac/mappings-aipref
@peac/mappings-mcp
@peac/mappings-rsl
@peac/mappings-tap
@peac/pay402
@peac/policy-kit
@peac/pref
@peac/protocol
@peac/rails-card
@peac/rails-razorpay
@peac/rails-stripe
@peac/rails-x402
@peac/receipts
@peac/schema
@peac/sdk
@peac/server
@peac/telemetry
@peac/telemetry-otel
@peac/worker-core
```

**Verify against actual list:**

```bash
./scripts/check-publish-list.sh
# Must pass with 0 errors
```

### 4. Git State Verification

```bash
# Verify clean working tree
git status
# Must show: working tree clean

# Verify on main branch
git branch --show-current
# Must show: main

# Verify latest commit is release tag
git describe --tags --exact-match
# Must show: v0.9.31 (or current version)

# Verify tag is annotated and signed
git tag -v v0.9.31
# Must show: valid signature
```

### 5. npm Authentication

```bash
# Verify npm authentication
npm whoami --registry https://registry.npmjs.org/
# Must show: peacprotocol (or authorized maintainer)

# Verify npm org access
npm access ls-packages @peac
# Must list all packages with write access
```

## Publishing Procedure

### Automated Publishing (Recommended)

```bash
# 1. Verify you are NOT on main (use feature branch for safety)
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ]; then
  echo "ERROR: Create a feature branch first!"
  echo "Run: git checkout -b release/v0.9.31"
  exit 1
fi

# 2. Run pre-publish checks
pnpm lint && pnpm build && pnpm typecheck:core && pnpm test
./scripts/guard.sh
./scripts/check-publish-list.sh
./scripts/check-version-integrity.sh

# 3. Dry run to verify package list
node scripts/publish-public.mjs --dry-run

# 4. Review output carefully
# Verify all 33 packages listed
# Verify version numbers correct
# Verify workspace:* dependencies resolved

# 5. Actual publish (ONLY after dry run review)
node scripts/publish-public.mjs

# 6. Verify published versions on npm
npm view @peac/kernel@latest version
npm view @peac/protocol@latest version
# Should show: 0.9.31
```

### Manual Publishing (For Debugging Only)

```bash
# CRITICAL: Always use pnpm publish, NEVER npm publish
# npm does not resolve workspace:* dependencies correctly

# Publish in topological order (dependencies first)
pnpm --filter "@peac/kernel" publish --access public --tag latest --no-git-checks
pnpm --filter "@peac/schema" publish --access public --tag latest --no-git-checks
pnpm --filter "@peac/crypto" publish --access public --tag latest --no-git-checks
# ... etc for all 33 packages

# Verify each package after publishing
npm view @peac/kernel@latest dependencies
# Should show: resolved versions, NOT "workspace:*"
```

## Post-Publish Verification

### 1. Version Verification

```bash
# Check all published packages have correct version
for pkg in kernel schema crypto protocol; do
  echo "Checking @peac/$pkg..."
  npm view @peac/$pkg@latest version
done
# All should show: 0.9.31
```

### 2. Dependency Verification

```bash
# Verify workspace:* was resolved correctly
npm view @peac/protocol@latest dependencies
# Should show: "@peac/schema": "0.9.31"
# NOT: "@peac/schema": "workspace:*"
```

### 3. Installation Test

```bash
# Create temporary test project
mkdir /tmp/peac-install-test
cd /tmp/peac-install-test
npm init -y

# Install published packages
npm install @peac/protocol@latest

# Verify installation
node -e "console.log(require('@peac/protocol').verify)"
# Should show: [Function: verify]
```

### 4. Update Documentation

After successful publish:

1. Update main README.md with install instructions
2. Update CHANGELOG.md with publish date
3. Add GitHub release notes
4. Announce on Discord/Twitter/GitHub Discussions

## Troubleshooting

### "workspace:\* not resolved"

**Cause:** Used `npm publish` instead of `pnpm publish`.

**Fix:**

- Always use `pnpm publish` or `pnpm --filter` for publishing
- npm CLI does not understand workspace protocol
- This creates broken packages on npm registry

**Recovery:**

```bash
# Unpublish broken version (within 72 hours)
npm unpublish @peac/package-name@0.9.31

# Re-publish with pnpm
pnpm --filter "@peac/package-name" publish --access public
```

### "Permission denied"

**Cause:** Not authenticated or missing org permissions.

**Fix:**

```bash
# Login to npm
npm login --registry https://registry.npmjs.org/

# Verify authentication
npm whoami

# Verify org membership
npm org ls peacprotocol
```

### "Version already published"

**Cause:** Version was already published (cannot overwrite).

**Fix:**

- Bump version in all package.json files
- Update VERSION.json
- Create new Git tag
- Re-run publish procedure

## Rollback Procedure

### Within 72 Hours (npm unpublish allowed)

```bash
# Unpublish all packages
for pkg in kernel schema crypto protocol ...; do
  npm unpublish @peac/$pkg@0.9.31
done

# Verify removal
npm view @peac/kernel@0.9.31
# Should show: 404 Not Found
```

### After 72 Hours (deprecate instead)

```bash
# Deprecate broken version
npm deprecate @peac/kernel@0.9.31 "Broken build - use 0.9.32 instead"

# Publish fixed version
# ... bump to 0.9.32 and re-publish
```

## Security Considerations

### npm Provenance (Future)

When GitHub Actions OIDC is available:

```yaml
# .github/workflows/publish.yml
- name: Publish with provenance
  run: pnpm publish --provenance
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Two-Factor Authentication

**Required:** All npm maintainers must enable 2FA.

```bash
# Enable 2FA
npm profile enable-2fa auth-and-writes

# Verify 2FA enabled
npm profile get
# Should show: tfa: auth-and-writes
```

### Access Token Rotation

**Policy:** Rotate npm tokens every 90 days.

```bash
# List current tokens
npm token list

# Revoke old token
npm token revoke <token-id>

# Create new token
npm token create --read-only=false
```

## Version History

| Version         | Published | npm Status    | Notes              |
| --------------- | --------- | ------------- | ------------------ |
| v0.9.20-v0.9.30 | N/A       | Not published | Tagged in Git only |
| v0.9.31         | TBD       | Planned       | First npm publish  |

## References

- npm CLI Documentation: <https://docs.npmjs.com/cli>
- pnpm publish: <https://pnpm.io/cli/publish>
- npm provenance: <https://docs.npmjs.com/generating-provenance-statements>
- PEAC Release Process: [RELEASING.md](./RELEASING.md)
