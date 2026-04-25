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
- Examples at `0.0.0` (enforced: fails if any example has a different version)

## Release Modes

Two release modes are supported. The mode is chosen per release based on the
content of that release.

### Mode 1: single-step to `latest`

Use this mode when the release contains **none** of the following:

- wire format changes
- schema, kernel, crypto, or `@peac/protocol` public API changes
- normative behavior changes
- runtime or transport behavior changes
- broad package-level behavior changes
- security-sensitive changes requiring soak

Flow:

1. Merge the release-prep PR
2. Tag `vX.Y.Z`
3. Publish directly to `latest` (tag push triggers publish)
4. Post-publish stamp micro-PR (`release-state/vX.Y.Z-publish`)

Step 3 requires the publish workflow to resolve `NPM_TAG=latest` for this
release (workflow parameterization is tracked as a follow-up; until that
lands, Mode 2 is the active default for v0.x).

### Mode 2: two-step via `next`, then promote to `latest`

Use this mode when the release contains any of the Mode-1 exclusion
categories above. It is also the current default for v0.x releases while
workflow parameterization is pending.

Flow:

1. Merge the release-prep PR
2. Tag `vX.Y.Z`
3. Publish to `next` (tag push triggers publish)
4. Post-publish stamp micro-PR (`release-state/vX.Y.Z-publish`)
5. Promote `next` to `latest` via `promote-latest.yml` (dry-run first, then real)
6. Post-promote stamp micro-PR (`release-state/vX.Y.Z-promote`)

### GitHub Release creation

npm publish and dist-tag promotion run in GitHub Actions via OIDC Trusted
Publishing. GitHub Release creation and finalization are a separate, manual
maintainer step performed from the maintainer's GitHub account.

This separation is deliberate. When `publish.yml` or `promote-latest.yml`
create or edit a Release using the workflow's `GITHUB_TOKEN`, the Release
appears under the `github-actions[bot]` author, which makes the public
provenance of the Release ambiguous. Keeping Release publication manual
keeps the maintainer-account author chain intact.

Workflow defaults:

- `publish.yml`: `skip_release` defaults to `true`. Tag-push and manual
  dispatches do not create a GitHub Release. Set `skip_release: false` only
  in scripted recovery flows where bot authorship is explicitly acceptable.
- `promote-latest.yml`: `skip_release_finalize` defaults to `true`. The
  promote step does not edit the Release; the maintainer finalizes it after
  promote succeeds.

Maintainer steps after `publish.yml` succeeds:

1. From the local clone, draft a release body from the `CHANGELOG.md` entry
   (or use `node scripts/extract-changelog-entry.mjs --version X.Y.Z`).
2. Create the Release manually from the maintainer GitHub account:
   `gh release create vX.Y.Z --title "<title>" --notes-file <file>`
   (add `--draft` or `--prerelease` for Mode 2 soak; flip to non-draft /
   non-prerelease after promote-latest succeeds).
3. Confirm the Release author on GitHub matches the maintainer account, not
   `github-actions[bot]`, before announcing.

If a Release was created by the bot in error: delete it from the GitHub UI
and re-create it manually under the maintainer account, then re-run
`promote-latest.yml` with the default `skip_release_finalize: true` so the
workflow does not edit the maintainer-authored Release.

Skipping GitHub Release automation does not skip npm publish or npm
dist-tag promotion. It only disables GitHub Release create/edit operations.
The npm side of `publish.yml` and `promote-latest.yml` runs unchanged
through OIDC Trusted Publishing and `npm dist-tag add`.

### Post-stamp sync

Post-publish and post-promote stamp micro-PRs regenerate derived artifacts
(`docs/SURFACE_STATUS.md`, `docs/PACKAGE_STATUS.md`) and must fail if drift
remains. No separate sync PR is required; the stamp PRs are the sync
vehicles.

### Stamp-PR CI profile

