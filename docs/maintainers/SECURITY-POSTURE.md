# Maintainer Security Posture

This document records the security controls applied to the PEAC Protocol npm organization and GitHub repository. It distinguishes between controls that are verified today and controls that are in transition.

## npm Organization

### Authentication

- **2FA:** Required for all org members (enforced at org level)
- **Session policy:** npm sessions expire after 30 days

### Package Publishing

- **Publish workflow:** `.github/workflows/publish.yml` is the sole publish path; no manual `npm publish`
- **Provenance attestations:** Generated automatically on every publish via `--provenance` flag
- **Publish manifest:** `scripts/publish-manifest.json` is the single source of truth for publishable packages (28 packages)

### OIDC Trusted Publishing (In Transition)

OIDC trusted publishing eliminates long-lived npm tokens by using GitHub Actions OIDC for authentication.

| State                 | Count    | Details                                                 |
| --------------------- | -------- | ------------------------------------------------------- |
| **Configured**        | 9 of 28  | Using OIDC trusted publishing today                     |
| **Pending migration** | 19 of 28 | Will be migrated via `npm trust` CLI (tracked in PR 6a) |

**Target state:** All 28 publishable packages use OIDC trusted publishing with no long-lived npm tokens.

**Migration command:**

```bash
bash scripts/setup-trusted-publishing.sh
```

This requires npm CLI >= 11.5.1, an active npm session with 2FA, and org admin or package owner role.

## GitHub Repository

### Branch Protection

- **main branch:** Protected. Requires PR review, status checks, and linear history
- **Force push:** Disabled on main
- **Admin bypass:** Disabled

### CI Security

- **CodeQL:** Security-extended analysis on every PR and weekly schedule
- **Dependency review:** `.github/workflows/dependency-review.yml` blocks PRs with critical vulnerabilities
- **SHA-pinned actions:** All GitHub Actions are pinned to full commit SHAs (not tags)
- **Minimal permissions:** Workflows use least-privilege `permissions` blocks

### Secrets Management

- **GitHub token:** Uses default `GITHUB_TOKEN` with minimal scope
- **No third-party secret services:** All secrets managed via GitHub native secrets
- **npm tokens:** 9 packages use OIDC (no token); 19 packages use scoped automation tokens (pending OIDC migration)

## Verification

Consumers can verify the current security posture:

```bash
# Verify npm provenance (use temp project)
mkdir /tmp/peac-verify && cd /tmp/peac-verify
npm init -y && npm install @peac/protocol@next
npm audit signatures
cd - && rm -rf /tmp/peac-verify

# Check OIDC migration status
node -p "const m=require('./scripts/publish-manifest.json'); console.log('Configured:', 28 - (m.pendingTrustedPublishing?.length || 0), 'Pending:', m.pendingTrustedPublishing?.length || 0)"

# Run full authoritative gate suite
bash scripts/release/run-gates.sh --target stable --write-release-artifacts
```

See `docs/VERIFY-RELEASE.md` for the full verification guide.
