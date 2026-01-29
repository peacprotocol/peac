# npm Trusted Publishing Setup Guide

This guide walks you through the complete setup for publishing PEAC Protocol packages to npm using GitHub Actions OIDC.

## Overview

You need to configure two services:
1. **GitHub** - Create a protected environment
2. **npm** - Configure Trusted Publisher for each package

## Part 1: GitHub Setup

### Step 1.1: Create the Environment

1. Go to your repository: `https://github.com/peacprotocol/peac`
2. Click **Settings** (top menu)
3. Click **Environments** (left sidebar)
4. Click **New environment**
5. Name it exactly: `npm-production`
6. Click **Configure environment**

### Step 1.2: Configure Environment Protection

On the environment configuration page:

**Required reviewers:**
1. Check "Required reviewers"
2. Add yourself and/or team members who can approve production publishes
3. Click **Save protection rules**

**Wait timer (optional but recommended):**
1. Check "Wait timer"
2. Set to `5` minutes (gives time to cancel accidental publishes)
3. Click **Save protection rules**

**Deployment branches:**
1. Under "Deployment branches", select "Selected branches"
2. Add a rule for `main` only
3. Click **Save protection rules**

### Step 1.3: Verify Workflow File

The workflow file `.github/workflows/publish.yml` should already have:

```yaml
permissions:
  contents: read
  id-token: write
```

These permissions are required for OIDC authentication.

## Part 2: npm Setup

### Step 2.1: Log in to npm

1. Go to `https://www.npmjs.com`
2. Log in with an account that has **Owner** or **Admin** access to the `@peac` organization

### Important: No Bulk Configuration Available

**npm does not support bulk Trusted Publisher configuration.** Each of the 36 packages must be configured individually through the npm web UI. There is no CLI command, API endpoint, or bulk upload option.

This is a one-time setup cost. Once configured, Trusted Publishing works automatically for all future releases.

**Time estimate:** 15-30 minutes for all 36 packages (about 30 seconds each).

### Step 2.2: Configure Trusted Publisher for Each Package

You need to repeat this for all 36 packages. Here's the process:

**For each package (e.g., `@peac/kernel`):**

1. Go to the package page: `https://www.npmjs.com/package/@peac/kernel`
2. Click the **Settings** tab (or go to `/access` URL)
3. Scroll down to **Publishing access**
4. Click **Add trusted publisher** or **Manage trusted publishers**
5. Fill in the form:

   | Field | Value |
   |-------|-------|
   | **Select a CI/CD service** | GitHub Actions |
   | **Repository owner** | `peacprotocol` |
   | **Repository name** | `peac` |
   | **Workflow filename** | `publish.yml` |
   | **Environment name** | `npm-production` |

6. Click **Add trusted publisher**

### Step 2.3: Generate Package URLs

Use this one-liner to print all access URLs from the manifest (single source of truth):

