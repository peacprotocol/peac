/**
 * Static invariants of the browser-matrix contract.
 *
 * Behavior is proven by executing the matrix in CI; this file pins only what execution cannot
 * prove cheaply: the runner exists and refuses to run unbuilt, Playwright is not a dependency of
 * any workspace package, and the CI lane that runs the matrix is activated and required.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync, globSync } from 'node:fs';
import { join, resolve } from 'node:path';

const APP_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(APP_ROOT, '..', '..');
const RUNNER = join(APP_ROOT, 'tests', 'browser', 'run-browser-matrix.mjs');
const CI = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

describe('the browser matrix runner', () => {
  it('exists and refuses to run without a build', () => {
    const source = readFileSync(RUNNER, 'utf8');
    expect(source).toContain("existsSync(join(DIST, 'index.html'))");
    expect(source).toContain('process.exit(2)');
  });

  it('is never satisfied by a workspace Playwright dependency', () => {
    const workspace = readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
    const globs = [...workspace.matchAll(/- '([^']+)'/g)].map((m) => m[1]);
    const manifests = [join(REPO_ROOT, 'package.json')];
    for (const pattern of globs) {
      for (const dir of globSync(pattern, { cwd: REPO_ROOT })) {
        const manifest = join(REPO_ROOT, dir, 'package.json');
        if (existsSync(manifest) && statSync(manifest).isFile()) manifests.push(manifest);
      }
    }
    expect(manifests.length).toBeGreaterThan(30);
    for (const manifest of manifests) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as Record<
        string,
        Record<string, string> | undefined
      >;
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        expect(
          Object.keys(parsed[section] ?? {}),
          `${manifest} must not depend on playwright`
        ).not.toContain('playwright');
      }
    }
  });
});

describe('the browser matrix CI lane', () => {
  it('exists, builds the app, and runs the runner against an isolated installation', () => {
    expect(CI).toContain('browser-matrix:');
    expect(CI).toContain('pnpm --filter @peac/app-verifier build');
    expect(CI).toContain('run-browser-matrix.mjs --deps');
  });

  it('pins an exact stable Playwright release', () => {
    const pins = [...CI.matchAll(/playwright@(\S+)/g)].map((m) => m[1]);
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) {
      expect(pin, 'exact release, no range or pre-release tag').toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('activates on verifier-reachable paths and is required by the aggregate', () => {
    const job = CI.slice(CI.indexOf('browser-matrix:'), CI.indexOf('\n  ci:'));
    for (const output of ['verifier_ci', 'core', 'root_config']) {
      expect(job, `matrix activates on ${output}`).toContain(
        `needs.detect-changes.outputs.${output} == 'true'`
      );
    }
    const aggregate = CI.slice(CI.indexOf('\n  ci:'));
    expect(aggregate).toContain('browser-matrix,');
    expect(aggregate).toContain('needs.browser-matrix.result');
    // The aggregate requires the matrix to have succeeded when any verifier-reachable path changed.
    for (const output of ['verifier_ci', 'core', 'root_config']) {
      expect(aggregate, `aggregate requires the matrix on ${output}`).toContain(
        `needs.detect-changes.outputs.${output} }}" == "true"`
      );
    }
    expect(aggregate).toContain('needs.browser-matrix.result }}" != "success"');
  });
});
