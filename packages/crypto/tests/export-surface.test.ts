/**
 * The bounded-admissibility internals are a package-private test seam. This proves they are not
 * reachable from the published package, rather than relying on an `@internal` annotation, which is
 * documentation and does not itself restrict resolution.
 *
 * Packs the real tarball and inspects what it ships, so the assertions describe the artifact a
 * consumer receives. Resolution is exercised from a synthetic consumer with the packed package and
 * its declared dependencies provisioned by symlink; this is not a package-manager installation, and
 * it is sufficient because what is under test is the export map and the declaration surface.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CRYPTO_ROOT = resolve(__dirname, '..');
const INTERNAL_SYMBOLS = [
  'ed25519PointRejectionReason',
  'isRejectedEd25519PointEncoding',
  'Ed25519PointRejectionReason',
  'PEAC_PROFILE_MIXED_ORDER_REJECTIONS',
  'ED25519_TORSION_POINT_ENCODINGS',
];

let workspace: string;
let extracted: string;

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), 'peac-export-surface-'));
  // `pnpm pack` resolves workspace protocol and applies the published `files` list.
  execFileSync('pnpm', ['pack', '--pack-destination', workspace], {
    cwd: CRYPTO_ROOT,
    stdio: 'pipe',
  });
  const tarball = readdirSync(workspace).find((f) => f.endsWith('.tgz'));
  expect(tarball, 'pnpm pack produced a tarball').toBeDefined();
  extracted = join(workspace, 'extracted');
  execFileSync('mkdir', ['-p', extracted]);
  execFileSync('tar', ['-xzf', join(workspace, tarball!), '-C', extracted]);
}, 180_000);

afterAll(() => {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
});

const packageDir = (): string => join(extracted, 'package');

const readIfPresent = (relative: string): string | null => {
  try {
    return readFileSync(join(packageDir(), relative), 'utf8');
  } catch {
    return null;
  }
};

describe('published export surface', () => {
  it('the package exports map is unchanged', () => {
    const manifest = JSON.parse(readIfPresent('package.json')!);
    expect(Object.keys(manifest.exports).sort()).toEqual(['.', './package.json', './testkit']);
  });

  it('the root declarations expose no bounded-admissibility internals', () => {
    const declarations = readIfPresent('dist/index.d.ts');
    expect(declarations, 'dist/index.d.ts is published').not.toBeNull();
    for (const symbol of INTERNAL_SYMBOLS) {
      expect(declarations!, `root declarations leak ${symbol}`).not.toContain(symbol);
    }
  });

  it('the testkit declarations expose no bounded-admissibility internals', () => {
    const declarations = readIfPresent('dist/testkit.d.ts');
    if (declarations === null) return;
    for (const symbol of INTERNAL_SYMBOLS) {
      expect(declarations, `testkit declarations leak ${symbol}`).not.toContain(symbol);
    }
  });

  it('no documented entry point re-exports them at run time', () => {
    for (const entry of ['dist/index.mjs', 'dist/index.cjs']) {
      const source = readIfPresent(entry);
      if (source === null) continue;
      for (const symbol of ['ed25519PointRejectionReason', 'isRejectedEd25519PointEncoding']) {
        // The implementation is bundled; what must not appear is an export binding for it.
        expect(
          new RegExp(`export\\s*\\{[^}]*\\b${symbol}\\b`).test(source) ||
            new RegExp(`exports\\.${symbol}\\s*=`).test(source),
          `${entry} exports ${symbol}`
        ).toBe(false);
      }
    }
  });

  it('ships no tests, fixtures, measurement tools or observation output', () => {
    const forbidden = /^(package\/)?(tests?|fixtures?|tools)\//;
    const listing = execFileSync('find', [packageDir(), '-type', 'f'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((p) => p.slice(packageDir().length + 1));
    const leaked = listing.filter(
      (p) => forbidden.test(p) || p.endsWith('.test.ts') || p.includes('measure-ed25519')
    );
    expect(leaked, `tarball ships test material: ${leaked.join(', ')}`).toEqual([]);
  });
});

describe('a consumer of the packed package cannot reach the internals', () => {
  /** Runs a script in the synthetic consumer, where the packed package is provisioned. */
  const inConsumer = (script: string, esm: boolean): { ok: boolean; output: string } => {
    const args = esm ? ['--input-type=module', '-e', script] : ['-e', script];
    try {
      return {
        ok: true,
        output: execFileSync(process.execPath, args, {
          cwd: consumer,
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      };
    } catch (err) {
      return { ok: false, output: String((err as { stderr?: string }).stderr ?? err) };
    }
  };

  let consumer: string;
  beforeAll(() => {
    consumer = join(workspace, 'consumer');
    const modules = join(consumer, 'node_modules');
    execFileSync('mkdir', ['-p', join(modules, '@peac')]);
    execFileSync('ln', ['-s', packageDir(), join(modules, '@peac', 'crypto')]);

    // Node resolves a dependency from the importing module's real path, and the package above is
    // reached through a symlink. The declared dependencies therefore go beside the extracted
    // package, so an import can only fail because of the export map, never because a dependency is
    // missing.
    const manifest = JSON.parse(readIfPresent('package.json')!);
    const beside = join(extracted, 'node_modules');
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      const [scope] = dependency.split('/');
      if (dependency.startsWith('@')) execFileSync('mkdir', ['-p', join(beside, scope)]);
      const workspacePackage = join(CRYPTO_ROOT, '..', dependency.replace(/^@peac\//, ''));
      const source = dependency.startsWith('@peac/')
        ? workspacePackage
        : join(CRYPTO_ROOT, 'node_modules', dependency);
      execFileSync('ln', ['-sfn', source, join(beside, dependency)]);
    }
  });

  // Without this, every import below could fail for the wrong reason and each assertion would
  // pass on an unresolved module rather than on an absent symbol.
  it('resolves the packed package and its documented API', () => {
    const probe = inConsumer(
      `import * as m from '@peac/crypto';
       if (typeof m.ed25519Verify !== 'function') throw new Error('missing ed25519Verify');
       process.stdout.write('resolved');`,
      true
    );
    expect(probe.ok, probe.output).toBe(true);
    expect(probe.output).toBe('resolved');
  });

  const found = (specifier: string, esm: boolean): string =>
    esm
      ? `import * as m from ${JSON.stringify(specifier)};
         process.stdout.write(JSON.stringify(${JSON.stringify(INTERNAL_SYMBOLS)}.filter((s) => s in m)));`
      : `const m = require(${JSON.stringify(specifier)});
         process.stdout.write(JSON.stringify(${JSON.stringify(INTERNAL_SYMBOLS)}.filter((s) => s in m)));`;

  it.each([
    ['@peac/crypto', true],
    ['@peac/crypto/testkit', true],
    ['@peac/crypto/internal/ed25519-admissibility', true],
    ['@peac/crypto/dist/internal/ed25519-admissibility.js', true],
    ['@peac/crypto', false],
  ] as const)('%s (esm=%s) does not provide the internals', (specifier, esm) => {
    const result = inConsumer(found(specifier, esm), esm);
    if (!result.ok) {
      // An unresolvable specifier is the strongest form of unreachable, but it must fail because
      // the export map refuses it, not because the package itself is missing.
      expect(result.output, `${specifier} failed for an unexpected reason`).toMatch(
        /ERR_PACKAGE_PATH_NOT_EXPORTED|ERR_MODULE_NOT_FOUND|Cannot find module/
      );
      return;
    }
    expect(JSON.parse(result.output), `${specifier} exposes internals`).toEqual([]);
  });
});
