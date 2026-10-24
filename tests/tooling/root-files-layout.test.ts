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
  'tsconfig.package.json',
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
});
