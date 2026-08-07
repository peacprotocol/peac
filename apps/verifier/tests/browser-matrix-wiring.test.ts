/**
 * Static wiring of the browser matrix runner.
 *
 * The matrix itself needs external browser installations, so ordinary CI verifies the contract
 * shape instead: the runner exists, refuses to run without a build, covers the required flows
 * and assertions, and Playwright is not a dependency of any workspace package.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const APP_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(APP_ROOT, '..', '..');
const RUNNER = join(APP_ROOT, 'tests', 'browser', 'run-browser-matrix.mjs');
const source = readFileSync(RUNNER, 'utf8');

describe('the browser matrix runner', () => {
  it('exists and refuses to run without a build', () => {
    expect(source).toContain("existsSync(join(DIST, 'index.html'))");
    expect(source).toContain('process.exit(2)');
  });

  it.each([
    'accept-bare-jwk',
    'accept-jwks-selection',
    'accept-unicode-kid',
    'trusted-key-match',
    'wrong-key',
    'tamper',
    'malformed-record',
    'malformed-key',
    'oversized-record',
    'trusted-key-mismatch',
  ])('covers the %s flow', (id) => {
    expect(source).toContain(`'${id}'`);
  });

  it.each([
    ['determinism', 'determinism:'],
    ['input-snapshot binding', 'input-snapshot:'],
    ['capability path', 'runCapabilityCheck'],
    ['network prohibition', 'network request(s)'],
    ['localStorage', 'localStorage'],
    ['sessionStorage', 'sessionStorage'],
    ['IndexedDB', 'indexedDb'],
    ['CacheStorage', 'caches'],
    ['service workers', 'serviceWorkers'],
    ['bundle eval scan', 'scanBundles'],
  ])('asserts %s', (_label, marker) => {
    expect(source).toContain(marker);
  });

  it('targets all three engines and both mobile profiles by default', () => {
    expect(source).toContain('chromium,firefox,webkit');
    expect(source).toContain('iPhone');
    expect(source).toContain('Pixel');
  });

  it('is never satisfied by a repository Playwright dependency', () => {
    const manifests: string[] = [join(REPO_ROOT, 'package.json')];
    for (const dir of ['packages', 'apps']) {
      const root = join(REPO_ROOT, dir);
      if (!existsSync(root)) continue;
      for (const name of readdirSync(root)) {
        const manifest = join(root, name, 'package.json');
        if (existsSync(manifest) && statSync(manifest).isFile()) manifests.push(manifest);
      }
    }
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