Release-state stamp micro-PRs touch only `docs/releases/facts.json`,
`docs/releases/current.json`, `REPO_SURFACE_STATUS.json`, and derived
status docs. They run a reduced CI profile:

- `pnpm format:check`
- `bash scripts/guard.sh`
- `node scripts/verify-release.mjs`
- `pnpm release:stamp:check:publish` (on the publish stamp PR)
- `pnpm release:stamp:check:promote` (on the promote stamp PR)
- `pnpm verify:surface-status`
- `node scripts/check-public-artifacts.mjs`
- `docs-quality` (when docs touched)

The full monorepo build, test, conformance, and pack-smoke suite is not
rerun on stamp-only PRs. That suite runs on the release-prep PR and on
main.

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

Mutable release-state fields (`release_date`, `updated`, `dist_tag` in
`docs/releases/facts.json`, `docs/releases/current.json`, and
`REPO_SURFACE_STATUS.json`) are **intentionally left at pre-release placeholder
values** in this PR. They are stamped post-tag and post-promotion via
`scripts/stamp-release-state.mjs` (see steps 8 and 10 below).

This avoids pre-release truth drift if merge or tag slips, and keeps
release-state stamping deterministic, idempotent, and checkable.

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
4. `skip_release` is `true` by default; leave it as-is so the workflow does
   not create a `github-actions[bot]`-authored Release
5. Verify: `npm view @peac/kernel@X.Y.Z`

After publish succeeds, create the GitHub Release manually from the
maintainer account (see "GitHub Release creation" above for full guidance):

```bash
node scripts/extract-changelog-entry.mjs --version X.Y.Z > /tmp/release-notes.md
TITLE=$(node scripts/extract-changelog-entry.mjs --version X.Y.Z --title-only)
# Mode 1 (single-step): finalized immediately
gh release create vX.Y.Z --title "$TITLE" --notes-file /tmp/release-notes.md
# Mode 2 (two-step soak): create as draft or prerelease, finalize after promote
gh release create vX.Y.Z --title "$TITLE" --notes-file /tmp/release-notes.md --prerelease
```

Confirm the Release author on GitHub matches the maintainer account before
announcing.

See `docs/maintainers/RELEASING.md` for manual publishing details and `docs/maintainers/NPM_PUBLISH_POLICY.md` for dist-tag policy.

### 8. Stamp release date (post-publish)

After publish succeeds, stamp `release_date` in `docs/releases/facts.json`
and `updated` in `REPO_SURFACE_STATUS.json` to the actual tag date.

Branch naming convention: **`release-state/vX.Y.Z-publish`** (for example,
`release-state/v0.12.9-publish`).

```bash
git checkout main && git pull --ff-only origin main
git checkout -b release-state/vX.Y.Z-publish

# Defaults to today in UTC; pass an explicit YYYY-MM-DD to match the tag date
pnpm release:stamp:publish

git add docs/releases/facts.json REPO_SURFACE_STATUS.json
node scripts/generate-surface-status.mjs  # regenerate derived status docs
git add docs/PACKAGE_STATUS.md docs/SURFACE_STATUS.md
git commit -m "chore: stamp vX.Y.Z release date"
git push -u origin release-state/vX.Y.Z-publish
gh pr create --title "chore: stamp vX.Y.Z release date" --body "Stamps release_date and updated post-tag per release checklist."
```

Verify before merge:

```bash
pnpm release:stamp:check:publish <YYYY-MM-DD>
```

Merge the micro-PR.

### 9. Promote `next` to `latest` (optional, two-step releases only)

Two-step releases ship to the `next` dist-tag first and promote to `latest`
only after soak / verification. Single-step releases publish directly to
`latest` and can skip this entirely.

1. Go to GitHub Actions
2. Run the "Promote to latest" workflow with `version: X.Y.Z`, `dry_run: true`
3. Review dry-run output
4. Re-run with `dry_run: false`. `skip_release_finalize` is `true` by
   default; leave it as-is so the workflow does not edit the
   maintainer-authored Release
