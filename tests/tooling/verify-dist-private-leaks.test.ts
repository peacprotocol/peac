/**
 * Self-test for scripts/verify-dist-private-leaks.mjs.
 *
 * Operates on TEMPORARY FIXTURE PACKAGES under mkdtempSync(). Does NOT
 * mutate any real workspace file. Each test builds a tiny fixture package
 * (package.json + dist/) in a temp directory, then invokes the script with
 * `--package-dir <fixture-root>` so the gate scans the fixture rather than
 * the workspace.
 *
 * Tier coverage:
 *   - Tier 1 (global denylist across dist/): private package import
 *     (e.g., require('@peac/compat')) MUST FAIL.
 *   - Tier 2 (.d.ts type-surface): implementation symbol in
 *     dist/index.d.ts MUST FAIL.
 *   - Tier 2b (runtime export): actual `exports.X = ...` /
 *     `export { X }` MUST FAIL.
 *   - Tier 2 / 2b: bundled local declaration (var X = ...) in a runtime
 *     entry MUST PASS (tsup tree-shake state, not an export).
 *   - Tier 2: implementation symbol in dist/_internal/** MUST PASS.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

function makeFixture(name: string): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'peac-leakscan-fixture-'));
  mkdirSync(join(root, 'dist'), { recursive: true });
  mkdirSync(join(root, 'dist', '_internal'), { recursive: true });

  // Minimal package.json with public + subpath exports.
  const pkgJson = {
    name,
    version: '0.0.0-fixture',
    private: false,
    type: 'module',
    main: './dist/index.cjs',
    module: './dist/index.mjs',
    types: './dist/index.d.ts',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.mjs',
        require: './dist/index.cjs',
      },
    },
  };
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkgJson, null, 2));

  // Default-empty surface files; tests overwrite per scenario.
  writeFileSync(join(root, 'dist', 'index.d.ts'), '// fixture\n');
  writeFileSync(join(root, 'dist', 'index.cjs'), '// fixture\n');
  writeFileSync(join(root, 'dist', 'index.mjs'), '// fixture\n');

  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function runGate(fixtureRoot: string): { exit: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(
      'node',
      ['scripts/verify-dist-private-leaks.mjs', '--package-dir', fixtureRoot],
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

describe('verify-dist-private-leaks.mjs: temp-fixture self-test', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeFixture('@fixture/leakscan');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('Tier 1: private-package import in any dist file', () => {
    it('FAILs when require("@peac/compat") appears in dist/index.cjs', () => {
      writeFileSync(
        join(fixture.root, 'dist', 'index.cjs'),
        "// fixture\nrequire('@peac/compat');\n"
      );
      const result = runGate(fixture.root);
      expect(result.exit).not.toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/FAIL \(Tier 1\)/);
      expect(combined).toContain('@peac/compat');
    });

    it('FAILs when import "@peac/record-core" appears in dist/index.mjs', () => {
      writeFileSync(
        join(fixture.root, 'dist', 'index.mjs'),
        "// fixture\nimport '@peac/record-core';\n"
      );
      const result = runGate(fixture.root);
      expect(result.exit).not.toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/FAIL \(Tier 1\)/);
      expect(combined).toContain('@peac/record-core');
    });
  });

  describe('Tier 2: implementation symbol on public-surface .d.ts', () => {
    it('FAILs when RecordCodec leaks into dist/index.d.ts', () => {
      writeFileSync(
        join(fixture.root, 'dist', 'index.d.ts'),
        '// fixture\nexport type RecordCodec = unknown;\n'
      );
      const result = runGate(fixture.root);
      expect(result.exit).not.toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/FAIL \(Tier 2\)/);
      expect(combined).toContain('RecordCodec');
    });

    it('PASSes when RecordCodec appears only in dist/_internal/** (not on public surface)', () => {
      writeFileSync(
        join(fixture.root, 'dist', '_internal', 'codec.d.ts'),
        '// fixture\nexport type RecordCodec = unknown;\n'
      );
      const result = runGate(fixture.root);
      expect(result.exit).toBe(0);
      expect(result.stdout).toMatch(/no Tier 1, Tier 2 .*, or Tier 2b/);
    });
  });

  describe('Tier 2b: actual runtime export of implementation symbol', () => {
    it('FAILs when exports.defaultCodec = ... appears in dist/index.cjs', () => {
      writeFileSync(
        join(fixture.root, 'dist', 'index.cjs'),
        '// fixture\nexports.defaultCodec = {};\n'
      );
      const result = runGate(fixture.root);
      expect(result.exit).not.toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/FAIL \(Tier 2b\)/);
      expect(combined).toContain('defaultCodec');
    });

    it('FAILs when ESM `export { defaultCodec }` appears in dist/index.mjs', () => {
      writeFileSync(
        join(fixture.root, 'dist', 'index.mjs'),
        '// fixture\nconst defaultCodec = {};\nexport { defaultCodec };\n'
      );
      const result = runGate(fixture.root);
      expect(result.exit).not.toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/FAIL \(Tier 2b\)/);
    });

    it('PASSes when defaultCodec is only a bundled local declaration (not exported)', () => {
      // tsup tree-shakes internal modules into runtime entries; bundled
      // local `var defaultCodec = ...` is NOT an export and MUST NOT be
      // flagged. Only export syntax fails.
      writeFileSync(
        join(fixture.root, 'dist', 'index.mjs'),
        '// fixture\nvar defaultCodec = { name: "jws-jwt" };\nexport const someApi = () => defaultCodec.name;\n'
      );
      const result = runGate(fixture.root);
      expect(result.exit).toBe(0);
      expect(result.stdout).toMatch(/no Tier 1, Tier 2 .*, or Tier 2b/);
    });
  });

  describe('all tiers pass on a clean fixture', () => {
    it('PASSes when no forbidden identifiers appear anywhere', () => {
      const result = runGate(fixture.root);
      expect(result.exit).toBe(0);
      expect(result.stdout).toMatch(/no Tier 1, Tier 2 .*, or Tier 2b/);
    });
  });
});
