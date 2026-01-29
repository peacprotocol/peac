# npm Publishing Guide

This document describes the npm publishing workflow for PEAC Protocol packages.

## Overview

PEAC uses **npm Trusted Publishing** with GitHub OIDC - no long-lived npm tokens are used.

- **Publish workflow:** `.github/workflows/publish.yml`
- **Package manifest:** `scripts/publish-manifest.json`
- **Protected environment:** `npm-production` (requires approval)

## Key Principles

### 1. Manifest is the Allowlist

Only packages listed in `scripts/publish-manifest.json` are published. This enables incremental OIDC rollout:

- Configure Trusted Publishing for a package on npm
- Add it to the manifest
- Re-run the publish workflow

Packages not in the manifest are logged but **not published**, even if they are public.

### 2. Semver Bump Only for Product Changes

Version numbers should reflect meaningful API or runtime changes, not operational updates:

**DO bump version for:**
- New features or capabilities
- Bug fixes
- Breaking changes
- Dependency updates that affect behavior

**DO NOT bump version for:**
- Adding packages to the manifest
- CI/workflow changes
- Documentation updates

### 3. Same Version, More Packages

Additional packages can be published at the same version if they haven't been published yet:

```
v0.10.5: Initial publish (6 packages)
v0.10.5: Add OIDC to 4 more packages, re-run workflow (now 10 packages)
v0.10.5: Add OIDC to 4 more packages, re-run workflow (now 14 packages)
```

The `--skip-existing` flag makes this idempotent - already-published packages are skipped.

### 4. Don't Rewrite Semver Tags

Once a tag like `v0.10.5` is pushed and visible, avoid moving it. If you need to publish with manifest changes:

- **Option A (recommended):** Run workflow from `main` via `workflow_dispatch`
- **Option B:** Create a publish-specific tag (e.g., `publish/0.10.5-batch-2`)
- **Option C (avoid):** Move the semver tag (breaks git hygiene)

## Workflow Triggers

### Tag Push (Production)

```bash
git tag v0.10.5
git push origin v0.10.5
```

This triggers a production publish with environment approval.

### Manual Dispatch

Go to Actions > Publish to npm > Run workflow:

- **dry_run:** Validates packaging without uploading
- **tag_override:** Specify which tag to publish (e.g., `v0.10.5`)

For dry_run=false, the tag must exist and be reachable from `main`.

## Adding a New Package

1. **Configure Trusted Publishing on npm:**
   - Go to package settings on npmjs.com
   - Add publishing access for:
     - Repository: `peacprotocol/peac`
     - Workflow: `publish.yml`
     - Environment: `npm-production`

2. **Update the manifest:**
   ```bash
   # Edit scripts/publish-manifest.json
   # Add package to "packages" array in topological order
   # Remove from "pendingTrustedPublishing" if present
   ```

3. **Verify topological order:**
   ```bash
   node scripts/check-manifest-topo.mjs
   ```

4. **Commit and merge:**
   ```bash
   git add scripts/publish-manifest.json
   git commit -m "chore: add @peac/new-package to manifest"
   # Create PR, merge to main
   ```

5. **Re-run publish workflow:**
   - Use manual dispatch with existing tag
   - Or push a new tag if version was bumped

## Verification

After publishing, verify:

```bash
# Check package is on npm
npm view @peac/protocol@0.10.5

# Check workspace:* dependencies are resolved
npm view @peac/protocol@0.10.5 dependencies

# Check provenance attestation
npm audit signatures @peac/protocol
```

## Troubleshooting

### "Package not found" immediately after publish

npm registry propagation can take 30-60 seconds. The workflow retries with exponential backoff.

### "OIDC not configured" error

The package doesn't have Trusted Publishing set up on npm. Configure it before adding to manifest.

### Workflow shows "skipped" for a package

This means the package was already published at this version. This is expected behavior with `--skip-existing`.

## Related Docs

- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements)
- [RELEASING.md](./RELEASING.md) - Full release process
