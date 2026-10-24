/**
 * Root file layout test.
 *
 * Keeps the repository root free of unused configuration files and keeps the
 * remaining pins and config references consistent.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');

const REMOVED_ROOT_FILES = [
  '.changeset',
  '.nvmrc',
  'Makefile',
  'repo-surface-status.schema.json',
  'stryker.conf.json',
  'tsconfig.legacy.json',
  'tsconfig.package.json',
  '.prettierrc',
];

const REMOVED_PATHS = [
  'docs/adapters/faremeter-adapter.md',
  'docs/maintainers/NPM_PUBLISH_V0928.md.old',
  'docs/maintainers/RELEASE.md',
  'docs/compliance-guide.md',
  'docs/receipt.md',
  'docs/STANDARDS.md',
  'docs/VERSIONING.md',
  'docs/releases/0.12.0-gate-report.json',
  'docs/releases/0.12.0-preview.2-gate-report.json',
  'docs/releases/0.12.1-gate-report.json',
  'docs/releases/baseline-truth-v0.12.8.json',
  'docs/releases/coverage-summary.json',
  'docs/pilots/evidence/.gitkeep',
  'docs/release/npm-readme-template.md',
  'docs/RELEASE-NOTES-0.12.11.md',
  'scripts/generate-coverage-summary.mjs',
  'scripts/audit-zod-usage.mjs',
  'scripts/check-conformance-matrix.sh',
  'scripts/generate-fixture-inventory.sh',
  'scripts/conformance/emit-pending-registration.mjs',
  'scripts/conformance/compute-fragment-hash.mjs',
  'scripts/check-version-integrity.sh',
  'scripts/check-readme-consistency.sh',
  'scripts/pre-release-verify.sh',
  'scripts/release-gate-0.11.3.sh',
  'scripts/release-gate-0.12.0-preview.1.sh',
  'scripts/lint-schemas.js',
  'specs/conformance/pending-registration-v0129.json',
  'tests/smoke/policy-hash.test.js',
  'tests/smoke/fixtures/policy-hash/vector1.json',
  'tests/smoke/fixtures/policy-hash/vector2.json',
  'tests/smoke/fixtures/policy-hash/vector3.json',
  'tests/golden/generate-vectors.ts',
  'tests/fixtures/golden-vectors.json',
  'tests/perf/run.mjs',
  'tests/performance/performance-test.ts',
];

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

describe('root file layout', () => {
  it('does not carry removed root files', () => {
    const present = REMOVED_ROOT_FILES.filter((f) => existsSync(join(REPO_ROOT, f)));
    expect(present).toEqual([]);
  });

  it('pins Node in .node-version only, and CI path filters do not reference .nvmrc', () => {
    expect(existsSync(join(REPO_ROOT, '.node-version'))).toBe(true);
    expect(read('.github/workflows/ci.yml').includes('.nvmrc')).toBe(false);
  });

  it('keeps the mutation baseline config at the path package.json points to', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const script = pkg.scripts['mutation:baseline'];
    const m = /--config-file (\S+)/.exec(script);
    expect(m, 'mutation:baseline --config-file argument').not.toBeNull();
    expect(existsSync(join(REPO_ROOT, m![1]))).toBe(true);
  });

  it('every package tsconfig that extends a file extends one that exists', () => {
    const missing: string[] = [];
    for (const group of ['packages']) {
      const base = join(REPO_ROOT, group);
      for (const dir of readdirSync(base, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        const cfg = join(base, dir.name, 'tsconfig.json');
        if (!existsSync(cfg)) continue;
        const text = readFileSync(cfg, 'utf8');
        const m = /"extends"\s*:\s*"([^"]+)"/.exec(text);
        if (m && m[1].startsWith('.')) {
          const target = resolve(dirname(cfg), m[1].endsWith('.json') ? m[1] : `${m[1]}.json`);
          if (!existsSync(target)) missing.push(`${group}/${dir.name} -> ${m[1]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('does not carry removed files and keeps the moved release note under docs/release-notes', () => {
    const present = REMOVED_PATHS.filter((f) => existsSync(join(REPO_ROOT, f)));
    expect(present).toEqual([]);
    expect(existsSync(join(REPO_ROOT, 'docs/release-notes/v0.12.11.md'))).toBe(true);
  });

  it('keeps package.json free of the unused workspaces field and legacy scripts', () => {
    const pkg = JSON.parse(read('package.json')) as {
      workspaces?: unknown;
      scripts: Record<string, string>;
    };
    expect(pkg.workspaces).toBeUndefined();
    for (const name of ['typecheck:legacy', 'release:gate:0.11.3']) {
      expect(pkg.scripts[name], name).toBeUndefined();
    }
    expect(pkg.scripts['schemas:lint']).not.toMatch(/lint-schemas\.js/);
  });

  it('configures Prettier in package.json', () => {
    const pkg = JSON.parse(read('package.json')) as { prettier?: Record<string, unknown> };
    expect(pkg.prettier).toEqual({
      semi: true,
      trailingComma: 'es5',
      singleQuote: true,
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      endOfLine: 'lf',
    });
  });

  it('defines the turbo tasks behind the root dev and clean scripts and no unused tasks', () => {
    const turbo = JSON.parse(read('turbo.json')) as { tasks: Record<string, unknown> };
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    for (const task of ['dev', 'clean']) {
      expect(pkg.scripts[task], task).toContain(`turbo run ${task}`);
      expect(turbo.tasks[task], task).toBeDefined();
    }
    expect(turbo.tasks.dev).toMatchObject({ cache: false, persistent: true });
    expect(turbo.tasks.clean).toMatchObject({ cache: false });
    expect(turbo.tasks.sbom).toBeUndefined();
    expect(turbo.tasks.release).toBeUndefined();
  });

  it('lists each .prettierignore entry once', () => {
    const lines = read('.prettierignore')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('does not run the removed legacy typecheck in CI', () => {
    expect(read('.github/workflows/ci.yml')).not.toContain('typecheck:legacy');
  });
});
