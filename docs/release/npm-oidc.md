# npm Trusted Publishing with GitHub OIDC

This document describes how to configure npm Trusted Publishing for PEAC Protocol packages using GitHub Actions OIDC.

## Overview

npm Trusted Publishing allows GitHub Actions to publish packages without storing npm tokens as secrets. Instead, it uses OpenID Connect (OIDC) to establish trust between GitHub and npm.

**Benefits:**

- No npm tokens stored in GitHub Secrets (eliminates credential theft risk)
- Automatic provenance attestation (supply chain security)
- Granular control per package
- Audit trail of who published what

**References:**

- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements)

## Hard Requirements

Before using Trusted Publishing, ensure these requirements are met:

| Requirement          | Value             | Notes                                   |
| -------------------- | ----------------- | --------------------------------------- |
| npm CLI version      | >= 11.5.1         | Required for OIDC support               |
| Runner type          | GitHub-hosted     | Self-hosted runners NOT supported       |
| Workflow permissions | `id-token: write` | Required for OIDC token                 |
| Package access       | Public or scoped  | Private packages need additional config |

The workflow automatically installs npm 11.5.1 to meet this requirement.

## Prerequisites

### 1. npm Organization Access

You must be an owner or admin of the `@peac` npm organization to configure Trusted Publishers.

### 2. GitHub Repository Settings

The repository must have the following configured:

1. **Protected Environment**: Create an environment named `npm-production` with protection rules
2. **Required Reviewers**: Add at least one reviewer for production publishes
3. **Wait Timer** (optional): Add a delay before deployment

### 3. npm Package Configuration

Each `@peac/*` package must have Trusted Publishing configured on npm.

## Configuration Steps

### Step 1: Configure Trusted Publisher for Each Package

For **each** `@peac/*` package you want to publish:

1. Go to `https://www.npmjs.com/package/@peac/<pkg>/access`
2. Click "Manage trusted publishers"
3. Add a new publisher with these settings:

   | Field             | Value            |
   | ----------------- | ---------------- |
   | Provider          | GitHub Actions   |
   | Owner             | `peacprotocol`   |
   | Repository        | `peac`           |
   | Workflow filename | `publish.yml`    |
   | Environment       | `npm-production` |

4. Save the configuration

**Important:** You must do this for all 36 public packages. Without this configuration, publishing will fail with a permission error.

### Step 2: Create GitHub Environment

1. Go to Repository Settings > Environments
2. Create new environment: `npm-production`
3. Configure protection rules:
   - Required reviewers: Add maintainers
   - Wait timer: Optional (e.g., 5 minutes)
   - Deployment branches: Only allow `main`

### Step 3: Verify Workflow Permissions

The publish workflow requires these permissions:

```yaml
permissions:
  contents: read # Read repository
  id-token: write # OIDC token for npm
```

These are already configured in `.github/workflows/publish.yml`.

## How It Works

### Publish Flow

1. Tag push (e.g., `v0.10.4`) triggers workflow
2. Preflight job validates tag, version, and quality gates
3. Publish job runs in `npm-production` environment (requires approval)
4. GitHub OIDC issues a token to npm
5. npm verifies the token matches configured Trusted Publisher
6. Package is published with provenance attestation

### Provenance Attestation

When using Trusted Publishing, npm automatically generates provenance attestation. The `--provenance` flag is not strictly required since Trusted Publishing enables it by default, but we include it explicitly for clarity.

npm provenance records:

- The source repository and commit SHA
- The workflow that published the package
- A cryptographic signature from npm

**Verifying provenance:** To verify signatures, run `npm audit signatures` in a project that has these packages installed (not as a standalone per-package command):

```bash
# In a project with @peac packages installed
npm audit signatures
```

## Workflow Usage

### Tag-Triggered Publish (Production)

Push a tag to trigger automatic publish:

```bash
git tag v0.10.4
git push origin v0.10.4
```

This runs the full workflow with environment approval.

### Manual Dry Run

Test the workflow without publishing:

1. Go to Actions > Publish to npm
2. Click "Run workflow"
3. Set `dry_run: true`
4. Click "Run workflow"

The dry run actually runs `pnpm publish --dry-run` to validate packaging.

### Manual Production Publish

For manual production publish (rare):

