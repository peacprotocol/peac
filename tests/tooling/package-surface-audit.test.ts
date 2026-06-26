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
 *   4. Retired package names never re-enter the active workspace or publish
 *      surface. The pre-0.10 archive/ tree was removed from HEAD (recoverable
 *      from git history and tags); this is enforced by name and by asserting
 *      pnpm-workspace.yaml declares no archive/ glob, independent of any
 *      archive/ directory existing.
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

// A workspace glob "re-introduces archive/" only if it targets the root
// archive/ tree. Matching the bare substring "archive" would over-reject
// unrelated future names (for example packages/archive-reader); restrict the
// check to the root archive path.
function isRootArchiveGlob(glob: string): boolean {
  const normalized = glob.replace(/\\/g, '/').replace(/^\.\//, '');
  return normalized === 'archive' || normalized === 'archive/' || normalized.startsWith('archive/');
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
  //   @peac/disc was retired at v0.13.1: removed from
  //   publish-manifest.packages[] and dropped as a workspace:* dependency
  //   from @peac/cli and apps/api. Its historical source was removed from
  //   HEAD and remains recoverable from git history and tags. The CLI
  //   peac-discover command path now flows through an internal helper
  //   (packages/cli/src/lib/policy-document-discovery.ts) that uses public
  //   @peac/net-node and @peac/policy-kit primitives.
  it('packages[] count does not exceed the v0.12.14 baseline of 37 (blocking)', () => {
    expect(manifest.packages.length).toBeLessThanOrEqual(V0_12_14_BASELINE_COUNT);
  });

  it('packages[] count is exactly the v0.13.1 target of 36 (enforced)', () => {
    expect(manifest.packages.length).toBe(V0_13_1_TARGET_COUNT);
    expect(manifest.totalPackages).toBe(V0_13_1_TARGET_COUNT);
  });

  it('manifest version is either current release (0.15.2) or target (0.15.3)', () => {
    // Version stamping belongs to release prep. Accept either the current
    // released value or the next-release target to keep the gate robust
    // across the release lifecycle.
    expect(['0.15.2', '0.15.3']).toContain(manifest.version);
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

  // Retired package names. These packages were removed from the active
  // workspace and publish surface; their historical source was removed from
  // HEAD and remains recoverable from git history and v0.9.x / archive tags.
  // The guard below is directory-independent: it protects the invariant
  // ("retired names must never re-enter the active workspace or publish
  // surface") by name and by workspace-glob shape, not by any archive/
  // directory existing.
  const RETIRED_PACKAGE_NAMES = [
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

  it('retired package names are absent from publish-manifest packages[]', () => {
    const leaked = RETIRED_PACKAGE_NAMES.filter((n) => manifest.packages.includes(n));
    expect(leaked).toEqual([]);
  });

  it('retired package names are absent from the workspace package map', () => {
    // If a contributor re-adds a retired name to WORKSPACE_PACKAGE_MAP (or
    // re-introduces its source under a workspace glob), this catches it before
    // the package can re-enter the publish surface.
    const leaked = RETIRED_PACKAGE_NAMES.filter((n) => WORKSPACE_PATH_MAP[n] !== undefined);
    expect(leaked).toEqual([]);
  });

  it('pnpm-workspace.yaml declares no archive/ workspace glob', () => {
    // The pre-0.10 archive tree was removed from HEAD. Re-introducing an
    // archive/ glob would make retired/legacy source resolvable as a workspace
    // member (and thus publishable) again. Assert no workspace glob references
    // archive/.
    const workspaceYaml = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
    const globEntries = workspaceYaml
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) =>
        line
          .slice(2)
          .trim()
          .replace(/^['"]|['"]$/g, '')
      );
    const archiveGlobs = globEntries.filter(isRootArchiveGlob);
    expect(archiveGlobs).toEqual([]);
  });

  it('retired short names are absent from the resolve-package-path resolver map', () => {
    // resolve-package-path.ts keeps its own NESTED_MAPPINGS (consumed by the
    // publish/release closure scripts), separate from WORKSPACE_PACKAGE_MAP. A
    // retired short name must not map to a path here either, or release tooling
    // could resolve a retired package to a stale workspace path.
    const resolverSrc = readFileSync(
      join(ROOT, 'scripts', 'lib', 'resolve-package-path.ts'),
      'utf8'
    );
    const retiredShortNames = [
      'pref',
      'core',
      'sdk',
      'access',
      'compliance',
      'consent',
      'intelligence',
      'provenance',
      'disc',
    ];
    const leaked = retiredShortNames.filter((name) =>
      new RegExp(`^\\s*['"]?${name}['"]?\\s*:`, 'm').test(resolverSrc)
    );
    expect(leaked).toEqual([]);
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
