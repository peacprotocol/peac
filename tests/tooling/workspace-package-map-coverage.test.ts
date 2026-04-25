/**
 * Coverage gate for scripts/lib/workspace-package-map.mjs.
 *
 * The map is the single source of truth for the publish-manifest -> workspace
 * directory mapping. This test asserts:
 *
 *   1. Every entry in scripts/publish-manifest.json packages[] has exactly
 *      ONE mapping in WORKSPACE_PACKAGE_MAP. No missing entries; no extra
 *      entries.
 *   2. Each mapped directory exists and its package.json `name` field
 *      matches the map key. This catches rename drift (a package renamed
 *      in package.json without the map being updated, or vice versa).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- pure-data .mjs module
import { WORKSPACE_PACKAGE_MAP } from '../../scripts/lib/workspace-package-map.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const manifest = JSON.parse(
  readFileSync(join(ROOT, 'scripts', 'publish-manifest.json'), 'utf8')
) as { packages: string[] };

const MAP = WORKSPACE_PACKAGE_MAP as Record<string, string>;

describe('workspace-package-map: coverage vs publish-manifest', () => {
  it('every publish-manifest entry has exactly one mapping', () => {
    const missing = manifest.packages.filter((name) => !(name in MAP));
    expect(missing, `missing mappings: ${missing.join(', ')}`).toEqual([]);
  });

  it('no extra mappings beyond publish-manifest', () => {
    const publishSet = new Set(manifest.packages);
    const extras = Object.keys(MAP).filter((name) => !publishSet.has(name));
    expect(
      extras,
      `extra mappings (in map but not in publish-manifest): ${extras.join(', ')}`
    ).toEqual([]);
  });

  it('each mapped directory exists and its package.json name matches the map key', () => {
    const failures: string[] = [];
    for (const [npmName, rel] of Object.entries(MAP)) {
      const pkgPath = join(ROOT, rel, 'package.json');
      if (!existsSync(pkgPath)) {
        failures.push(`${npmName}: ${rel}/package.json missing`);
        continue;
      }
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (pkg.name !== npmName) {
        failures.push(`${npmName}: ${rel}/package.json declares name "${pkg.name}" (drift)`);
      }
    }
    expect(failures, '\n' + failures.join('\n')).toEqual([]);
  });
});
