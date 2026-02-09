# Release Invariants

Rules and procedures that apply to every PEAC Protocol release.

---

## Authentication

- npm publishing uses **OIDC Trusted Publishing only** (no long-lived tokens)
- Each `@peac/*` package must have Trusted Publishing configured on npmjs.com:
  - Repository: `peacprotocol/peac`
  - Workflow: `publish.yml`
  - Environment: `npm-production`
- New packages must be bootstrapped locally before OIDC works (first publish creates the package on npm)

## Publish Workflow

1. All PRs merged to `main`
2. Release gate passes on `main`:
   ```bash
   pnpm build && pnpm lint && pnpm typecheck:core && pnpm test
   bash scripts/guard.sh
   pnpm format:check
   ```
3. All manifest package versions match the release version
4. Annotated tag pushed: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`
5. Tag push triggers `publish.yml` workflow
6. Approve the `npm-production` environment gate in GitHub Actions
7. Workflow publishes all manifest packages with `--tag next` (v0.x policy)
8. Promote dist-tags: `npm dist-tag add "@peac/<pkg>@X.Y.Z" latest` for all manifest packages

## Dist-Tag Policy

- v0.x releases publish to `next`, then are promoted to `latest` after verification
- v1.0+ releases will publish directly to `latest`
- Source of truth for package list: `scripts/publish-manifest.json`

## Tarball Hygiene

Tarballs must not contain:

- `reference/` directories
- `*.local.md` files
- `.env*` files
- `__tests__/` or test fixtures
- `.turbo/` or `.DS_Store`
- Build artifacts outside `dist/` (no `.d.ts` in `src/`)

The `files` field in each package.json controls what gets packed. Prefer explicit inclusion over broad `"dist"` (which can leak test output).

## Smoke Test (Consumer Perspective)

After publish, verify in a clean directory outside the monorepo:

```bash
mkdir -p /tmp/peac-smoke && cd /tmp/peac-smoke
npm init -y
npm i @peac/cli@X.Y.Z @peac/protocol@X.Y.Z

# CLI loads
npx peac --help

# ESM import works
node --input-type=module -e "
import { issue, verifyLocal, generateKeypair } from '@peac/protocol';
const { privateKey, publicKey } = await generateKeypair();
const { jws } = await issue({
  iss: 'https://test.example.com',
  aud: 'https://consumer.example.com',
  subject: 'https://test.example.com/api/v1',
  amt: 100, cur: 'USD', rail: 'x402', reference: 'tx_test',
  privateKey, kid: 'test-key',
});
const result = await verifyLocal(jws, publicKey, {
  issuer: 'https://test.example.com',
  audience: 'https://consumer.example.com',
});
console.log('valid:', result.valid, 'variant:', result.variant);
"
```

## Verification Record

After each release, create `reference/releases/vX.Y.Z.md` containing:

- Tag commit hash
- CI run IDs
- npm dist-tag verification output
- Smoke test results
- Known issues deferred

## Manifest Closure

Before tagging, the publish-manifest closure check must pass:

```bash
npx tsx scripts/check-publish-closure.ts
```

This verifies no manifest package has an `@peac/*` runtime dependency that is missing from the manifest or uses unresolved `workspace:*`.
