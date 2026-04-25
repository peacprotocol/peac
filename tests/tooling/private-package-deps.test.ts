/**
 * P0 invariant: no published package depends at runtime on a workspace-private
 * package.
 *
 * Direction-of-dependency rule: private packages may import from public
 * packages (e.g., @peac/registries imports from @peac/kernel). Public packages
 * MUST NOT import from private packages. A consumer running
 *   npm install @peac/kernel@0.13.1
 * receives only the npm-published packages; if @peac/kernel were to declare or
 * emit a runtime import of @peac/registries, the install would 404 or the
 * import would fail at module-resolution time. This is a release-breaking
 * class of bug.
 *
 * This test enforces:
 *   1. For every package listed in scripts/publish-manifest.json packages[],
 *      its package.json's dependencies, peerDependencies, and
 *      optionalDependencies contain ZERO of the four reboot package names:
 *        @peac/registries, @peac/record-core, @peac/compat, @peac/resolver-http
 *
 * The dist-leak grep for emitted JS / .d.ts is enforced by a separate script
 * (scripts/verify-dist-private-leaks.mjs).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Single source of truth for the publish-manifest -> workspace-path mapping.
// @ts-expect-error -- pure-data .mjs module
import { WORKSPACE_PACKAGE_MAP } from '../../scripts/lib/workspace-package-map.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const PRIVATE_REBOOT_PACKAGE_NAMES = [
  '@peac/registries',
  '@peac/record-core',
  '@peac/compat',
  '@peac/resolver-http',
];

const WORKSPACE_PATH_MAP: Record<string, string> = WORKSPACE_PACKAGE_MAP as Record<string, string>;

interface PackageJson {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const manifest = readJson<{ packages: string[] }>(join(ROOT, 'scripts', 'publish-manifest.json'));

describe('private-package dependency invariant (P0)', () => {
  it('no published package declares a runtime dependency on a workspace-private reboot package', () => {
    const failures: string[] = [];

    for (const npmName of manifest.packages) {
      const rel = WORKSPACE_PATH_MAP[npmName];
      if (!rel) {
        failures.push(
          `${npmName}: no workspace-path mapping in this test (add to WORKSPACE_PATH_MAP)`
        );
        continue;
      }
      const pkgPath = join(ROOT, rel, 'package.json');
      if (!existsSync(pkgPath)) {
        failures.push(`${npmName}: package.json missing at ${rel}/package.json`);
        continue;
      }
      const pkg = readJson<PackageJson>(pkgPath);

      const depKinds = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const;
      for (const depKind of depKinds) {
        const deps = pkg[depKind] ?? {};
        for (const reboot of PRIVATE_REBOOT_PACKAGE_NAMES) {
          if (deps[reboot] !== undefined) {
            failures.push(
              `${npmName}.${depKind}.${reboot} -- a published package may not depend on a workspace-private package; ` +
                `move the implementation inline (e.g. under src/_internal/) or restructure the boundary.`
            );
          }
        }
      }
    }

    expect(failures, '\n' + failures.join('\n')).toEqual([]);
  });
});
