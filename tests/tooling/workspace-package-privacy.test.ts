/**
 * Workspace package privacy invariant.
 *
 * Asserts the metadata-truth contract between every `@peac/*` workspace
 * package and the canonical publish manifest at
 * `scripts/publish-manifest.json`:
 *
 *   1. Every `@peac/*` workspace package with `private !== true` MUST
 *      be listed in `publish-manifest.json` packages[]. Drift in this
 *      direction means a package that looks publishable by default is
 *      not part of the release manifest, which produces a confusing
 *      truth conflict between repo metadata and what actually ships
 *      to npm.
 *
 *   2. Every `@peac/*` workspace package listed in
 *      `publish-manifest.json` packages[] MUST have `private !== true`.
 *      Drift in this direction would mean release prep cannot publish
 *      a package that the manifest claims is publishable.
 *
 *   3. Private packages MUST NOT carry `publishConfig`. The repo
 *      convention is uniform: 53+ existing private packages have no
 *      `publishConfig` field. A private package with `publishConfig`
 *      is metadata noise that suggests publishability where there is
 *      none.
 *
 * No allowlist. The expected v0.14.x state is: exactly the packages in
 * `publish-manifest.json` are the publishable surface; every other
 * `@peac/*` workspace package is `private: true`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const SKIP_DIRS = new Set(['node_modules', '.turbo', 'dist']);
const ROOTS = ['packages', 'apps', 'examples', 'surfaces'];

interface PackageInfo {
  name: string;
  file: string;
  private: boolean;
  hasPublishConfig: boolean;
}

function* walk(start: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(start, { withFileTypes: true });
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const child = join(start, ent.name);
    if (ent.isDirectory()) yield* walk(child);
    else if (ent.isFile() && ent.name === 'package.json') yield child;
  }
}

function loadPackageInfo(): PackageInfo[] {
  const out: PackageInfo[] = [];
  for (const base of ROOTS) {
    for (const file of walk(join(ROOT, base))) {
      let pkg: Record<string, unknown>;
      try {
        pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      } catch {
        continue;
      }
      const name = pkg.name;
      if (typeof name !== 'string' || !name.startsWith('@peac/')) continue;
      out.push({
        name,
        file,
        private: pkg.private === true,
        hasPublishConfig: pkg.publishConfig !== undefined,
      });
    }
  }
  return out;
}

const manifest = JSON.parse(
  readFileSync(join(ROOT, 'scripts', 'publish-manifest.json'), 'utf8')
) as { packages: string[] };
const PUBLISHABLE = new Set(manifest.packages);
const PACKAGES = loadPackageInfo();

describe('workspace package privacy matches publish manifest', () => {
  it('every @peac/* workspace package with private!==true is listed in scripts/publish-manifest.json', () => {
    const drift = PACKAGES.filter((p) => !p.private && !PUBLISHABLE.has(p.name)).map(
      (p) => `${p.name} (${p.file})`
    );
    expect(
      drift,
      `the following @peac/* packages are not private but are absent from scripts/publish-manifest.json. ` +
        `Either add "private": true to the package.json, or add the package to scripts/publish-manifest.json. ` +
        `No allowlist; the v0.14.x rule is: if it is not in the publish manifest, it is private.\n  ` +
        drift.join('\n  ')
    ).toEqual([]);
  });

  it('every @peac/* package listed in scripts/publish-manifest.json has private!==true', () => {
    const conflicts = PACKAGES.filter((p) => p.private && PUBLISHABLE.has(p.name)).map(
      (p) => `${p.name} (${p.file})`
    );
    expect(
      conflicts,
      `the following @peac/* packages are listed in scripts/publish-manifest.json but have "private": true. ` +
        `Either remove the private field, or remove the package from scripts/publish-manifest.json.\n  ` +
        conflicts.join('\n  ')
    ).toEqual([]);
  });

  it('every @peac/* package listed in scripts/publish-manifest.json is reachable on disk', () => {
    const known = new Set(PACKAGES.map((p) => p.name));
    const missing = manifest.packages.filter((n) => !known.has(n));
    expect(
      missing,
      `the following packages are listed in scripts/publish-manifest.json but no matching package.json was found in packages/, apps/, examples/, or surfaces/.\n  ` +
        missing.join('\n  ')
    ).toEqual([]);
  });
});

describe('private @peac/* packages do not carry publishConfig', () => {
  it('publishConfig is absent on every @peac/* package with private===true', () => {
    const offenders = PACKAGES.filter((p) => p.private && p.hasPublishConfig).map(
      (p) => `${p.name} (${p.file})`
    );
    expect(
      offenders,
      `the following private @peac/* packages still carry a publishConfig field. ` +
        `Repo convention: drop publishConfig when a package becomes private. ` +
        `Remove the publishConfig block.\n  ` +
        offenders.join('\n  ')
    ).toEqual([]);
  });
});
