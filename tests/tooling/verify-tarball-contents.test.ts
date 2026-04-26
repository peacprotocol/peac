/**
 * Self-test for the export-map gate added to scripts/verify-tarball-contents.mjs.
 *
 * §6P-B #2: package.json `exports` MUST NOT expose internal subpaths
 * (./_internal, ./codec, ./record-core, ./compat, ./migration, ./shadow).
 * dist/_internal/** files MAY exist in the published tarball (relative
 * import runtime path); the export-map check distinguishes implementation
 * files in tarball (allowed) from public API surface in exports (forbidden).
 *
 * Operates on TEMPORARY FIXTURE PACKAGES under mkdtempSync(). Does NOT
 * mutate any real workspace file. The script is invoked with
 * `--package-dir <fixture-root>` so it scans the fixture rather than
 * the workspace.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

interface Fixture {
  root: string;
  cleanup(): void;
}

function makeFixture(name: string, exportsField: Record<string, unknown>): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'peac-tarball-fixture-'));
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist', 'index.d.ts'), '// fixture\n');
  writeFileSync(join(root, 'dist', 'index.cjs'), '// fixture\n');
  writeFileSync(join(root, 'dist', 'index.mjs'), '// fixture\n');
  writeFileSync(join(root, 'README.md'), '# fixture\n');

  const pkgJson = {
    name,
    version: '0.0.0-fixture',
    private: false,
    type: 'module',
    main: './dist/index.cjs',
    module: './dist/index.mjs',
    types: './dist/index.d.ts',
    files: ['dist'],
    exports: exportsField,
  };
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkgJson, null, 2));

  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

const PUBLIC_EXPORT_OBJECT = {
  types: './dist/index.d.ts',
  import: './dist/index.mjs',
  require: './dist/index.cjs',
};

function runGate(fixtureRoot: string): { exit: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(
      'node',
      ['scripts/verify-tarball-contents.mjs', '--package-dir', fixtureRoot],
      { cwd: ROOT, encoding: 'utf8' }
    );
    return { exit: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      exit: e.status ?? 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

describe('verify-tarball-contents.mjs: export-map self-test (temp fixtures)', () => {
  let fixture: Fixture;

  afterEach(() => {
    fixture?.cleanup();
  });

  it('FAILs when package.json exports contains "./_internal/*"', () => {
    fixture = makeFixture('@fixture/tarball', {
      '.': PUBLIC_EXPORT_OBJECT,
      './_internal/*': PUBLIC_EXPORT_OBJECT,
    });
    const result = runGate(fixture.root);
    expect(result.exit).not.toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Export-map subpath violations/);
    expect(combined).toContain('./_internal/*');
  });

  it('FAILs when package.json exports contains "./codec"', () => {
    fixture = makeFixture('@fixture/tarball', {
      '.': PUBLIC_EXPORT_OBJECT,
      './codec': PUBLIC_EXPORT_OBJECT,
    });
    const result = runGate(fixture.root);
    expect(result.exit).not.toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Export-map subpath violations/);
    expect(combined).toContain('./codec');
  });

  it('FAILs when package.json exports contains "./record-core"', () => {
    fixture = makeFixture('@fixture/tarball', {
      '.': PUBLIC_EXPORT_OBJECT,
      './record-core': PUBLIC_EXPORT_OBJECT,
    });
    const result = runGate(fixture.root);
    expect(result.exit).not.toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Export-map subpath violations/);
    expect(combined).toContain('./record-core');
  });

  it('FAILs when package.json exports contains "./compat"', () => {
    fixture = makeFixture('@fixture/tarball', {
      '.': PUBLIC_EXPORT_OBJECT,
      './compat': PUBLIC_EXPORT_OBJECT,
    });
    const result = runGate(fixture.root);
    expect(result.exit).not.toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Export-map subpath violations/);
    expect(combined).toContain('./compat');
  });

  it('PASSes when exports contain only legitimate public subpaths', () => {
    fixture = makeFixture('@fixture/tarball', {
      '.': PUBLIC_EXPORT_OBJECT,
      './subpath': PUBLIC_EXPORT_OBJECT,
    });
    const result = runGate(fixture.root);
    expect(result.exit).toBe(0);
    expect(result.stdout).toMatch(/no forbidden content or subpaths/);
  });
});