1. Go to Actions > Publish to npm
2. Click "Run workflow"
3. Set `dry_run: false`
4. Set `tag_override: v0.10.4`
5. Click "Run workflow"
6. Approve the deployment in the environment

## Post-Publish Hardening

After verifying the first successful publish works correctly:

### Disallow Token-Based Publishing (Recommended)

Once Trusted Publishing is working, you can lock down the npm org to only allow OIDC-based publishes:

1. Go to npm org settings: `https://www.npmjs.com/settings/peac/members`
2. Navigate to "Publishing access"
3. Enable "Require 2FA and disallow tokens"

This prevents anyone from publishing with a stolen token, since only the GitHub workflow can publish.

### Verify Provenance

After each publish, verify provenance is attached by installing packages in a test project:

```bash
# In a test project
npm install @peac/protocol@next
npm audit signatures
# Expected: all packages have valid signatures
```

## Troubleshooting

### "Not authorized to publish"

**Cause:** Trusted Publisher not configured for this package.

**Fix:** Configure Trusted Publisher on npm for the package (see Step 1).

### "Environment npm-production does not exist"

**Cause:** GitHub environment not created.

**Fix:** Create the environment in repository settings (see Step 2).

### "OIDC token request failed"

**Cause:** Workflow permissions incorrect.

**Fix:** Ensure `id-token: write` is in workflow permissions.

### "npm version too old for OIDC"

**Cause:** npm CLI < 11.5.1.

**Fix:** The workflow automatically installs npm@11.5.1. If running locally, upgrade npm.

### "Version already published"

**Cause:** This version was already published to npm.

**Fix:** The workflow uses `--skip-existing` to skip already-published packages safely.

### "Self-hosted runner not supported"

**Cause:** Trusted Publishing requires GitHub-hosted runners.

**Fix:** Use `runs-on: ubuntu-24.04` (already configured in workflow).

## Security Considerations

### Token Scope

The OIDC token is:

- Short-lived (expires in minutes)
- Scoped to the specific workflow run
- Only valid for packages with matching Trusted Publisher config
- Cannot be extracted or reused

### Environment Protection

The `npm-production` environment provides:

- Manual approval before publish
- Deployment logs for audit
- Branch restrictions (main only)

### Provenance Verification

Users can verify published packages came from our repository by running `npm audit signatures` in a project with PEAC packages installed:

```bash
# In a project with @peac packages
npm audit signatures
# Should show: all signatures verified
```

### No Long-Lived Tokens

Unlike traditional npm publish:

- No `NPM_TOKEN` secret to rotate
- No risk of token theft from CI logs
- No risk of token appearing in error messages

## Package List

The following 36 packages need Trusted Publisher configuration:

```text
@peac/adapter-core
@peac/adapter-x402
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
@peac/mappings-ucp
@peac/net-node
@peac/pay402
@peac/policy-kit
@peac/pref
@peac/protocol
@peac/rails-card
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

The canonical list is maintained in `scripts/publish-manifest.json`.

## Step-by-Step Setup Checklist

Use this checklist when setting up Trusted Publishing for the first time:

### On npmjs.com (for each package)

- [ ] Log in to npmjs.com as org owner
- [ ] For each package, go to Settings > Trusted Publishers
- [ ] Add GitHub Actions publisher:
  - Owner: `peacprotocol`
  - Repository: `peac`
  - Workflow: `publish.yml`
  - Environment: `npm-production`

### On GitHub

- [ ] Go to Settings > Environments
- [ ] Create `npm-production` environment
- [ ] Add required reviewers
- [ ] Set deployment branches to `main` only
- [ ] Optionally add wait timer

### Verification

- [ ] Run workflow with `dry_run: true` to test
- [ ] Push a test tag to trigger real publish
- [ ] Verify packages on npm (`npm view @peac/kernel@next`)
- [ ] Install in test project and run `npm audit signatures`

### Post-Success Hardening

- [ ] Enable "Require 2FA and disallow tokens" in npm org
- [ ] Document the setup in team wiki

## Related Documentation

- [Releasing Guide](../maintainers/RELEASING.md)
- [npm Publish Policy](../maintainers/NPM_PUBLISH_POLICY.md)
- [Publish Workflow](../../.github/workflows/publish.yml)
- [Publish Manifest](../../scripts/publish-manifest.json)