```bash
node -e 'const m=require("./scripts/publish-manifest.json"); for (const p of m.packages) console.log(`https://www.npmjs.com/package/${p}/access`);'
```

Or to open them all in browser tabs (macOS):

```bash
node -e 'const m=require("./scripts/publish-manifest.json"); for (const p of m.packages) console.log(`https://www.npmjs.com/package/${p}/access`);' | xargs -I {} open {}
```

### Step 2.4: Package List (All 36)

Configure each of these packages:

```
https://www.npmjs.com/package/@peac/adapter-core/access
https://www.npmjs.com/package/@peac/adapter-x402/access
https://www.npmjs.com/package/@peac/adapter-x402-daydreams/access
https://www.npmjs.com/package/@peac/adapter-x402-fluora/access
https://www.npmjs.com/package/@peac/adapter-x402-pinata/access
https://www.npmjs.com/package/@peac/attribution/access
https://www.npmjs.com/package/@peac/cli/access
https://www.npmjs.com/package/@peac/contracts/access
https://www.npmjs.com/package/@peac/control/access
https://www.npmjs.com/package/@peac/core/access
https://www.npmjs.com/package/@peac/crypto/access
https://www.npmjs.com/package/@peac/disc/access
https://www.npmjs.com/package/@peac/http-signatures/access
https://www.npmjs.com/package/@peac/jwks-cache/access
https://www.npmjs.com/package/@peac/kernel/access
https://www.npmjs.com/package/@peac/mappings-acp/access
https://www.npmjs.com/package/@peac/mappings-aipref/access
https://www.npmjs.com/package/@peac/mappings-mcp/access
https://www.npmjs.com/package/@peac/mappings-rsl/access
https://www.npmjs.com/package/@peac/mappings-tap/access
https://www.npmjs.com/package/@peac/mappings-ucp/access
https://www.npmjs.com/package/@peac/net-node/access
https://www.npmjs.com/package/@peac/pay402/access
https://www.npmjs.com/package/@peac/policy-kit/access
https://www.npmjs.com/package/@peac/pref/access
https://www.npmjs.com/package/@peac/protocol/access
https://www.npmjs.com/package/@peac/rails-card/access
https://www.npmjs.com/package/@peac/rails-stripe/access
https://www.npmjs.com/package/@peac/rails-x402/access
https://www.npmjs.com/package/@peac/receipts/access
https://www.npmjs.com/package/@peac/schema/access
https://www.npmjs.com/package/@peac/sdk/access
https://www.npmjs.com/package/@peac/server/access
https://www.npmjs.com/package/@peac/telemetry/access
https://www.npmjs.com/package/@peac/telemetry-otel/access
https://www.npmjs.com/package/@peac/worker-core/access
```

**Tip:** Open multiple browser tabs to speed this up. The same values are used for all packages.

### Step 2.5: Phased Rollout (Recommended)

For first-time OIDC setup, configure packages in batches to validate the pipeline before full rollout:

**Day 1 - Foundation (5 packages):**
Configure these first to validate the full Trusted Publishing + provenance path:

```text
@peac/kernel
@peac/schema
@peac/crypto
@peac/telemetry
@peac/protocol
```

Publish with: `node scripts/publish-public.mjs --limit=5 --provenance --strict`

**Note:** `@peac/telemetry` must be published before `@peac/protocol` since protocol depends on it.

**Day 2 - Core (13 packages):**
After validating Day 1 packages work correctly:

```text
@peac/control
@peac/contracts
@peac/http-signatures
@peac/jwks-cache
@peac/policy-kit
@peac/telemetry-otel
@peac/worker-core
@peac/net-node
@peac/attribution
@peac/adapter-core
@peac/rails-stripe
@peac/rails-x402
@peac/rails-card
```

Publish with: `node scripts/publish-public.mjs --limit=18 --skip-existing --provenance --strict`

**Note:** The `--limit=18` publishes Day 1 (5) + Day 2 (13) = 18 packages. The `--skip-existing` flag makes this idempotent - Day 1 packages will be skipped if already published.

**Day 3 - Remaining (18 packages):**
Configure all remaining packages and publish the full set:

```text
@peac/mappings-acp
@peac/mappings-aipref
@peac/mappings-mcp
@peac/mappings-rsl
@peac/mappings-tap
@peac/mappings-ucp
@peac/adapter-x402
@peac/adapter-x402-daydreams
@peac/adapter-x402-fluora
@peac/adapter-x402-pinata
@peac/cli
@peac/server
@peac/receipts
@peac/pref
@peac/disc
@peac/pay402
@peac/core
@peac/sdk
```

Publish with: `node scripts/publish-public.mjs --skip-existing --provenance --strict`

**Why phased rollout?**

- Validates OIDC pipeline with minimal risk
- Catches configuration errors early (unconfigured package = immediate failure)
- Foundation packages have minimal dependencies, so easier to debug
- `--skip-existing` makes reruns idempotent (safe to retry)

## Part 3: Verification

### Step 3.1: Test with Dry Run

1. Go to: `https://github.com/peacprotocol/peac/actions/workflows/publish.yml`
2. Click **Run workflow** (dropdown on right)
3. Select branch: `main`
4. Set **dry_run**: `true`
5. Set **tag_override**: `v0.10.4` (or current version)
6. Click **Run workflow**

This runs the workflow without actually publishing. Check that:
- Preflight validation passes
- Dry run job completes successfully
- No "Not authorized" errors

### Step 3.2: Test Production Publish

After dry run succeeds:

1. Create and push a tag:
   ```bash
   git tag v0.10.4
   git push origin v0.10.4
   ```

2. The workflow will:
   - Run preflight validation
   - Wait for environment approval (you'll get a notification)
   - Approve the deployment
   - Publish all packages

3. Verify on npm:
   ```bash
   npm view @peac/protocol@0.10.4 version
   npm audit signatures @peac/protocol
   ```

## Part 4: Post-Setup Hardening

After verifying the first publish works:

### Step 4.1: Disallow Token-Based Publishing

1. Go to: `https://www.npmjs.com/settings/peac/packages`
2. Navigate to organization settings
3. Under "Publishing access", enable **"Require 2FA and disallow tokens"**

This prevents anyone from publishing with a stolen npm token. Only the GitHub workflow can publish.

### Step 4.2: Remove Any Old NPM_TOKEN Secrets

1. Go to: `https://github.com/peacprotocol/peac/settings/secrets/actions`
2. If `NPM_TOKEN` exists, delete it (no longer needed)

## Troubleshooting

### "Not authorized to publish package"

The Trusted Publisher is not configured for this package.

1. Go to the package's access page on npm
2. Add the Trusted Publisher configuration (see Step 2.2)

### "Environment 'npm-production' does not exist"

The GitHub environment is missing.

1. Create the environment (see Step 1.1)

### "OIDC token request failed"

The workflow doesn't have the right permissions.

1. Check that `id-token: write` is in the workflow permissions
2. Ensure you're using a GitHub-hosted runner (not self-hosted)

### "Workflow file mismatch"

The workflow filename in npm doesn't match.

1. In npm Trusted Publisher config, ensure workflow filename is exactly `publish.yml`
2. Not `publish.yaml`, not `.github/workflows/publish.yml`

### "Environment mismatch"

The environment name in npm doesn't match GitHub.

1. In npm, ensure environment is exactly `npm-production`
2. In GitHub, the environment must be named exactly `npm-production`

## Summary Checklist

- [ ] GitHub environment `npm-production` created
- [ ] Environment has required reviewers
- [ ] Environment allows only `main` branch
- [ ] All 36 packages have Trusted Publisher configured
- [ ] Dry run workflow passes
- [ ] Production publish works
- [ ] Provenance verification works (`npm audit signatures`)
- [ ] (Optional) Token-based publishing disabled in npm org

## References

- [npm Trusted Publishing Documentation](https://docs.npmjs.com/trusted-publishers)
- [npm Provenance Documentation](https://docs.npmjs.com/generating-provenance-statements)
- [GitHub Environments Documentation](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
