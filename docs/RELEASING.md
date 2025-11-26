# Release Process

This document describes the release process for PEAC Protocol packages.

## Pre-Release Checklist

Before creating a release:

1. **All CI checks pass**
   - `typecheck:core` must pass (blocking)
   - `lint` must pass (blocking)
   - `test` must pass (blocking)
   - `typecheck:legacy` is advisory (tracked but not blocking)

2. **CHANGELOG.md updated**
   - Add new version section with date
   - Document all changes under appropriate categories (Changed, Added, Deprecated, Removed, Fixed, Security)
   - Follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format

3. **Version numbers aligned**
   - Root `package.json` version matches release
   - All published packages have correct version

## Published Packages

The following packages are published to npm:

| Package | Description |
|---------|-------------|
| `@peac/kernel` | Core receipt types, builder, nonce cache |
| `@peac/schema` | Zod schemas, validation utilities |
| `@peac/crypto` | Signing, verification, key management |
| `@peac/protocol` | High-level enforce/verify APIs |
| `@peac/control` | Control abstraction layer (mandates) |
| `@peac/cli` | Command-line interface |
| `@peac/server` | HTTP server implementation |
| `@peac/rails-x402` | x402 payment rail adapter |
| `@peac/rails-stripe` | Stripe payment rail adapter |
| `@peac/mappings-acp` | Agent Communication Protocol mapping |
| `@peac/mappings-mcp` | Model Context Protocol mapping |

## Release Steps

### 1. Create Release Branch

```bash
git checkout main
git pull origin main
git checkout -b release/v0.9.X
```

### 2. Update Versions

```bash
# Update root package.json version
# Update individual package versions as needed
pnpm install  # Regenerate lockfile
```

### 3. Run Full CI Suite

```bash
pnpm ci:all
```

This runs:
- `ci:guards` - Forbid-strings safety checks
- `ci:surface` - Surface area validation
- `lint` - ESLint checks
- `typecheck` - Core TypeScript checks
- `test` - Vitest test suite

### 4. Create Release Commit

```bash
git add -A
git commit -m "chore: release v0.9.X"
```

### 5. Tag Release

```bash
git tag -a v0.9.X -m "Release v0.9.X"
```

### 6. Push and Create PR

```bash
git push origin release/v0.9.X --tags
gh pr create --title "Release v0.9.X" --body "Release checklist..."
```

### 7. Publish to npm

After PR merge:

```bash
# From main branch
pnpm publish -r --access public
```

## Versioning Policy

PEAC Protocol follows [Semantic Versioning](https://semver.org/):

- **Pre-1.0**: Breaking changes may occur in minor versions (0.9.x → 0.10.x)
- **Post-1.0**: Breaking changes require major version bump

### Wire Protocol Compatibility

The wire format version in receipts (`typ: "peac.receipt/0.9"`) is independent of package versions:
- Wire format changes require explicit version bump in the `typ` header
- Multiple package versions may share the same wire format version

## Deprecation Policy

When deprecating packages or APIs:

1. Add `@deprecated` JSDoc tag to exports
2. Add deprecation notice to CHANGELOG.md
3. Document migration path
4. Maintain deprecated APIs for at least one minor version

Example deprecation (from 0.9.15):
```typescript
// Before (deprecated)
import { enforce, verify } from '@peac/core';

// After
import { enforce, verify } from '@peac/protocol';
```

## Hotfix Process

For critical fixes on released versions:

```bash
git checkout v0.9.X
git checkout -b hotfix/v0.9.X.1
# Make fix
git commit -m "fix: critical issue description"
git tag -a v0.9.X.1 -m "Hotfix v0.9.X.1"
git push origin hotfix/v0.9.X.1 --tags
```