5. Verify: `npm dist-tag ls @peac/protocol`
6. Finalize the GitHub Release manually from the maintainer account if it
   was created as draft or prerelease in step 7:
   `gh release edit vX.Y.Z --draft=false --prerelease=false`

### 10. Stamp `dist_tag: latest` (post-promotion)

After `promote-latest.yml` reports success, stamp `dist_tag` in
`docs/releases/facts.json` and `docs/releases/current.json` to the promoted
value.

Branch naming convention: **`release-state/vX.Y.Z-promote`** (for example,
`release-state/v0.12.9-promote`).

```bash
git checkout main && git pull --ff-only origin main
git checkout -b release-state/vX.Y.Z-promote

# Defaults to "latest"; pass an explicit tag to override
pnpm release:stamp:promote

git add docs/releases/facts.json docs/releases/current.json
git commit -m "chore: stamp vX.Y.Z dist_tag latest"
git push -u origin release-state/vX.Y.Z-promote
gh pr create --title "chore: stamp vX.Y.Z dist_tag latest" --body "Stamps dist_tag post-promotion per release checklist."
```

Verify before merge:

```bash
pnpm release:stamp:check:promote latest
```

Merge the micro-PR. After this, all truth surfaces agree with the live npm
registry state.

## Conventions

- **Examples stay at `0.0.0`**: Examples are type-check only, not published. The version scripts enforce this invariant.
- **Wire format is independent of package version**: `peac-receipt/0.1` is frozen until v1.0.
- **Publish manifest**: `scripts/publish-manifest.json` defines the topological publish order. Validated by `scripts/check-manifest-topo.mjs`.

## Versioning Policy

- **Pre-1.0**: Breaking changes may occur in minor versions (0.9.x to 0.10.x)
- **Post-1.0**: Breaking changes require major version bump

## npm Token Lifecycle

The publish pipeline uses two authentication mechanisms:

1. **OIDC Trusted Publishing** (publish.yml): No long-lived token needed. GitHub OIDC provides ephemeral credentials. This is the primary publish path.

2. **NPM_TOKEN automation token** (promote-latest.yml): Required for `npm dist-tag` operations, which OIDC does not support. Stored as a secret in the `npm-production` GitHub environment.

### Token Health Check

The promote-latest workflow runs `npm whoami` before any dist-tag operations. If the token is expired or revoked, the workflow fails early with instructions to rotate.

### Rotating the NPM_TOKEN

1. Log in to [npmjs.com](https://www.npmjs.com/) with the `@peac` org owner account
2. Go to Access Tokens and generate a new **Automation** token
3. Scope the token to the `@peac` organization (read and write)
4. In the GitHub repo, go to Settings > Environments > `npm-production`
5. Update the `NPM_TOKEN` secret with the new token value
6. Verify by running the promote-latest workflow in dry-run mode

### Pre-Release Token Verification

Before tagging a release, verify the token is healthy:

```bash
# If you have local npm auth configured:
npm whoami --registry https://registry.npmjs.org/

# Or run promote-latest in dry-run mode (uses the CI token):
# GitHub Actions > Promote to latest > Run workflow > dry_run: true
```

### New Package Bootstrap

New packages require manual bootstrap before OIDC Trusted Publishing works:

```bash
pnpm pack --pack-destination /tmp/x
npm publish /tmp/x/<tarball>.tgz --access public --tag next --provenance false
```

After the initial publish, configure Trusted Publishing via `npm trust` CLI:

```bash
npm trust add --registry https://registry.npmjs.org/ \
  --provider github \
  --repository peacprotocol/peac \
  --workflow publish.yml \
  --environment npm-production \
  @peac/<package-name>
```

See `scripts/setup-trusted-publishing.sh` for batch configuration.

## Rollback

If issues are found post-release:

1. Do NOT delete the tag
2. Create a patch release (vX.Y.Z+1) with the fix
3. Update npm dist-tag if needed: `npm dist-tag add @peac/kernel@X.Y.Z+1 latest`
