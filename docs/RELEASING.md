# Release Process

This document describes the release process for PEAC Protocol packages.

## Overview

All workspace packages share the monorepo version (except examples, which stay at `0.0.0`).
The single source of truth for npm publish order is `scripts/publish-manifest.json`.

## Version Management Scripts

```bash
# Check all versions are in sync
pnpm version:check

# Bump all packages to a target version
pnpm version:bump 0.X.Y

# Dry run (preview without writing)
pnpm version:bump 0.X.Y -- --dry-run
```

Both scripts handle:

- Root `package.json`
- All workspace packages (via pnpm workspace enumeration)
- `scripts/publish-manifest.json`
- Examples at `0.0.0` (enforced -- fails if any example has a different version)

## Pre-Release Checklist

1. All PRs for this release are merged to main
2. No WIP commits in main

## Release Steps

### 1. Create Release Branch

```bash
git checkout main && git pull --ff-only origin main
git checkout -b release/vX.Y.Z
```

### 2. Bump Versions

```bash
pnpm version:bump X.Y.Z
pnpm version:check  # verify
```

### 3. Update CHANGELOG.md

Add a new version section following [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.
Categories: Changed, Added, Deprecated, Removed, Fixed, Security.

### 4. Run All Gates

```bash
pnpm lint
pnpm build
pnpm typecheck:core
pnpm test
./scripts/guard.sh
./scripts/check-publish-list.sh
node scripts/check-manifest-topo.mjs
pnpm version:check
```

### 5. Commit and PR

```bash
git add -A
git commit -m "chore(release): vX.Y.Z"
git push -u origin release/vX.Y.Z
gh pr create --title "chore(release): vX.Y.Z" --body "Release vX.Y.Z"
```

### 6. After PR Merge

Tag the release from main:

```bash
git checkout main && git pull --ff-only origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

### 7. Publish to npm

1. Go to GitHub Actions
2. Run the "Publish to npm" workflow
3. Select the `npm-production` environment
4. Verify: `npm view @peac/kernel@X.Y.Z`

See `docs/maintainers/RELEASING.md` for manual publishing details and `docs/maintainers/NPM_PUBLISH_POLICY.md` for dist-tag policy.

## Conventions

- **Examples stay at `0.0.0`**: Examples are type-check only, not published. The version scripts enforce this invariant.
- **Wire format is independent of package version**: `peac-receipt/0.1` is frozen until v1.0.
- **Publish manifest**: `scripts/publish-manifest.json` defines the topological publish order. Validated by `scripts/check-manifest-topo.mjs`.

## Versioning Policy

- **Pre-1.0**: Breaking changes may occur in minor versions (0.9.x to 0.10.x)
- **Post-1.0**: Breaking changes require major version bump

## Rollback

If issues are found post-release:

1. Do NOT delete the tag
2. Create a patch release (vX.Y.Z+1) with the fix
3. Update npm dist-tag if needed: `npm dist-tag add @peac/kernel@X.Y.Z+1 latest`
