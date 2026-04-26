/**
 * Single-source-of-truth map of npm package name -> workspace directory
 * (relative to the repo root).
 *
 * Consumers:
 *   - tests/tooling/package-surface-audit.test.ts
 *   - tests/tooling/private-package-deps.test.ts
 *   - scripts/verify-dist-private-leaks.mjs
 *   - scripts/verify-tarball-contents.mjs
 *   - scripts/release/pack-install-smoke.mjs
 *
 * Keep ONLY entries for packages that appear in
 * scripts/publish-manifest.json packages[]. Workspace-private packages
 * (e.g., @peac/registries) are intentionally absent; the publish-manifest
 * is the canonical "is this published?" signal, and adding private packages
 * here would muddy the consumers' semantics.
 *
 * The accompanying tests/tooling/workspace-package-map-coverage.test.ts
 * asserts that:
 *   1. every entry in publish-manifest.json packages[] has exactly one
 *      mapping here, and
 *   2. every mapped directory has a package.json whose `name` matches the
 *      key in this map.
 */
export const WORKSPACE_PACKAGE_MAP = Object.freeze({
  '@peac/kernel': 'packages/kernel',
  '@peac/schema': 'packages/schema',
  '@peac/crypto': 'packages/crypto',
  '@peac/telemetry': 'packages/telemetry',
  '@peac/capture-core': 'packages/capture/core',
  '@peac/capture-node': 'packages/capture/node',
  '@peac/protocol': 'packages/protocol',
  '@peac/control': 'packages/control',
  '@peac/audit': 'packages/audit',
  '@peac/middleware-core': 'packages/middleware-core',
  '@peac/middleware-express': 'packages/middleware-express',
  '@peac/contracts': 'packages/contracts',
  '@peac/http-signatures': 'packages/http-signatures',
  '@peac/jwks-cache': 'packages/jwks-cache',
  '@peac/policy-kit': 'packages/policy-kit',
  '@peac/adapter-core': 'packages/adapters/core',
  '@peac/mappings-mcp': 'packages/mappings/mcp',
  '@peac/mappings-acp': 'packages/mappings/acp',
  '@peac/mappings-paymentauth': 'packages/mappings/paymentauth',
  '@peac/mappings-ucp': 'packages/mappings/ucp',
  '@peac/mappings-a2a': 'packages/mappings/a2a',
  '@peac/rails-x402': 'packages/rails/x402',
  '@peac/adapter-x402': 'packages/adapters/x402',
  '@peac/adapter-openclaw': 'packages/adapters/openclaw',
  '@peac/adapter-managed-agents': 'packages/adapters/managed-agents',
  '@peac/adapter-runtime-governance': 'packages/adapters/runtime-governance',
  '@peac/mappings-content-signals': 'packages/mappings/content-signals',
  '@peac/adapter-openai-compatible': 'packages/adapters/openai-compatible',
  '@peac/mcp-server': 'packages/mcp-server',
  '@peac/cli': 'packages/cli',
  '@peac/net-node': 'packages/net/node',
  '@peac/adapter-eat': 'packages/adapters/eat',
  '@peac/adapter-did': 'packages/adapters/did',
  '@peac/transport-grpc': 'packages/transport/grpc',
  '@peac/mappings-intoto': 'packages/mappings/intoto',
  '@peac/mappings-slsa': 'packages/mappings/slsa',
});
