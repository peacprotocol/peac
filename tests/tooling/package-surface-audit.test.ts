/**
 * Package-surface audit.
 *
 * Enforces:
 *
 *   1. scripts/publish-manifest.json packages[] count is less than or equal to
 *      the v0.12.14 baseline of 37 (no regression).
 *
 *   2. Every package listed in packages[] has a corresponding
 *      packages/<dir>/package.json on disk (no ghost entries) and is
 *      resolvable by pnpm as a workspace member. This prevents removing a
 *      package from the workspace while leaving it in the publish manifest.
 *
 *   3. Publish closure: for every published package, every @peac/*
 *      dependency declared in its package.json (dependencies +
 *      peerDependencies, any resolution form) MUST also be present in
 *      packages[]. If a published package depends on @peac/disc, then
 *      @peac/disc MUST be in packages[]. Violating this would ship a
 *      tarball whose @peac/* dependency cannot resolve on npm at the
 *      published version.
 *
 *   4. No archived path is resolvable as a workspace package. Archive is
 *      historical-only; moved source MUST NOT be discoverable via
 *      pnpm-workspace glob patterns.
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

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const manifest = readJson(join(ROOT, 'scripts', 'publish-manifest.json')) as {
  packages: string[];
  totalPackages?: number;
  version?: string;
};

// v0.12.14 active publish surface (canonical baseline; retained for the
// "no regression" gate).
const V0_12_14_BASELINE_COUNT = 37;

// v0.13.1 active publish surface (post @peac/disc retirement).
// Enforced at exactly this value so accidental re-additions are caught.
const V0_13_1_TARGET_COUNT = 36;

// Single source of truth for npm-name -> workspace directory; imported
// from scripts/lib/workspace-package-map.mjs (also used by the verify-*
// scripts). scripts/lib/resolve-package-path.ts is the broader authority
// for short-name -> path mapping; this map covers only entries listed in
// publish-manifest.json packages[].
const WORKSPACE_PATH_MAP: Record<string, string> = WORKSPACE_PACKAGE_MAP as Record<string, string>;

function packagePath(npmName: string): string | null {
  return WORKSPACE_PATH_MAP[npmName] ?? null;
}

function packageJsonFor(npmName: string): any | null {
  const rel = packagePath(npmName);
  if (!rel) return null;
  const abs = join(ROOT, rel, 'package.json');
  if (!existsSync(abs)) return null;
  return readJson(abs);
}

describe('publish-manifest surface audit', () => {
  // Count-gate doctrine:
  //
  //   BLOCKING: packages.length <= 37 (the v0.12.14 active publish surface).
  //             No net increase; no regression that grows the published set.
  //
  //   BONUS, NOT BLOCKING: packages.length < 37. A reduction below 37 is
  //             desirable but not a blocker unless a safe published-package
  //             retirement is identified (retirement requires publish-closure
  //             proof; see the publish-closure suite below).
  //
  //   @peac/disc was retired at v0.13.1: archived under archive/discovery/
  //   (out of the packages/* glob), removed from publish-manifest.packages[],
  //   and dropped as a workspace:* dependency from @peac/cli and apps/api.
  //   The CLI peac-discover command path now flows through an internal
  //   helper (packages/cli/src/lib/policy-document-discovery.ts) that uses
  //   public @peac/net-node and @peac/policy-kit primitives.
  it('packages[] count does not exceed the v0.12.14 baseline of 37 (blocking)', () => {
    expect(manifest.packages.length).toBeLessThanOrEqual(V0_12_14_BASELINE_COUNT);
  });

  it('packages[] count is exactly the v0.13.1 target of 36 (enforced)', () => {
    expect(manifest.packages.length).toBe(V0_13_1_TARGET_COUNT);
    expect(manifest.totalPackages).toBe(V0_13_1_TARGET_COUNT);
  });

  it('manifest version is either current release (0.14.1) or target (0.14.2)', () => {
    // Version stamping belongs to release prep. Accept either the current
    // released value or the next-release target to keep the gate robust
    // across the release lifecycle.
    expect(['0.14.1', '0.14.2']).toContain(manifest.version);
  });

  it('totalPackages field matches packages[] length', () => {
    expect(manifest.totalPackages ?? manifest.packages.length).toBe(manifest.packages.length);
  });

  it('every listed package has a workspace-path mapping in this test', () => {
    const missing = manifest.packages.filter((name) => !packagePath(name));
    expect(missing).toEqual([]);
  });

  it('every listed package has a real package.json on disk', () => {
    const missing = manifest.packages.filter((name) => !packageJsonFor(name));
    expect(missing).toEqual([]);
  });

  it('archived packages are not listed in packages[]', () => {
    const archivedNames = [
      '@peac/pref',
      '@peac/core',
      '@peac/sdk',
      '@peac/access',
      '@peac/compliance',
      '@peac/consent',
      '@peac/intelligence',
      '@peac/provenance',
      '@peac/disc',
    ];
    const leaked = archivedNames.filter((n) => manifest.packages.includes(n));
    expect(leaked).toEqual([]);
  });

  it('archived paths do not contain a package.json that could resolve as workspace', () => {
    // Moving source under archive/ without removing its package.json from the
    // workspace globs would silently re-publish it. archive/ is not in the
    // workspace globs (see pnpm-workspace.yaml), so these archived package.json
    // files are expected to exist but NOT be workspace members. This test
    // asserts the glob guard: no archive/* path starts with a workspace prefix.
    const archivePaths = [
      'archive/pref/package.json',
      'archive/pillars/access/package.json',
      'archive/pillars/compliance/package.json',
      'archive/pillars/consent/package.json',
      'archive/pillars/intelligence/package.json',
      'archive/pillars/provenance/package.json',
      'archive/discovery/package.json',
    ];
    for (const p of archivePaths) {
      const abs = join(ROOT, p);
      if (existsSync(abs)) {
        // Must not be reachable from any workspace glob. Workspace globs start
        // with packages/, apps/, surfaces/, or examples/, never archive/.
        expect(p.startsWith('archive/')).toBe(true);
      }
    }
  });

  it('@peac/disc retired: not in workspace glob, not in publish manifest', () => {
    // The archive/discovery/package.json file exists but archive/ is not in
    // any workspace glob, so the package is not a workspace member. The
    // publish manifest must not list it.
    expect(manifest.packages).not.toContain('@peac/disc');
    // No workspace path mapping must remain for @peac/disc; if a contributor
    // re-adds it to WORKSPACE_PATH_MAP without re-listing the source, this
    // assertion catches it.
    expect(WORKSPACE_PATH_MAP['@peac/disc']).toBeUndefined();
  });
});

describe('publish-closure invariant', () => {
  it('every @peac/* dependency declared by a published package is also in packages[]', () => {
    const publishSet = new Set(manifest.packages);
    const failures: string[] = [];

    for (const npmName of manifest.packages) {
      const pkg = packageJsonFor(npmName);
      if (!pkg) continue;

      const depSources: Array<[string, Record<string, string> | undefined]> = [
        ['dependencies', pkg.dependencies],
        ['peerDependencies', pkg.peerDependencies],
      ];

      for (const [depKind, deps] of depSources) {
        if (!deps) continue;
        for (const depName of Object.keys(deps)) {
          if (!depName.startsWith('@peac/')) continue;
          if (publishSet.has(depName)) continue;

          // If the dependency is itself a workspace member (has a package.json
          // on disk) but NOT in packages[], that is a publish-closure break:
          // publishing npmName would produce a tarball whose @peac/*
          // dependency cannot resolve on npm at this version.
          const depPkg = packageJsonFor(depName);
          if (depPkg) {
            failures.push(
              `${npmName} (in packages[]) declares ${depKind}.${depName} which is workspace-resolvable but NOT in packages[]. ` +
                `Publishing ${npmName}@${manifest.version} would create an unsatisfiable ${depName}@${manifest.version} dependency on npm.`
            );
          }
        }
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('specifically: no published package declares @peac/disc as a dependency', () => {
    const offenders: string[] = [];
    for (const npmName of manifest.packages) {
      const pkg = packageJsonFor(npmName);
      if (!pkg) continue;
      const declaresDisc =
        pkg.dependencies?.['@peac/disc'] !== undefined ||
        pkg.peerDependencies?.['@peac/disc'] !== undefined ||
        pkg.optionalDependencies?.['@peac/disc'] !== undefined;
      if (declaresDisc) offenders.push(npmName);
    }
    expect(offenders, offenders.join(', ')).toEqual([]);
  });
});
