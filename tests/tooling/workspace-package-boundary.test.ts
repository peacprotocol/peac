/**
 * Workspace package boundary gate.
 *
 * Fail-closed repo-hygiene gate over every `@peac/*` workspace package. All
 * facts are derived at runtime from `scripts/publish-manifest.json`, the
 * workspace `package.json` files, their `private` flags, and the workspace
 * roots. It does NOT introduce a committed package census or a public schema:
 * the invariants are enforced dynamically from facts that already exist in
 * the repo.
 *
 * Why this exists: new workspace packages should not be able to land in an
 * unexpected location, collide on a name, or drift out of the published /
 * private boundary without breaking CI. The gate fails closed.
 *
 * Scope and walk logic intentionally mirror
 * `tests/tooling/workspace-package-privacy.test.ts` so the gates agree on
 * exactly which packages exist.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const SKIP_DIRS = new Set(['node_modules', '.turbo', 'dist']);
const ROOTS = ['packages', 'apps', 'examples', 'surfaces'];

// Recognized workspace-root prefixes (mirror pnpm-workspace.yaml). A package
// found outside these prefixes fails the gate: its boundary is undeclared.
const KNOWN_ROOT_PREFIXES = ['packages/', 'apps/', 'examples/', 'surfaces/'];

interface PackageInfo {
  name: string;
  rel: string;
  private: boolean;
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
      out.push({ name, rel: file.slice(ROOT.length + 1), private: pkg.private === true });
    }
  }
  return out;
}

const manifest = JSON.parse(
  readFileSync(join(ROOT, 'scripts', 'publish-manifest.json'), 'utf8')
) as { packages: string[] };
const PUBLISHABLE = new Set(manifest.packages);

const PACKAGES = loadPackageInfo();
const BY_NAME = new Map<string, PackageInfo[]>();
for (const pkg of PACKAGES) {
  const list = BY_NAME.get(pkg.name) ?? [];
  list.push(pkg);
  BY_NAME.set(pkg.name, list);
}

describe('workspace package boundary gate', () => {
  it('places every @peac/* package under a recognized workspace root (fail closed)', () => {
    const stray = PACKAGES.filter((p) => !KNOWN_ROOT_PREFIXES.some((pre) => p.rel.startsWith(pre)))
      .map((p) => `${p.name} (${p.rel})`)
      .sort();
    expect(
      stray,
      `the following @peac/* packages are outside a recognized workspace root ` +
        `(${KNOWN_ROOT_PREFIXES.join(', ')}). The gate fails closed: declare the root in ` +
        `pnpm-workspace.yaml and this list, or relocate the package.\n  ` +
        stray.join('\n  ')
    ).toEqual([]);
  });

  it('has no duplicate @peac/* package names on disk', () => {
    const duplicates = [...BY_NAME.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([name, list]) => `${name}: ${list.map((p) => p.rel).join(', ')}`)
      .sort();
    expect(
      duplicates,
      `duplicate @peac/* package names found:\n  ${duplicates.join('\n  ')}`
    ).toEqual([]);
  });

  it('resolves every scripts/publish-manifest.json package to a package on disk', () => {
    const missing = manifest.packages.filter((n) => !BY_NAME.has(n)).sort();
    expect(
      missing,
      `the following publish-manifest packages have no matching @peac/* package.json on disk:\n  ` +
        missing.join('\n  ')
    ).toEqual([]);
  });

  it('keeps every published package not private', () => {
    const offenders = PACKAGES.filter((p) => PUBLISHABLE.has(p.name) && p.private)
      .map((p) => `${p.name} (${p.rel})`)
      .sort();
    expect(
      offenders,
      `the following packages are in scripts/publish-manifest.json but marked private:\n  ` +
        offenders.join('\n  ')
    ).toEqual([]);
  });

  it('keeps every non-published @peac/* package private', () => {
    const offenders = PACKAGES.filter((p) => !PUBLISHABLE.has(p.name) && !p.private)
      .map((p) => `${p.name} (${p.rel})`)
      .sort();
    expect(
      offenders,
      `the following @peac/* packages are not in the publish manifest yet are not private. ` +
        `Either add "private": true or add them to scripts/publish-manifest.json:\n  ` +
        offenders.join('\n  ')
    ).toEqual([]);
  });

  it('never publishes apps/ or examples/ packages and keeps them private', () => {
    const offenders: string[] = [];
    for (const p of PACKAGES) {
      const isAppOrExample = p.rel.startsWith('apps/') || p.rel.startsWith('examples/');
      if (!isAppOrExample) continue;
      if (PUBLISHABLE.has(p.name)) {
        offenders.push(
          `${p.name} (${p.rel}): apps/ and examples/ must not be in the publish manifest`
        );
      }
      if (!p.private) {
        offenders.push(`${p.name} (${p.rel}): apps/ and examples/ must be private`);
      }
    }
    expect(
      offenders.sort(),
      `apps/ or examples/ boundary violations:\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });

  it('proves the stray-root check fails closed for a synthetic out-of-root package (negative)', () => {
    const synthetic: PackageInfo = {
      name: '@peac/__fixture-out-of-root',
      rel: 'made-up-root/__fixture/package.json',
      private: true,
    };
    const stray = [synthetic].filter(
      (p) => !KNOWN_ROOT_PREFIXES.some((pre) => p.rel.startsWith(pre))
    );
    expect(stray).toEqual([synthetic]);
  });
});
