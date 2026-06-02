/**
 * Shared nested package path resolution for publish-manifest checks.
 *
 * INVARIANT: Every nested workspace package (packages/adapters/*,
 * packages/mappings/*, packages/rails/*, packages/capture/*,
 * packages/transport/*, packages/net/*) must have an entry here.
 * The flat-path fallback only works for top-level packages like
 * packages/kernel. Failure to add an entry causes CI publish-manifest
 * checks to fail with "package.json not found."
 *
 * When adding a new nested package, update this single mapping.
 * Both check-publish-closure.ts and check-manifest-invariants.ts
 * consume this shared resolver.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

const NESTED_MAPPINGS: Record<string, string> = {
  'adapter-core': 'packages/adapters/core',
  'adapter-openclaw': 'packages/adapters/openclaw',
  'adapter-managed-agents': 'packages/adapters/managed-agents',
  'adapter-runtime-governance': 'packages/adapters/runtime-governance',
  'adapter-x402': 'packages/adapters/x402',
  'adapter-x402-daydreams': 'packages/adapters/x402/daydreams',
  'adapter-x402-fluora': 'packages/adapters/x402/fluora',
  'adapter-x402-pinata': 'packages/adapters/x402/pinata',
  'adapter-openai-compatible': 'packages/adapters/openai-compatible',
  'adapter-eat': 'packages/adapters/eat',
  'adapter-did': 'packages/adapters/did',
  'rails-x402': 'packages/rails/x402',
  'rails-stripe': 'packages/rails/stripe',
  'rails-card': 'packages/rails/card',
  'rails-razorpay': 'packages/rails/razorpay',
  'mappings-mcp': 'packages/mappings/mcp',
  'mappings-a2a': 'packages/mappings/a2a',
  'mappings-acp': 'packages/mappings/acp',
  'mappings-aipref': 'packages/mappings/aipref',
  'mappings-rsl': 'packages/mappings/rsl',
  'mappings-tap': 'packages/mappings/tap',
  'mappings-ucp': 'packages/mappings/ucp',
  'mappings-content-signals': 'packages/mappings/content-signals',
  'mappings-paymentauth': 'packages/mappings/paymentauth',
  'mappings-intoto': 'packages/mappings/intoto',
  'mappings-slsa': 'packages/mappings/slsa',
  'capture-core': 'packages/capture/core',
  'capture-node': 'packages/capture/node',
  // @peac/pref and @peac/sdk were archived in v0.13.0 and removed from HEAD
  // (historical source recoverable from git history and tags). Lookups for
  // these short names are intentionally absent; consumers should migrate (see
  // docs/MIGRATION_CURRENT.md).
  'net-node': 'packages/net/node',
  'transport-grpc': 'packages/transport/grpc',
};

/**
 * Resolve an @peac/* npm package name to its workspace directory path.
 * Checks flat layout first (packages/<name>), then nested mappings.
 */
export function resolvePackagePath(npmName: string): string {
  const shortName = npmName.replace('@peac/', '');

  const flatDir = path.join(ROOT, 'packages', shortName);
  if (fs.existsSync(path.join(flatDir, 'package.json'))) {
    return flatDir;
  }

  if (NESTED_MAPPINGS[shortName]) {
    return path.join(ROOT, NESTED_MAPPINGS[shortName]);
  }

  return flatDir;
}

export { NESTED_MAPPINGS };
