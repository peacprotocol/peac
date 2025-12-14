# Dependency Management Policy

This document describes how we manage dependency updates in the PEAC Protocol monorepo.

## Risk Classification

### Group 1: Low Risk (Patch/Minor)

- Patch updates to any dependency
- Minor updates to dev-only dependencies (prettier, eslint plugins, vitest)
- Minor updates to well-tested utilities (lodash, date-fns)

**Process:** Merge individually after CI passes. One PR at a time.

### Group 2: High Risk (Requires Review)

- Minor updates to core runtime deps:
  - `zod` (schema validation)
  - `@noble/ed25519` (cryptography)
  - Any package in `@peac/crypto`, `@peac/schema`, `@peac/protocol`
- Any update that changes test snapshots or golden files
- Updates to TypeScript compiler

**Process:** Review changes carefully. Run full test suite locally. Document any behavior changes.

### Group 3: Major Updates (Project-Level)

- Major version bumps to any dependency
- Updates that require code changes to compile
- Updates with known breaking changes

**Process:** Close the dependabot PR. Create a dedicated issue/RFC. Implement in a feature branch with migration notes.

## Decision Rules

1. **Never bundle multiple major upgrades** in a single PR
2. **If golden tests change**, explicitly review and document why
3. **Core runtime deps** (crypto, schema, protocol) are high risk even for minor updates
4. **Tooling-only updates** (prettier, lint config) can be grouped if tests pass
5. **Security updates** take priority but still follow the review process

## Merge Process

For each dependabot PR:

1. Wait for CI to complete and pass
2. Classify the update by risk group
3. For Group 1 (low risk):
   - Verify CI green
   - Optionally run `pnpm build && pnpm test:core` locally
   - Merge with message: `chore(deps): bump <pkg> from x to y`
4. For Group 2 (high risk):
   - Run full test suite locally
   - Review changelog of the dependency
   - Document any behavior changes in PR description
   - Merge with detailed message
5. For Group 3 (major):
   - Close the PR
   - Open an issue: "Upgrade <pkg> to vX"
   - Plan the upgrade as a mini-project

## Automation (Future)

Consider these improvements if dependabot PR volume becomes high:

- Group low-risk PRs into weekly batches
- Separate runtime deps from dev deps in dependabot config
- Auto-merge patch updates to dev dependencies
- Disable auto-PRs for major versions

## Security Updates

Security updates are prioritized but still follow review:

1. **Critical/High severity**: Review and merge within 24 hours
2. **Medium severity**: Review and merge within 1 week
3. **Low severity**: Batch with regular updates

Always verify the security advisory is legitimate before merging.
