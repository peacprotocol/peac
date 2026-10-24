/**
 * The listed hooks, CI workflow and gate scripts must invoke only scripts that are tracked in
 * this repository. A guarded call to a script that is not tracked is dead code for every clone.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

const ENTRY_POINTS: readonly string[] = [
  '.githooks/pre-commit',
  '.githooks/pre-push',
  '.github/workflows/ci.yml',
  'scripts/gate.sh',
  'scripts/guard.sh',
  'scripts/pre-push-strict.sh',
  'scripts/release/run-gates.sh',
  'scripts/release-gate-0.11.3.sh',
  'scripts/release-gate-0.12.0-preview.1.sh',
];

const SCRIPT_REF = /(?<![\w./-])scripts\/[A-Za-z0-9_./-]+\.(?:sh|mjs|cjs|js|ts)(?![\w])/g;

const tracked = new Set(
  execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean)
);

describe('hook and gate entry points reference tracked scripts only', () => {
  for (const entry of ENTRY_POINTS) {
    it(`${entry} invokes only tracked scripts`, () => {
      const text = readFileSync(join(ROOT, entry), 'utf8');
      const refs = [...new Set(text.match(SCRIPT_REF) ?? [])];
      const missing = refs.filter((ref) => !tracked.has(ref));
      expect(missing).toEqual([]);
    });
  }
});
