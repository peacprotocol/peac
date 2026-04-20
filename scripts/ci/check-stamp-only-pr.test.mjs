#!/usr/bin/env node
/**
 * Tests for scripts/ci/check-stamp-only-pr.sh.
 *
 * Builds a small throwaway Git repository, stages synthetic change sets,
 * and drives the guard script against each scenario.
 *
 * Cases:
 *   1. all changes are inside the allowlist -> exit 0
 *   2. changes mix allowlist and a non-stamp path -> exit 1
 *   3. only non-stamp paths -> exit 1
 *   4. empty diff between base and head -> exit 1
 *   5. usage error (fewer than two arguments) -> exit 2
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, 'check-stamp-only-pr.sh');

const tmp = mkdtempSync(join(tmpdir(), 'check-stamp-only-pr-test-'));
let failures = 0;

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    },
  });
}

function runGuard(cwd, baseRef, headRef) {
  let exitCode = 0;
  let stdout = '';
  let stderr = '';
  try {
    stdout = execFileSync('bash', [SCRIPT, baseRef, headRef], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (err) {
    exitCode = err.status ?? -1;
    stdout = (err.stdout || '').toString();
    stderr = (err.stderr || '').toString();
  }
  return { exitCode, stdout, stderr };
}

function runGuardRaw(args, cwd) {
  let exitCode = 0;
  let stdout = '';
  let stderr = '';
  try {
    stdout = execFileSync('bash', [SCRIPT, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (err) {
    exitCode = err.status ?? -1;
    stdout = (err.stdout || '').toString();
    stderr = (err.stderr || '').toString();
  }
  return { exitCode, stdout, stderr };
}

function expect(label, condition, detail) {
  if (condition) console.log(`PASS [${label}]`);
  else {
    failures += 1;
    console.error(`FAIL [${label}]: ${detail}`);
  }
}

// Initialize the synthetic repo with a baseline commit on a `base` branch.
function initRepo(root) {
  mkdirSync(root, { recursive: true });
  git(['init', '-q', '-b', 'base'], root);
  mkdirSync(join(root, 'docs/releases'), { recursive: true });
  writeFileSync(join(root, 'docs/releases/facts.json'), '{ "version": "0.0.0" }\n');
  writeFileSync(join(root, 'docs/releases/current.json'), '{ "version": "0.0.0" }\n');
  writeFileSync(join(root, 'REPO_SURFACE_STATUS.json'), '{ "updated": "2099-01-01" }\n');
  writeFileSync(join(root, 'README.md'), '# fixture\n');
  git(['add', '-A'], root);
  git(['commit', '-q', '-m', 'initial'], root);
}

try {
  // Case 1: stamp-only allowlist hits exit 0.
  {
    const root = join(tmp, 'case1');
    initRepo(root);
    git(['checkout', '-q', '-b', 'head'], root);
    writeFileSync(join(root, 'docs/releases/facts.json'), '{ "version": "0.12.13" }\n');
    writeFileSync(join(root, 'REPO_SURFACE_STATUS.json'), '{ "updated": "2099-02-01" }\n');
    git(['add', '-A'], root);
    git(['commit', '-q', '-m', 'stamp-only'], root);
    const res = runGuard(root, 'base', 'head');
    expect(
      'allowlist-only changes exit 0',
      res.exitCode === 0 && res.stdout.includes('stamp-only profile ok'),
      `exit=${res.exitCode} stdout=${JSON.stringify(res.stdout)} stderr=${JSON.stringify(res.stderr)}`
    );
  }

  // Case 2: mixed change set exit 1.
  {
    const root = join(tmp, 'case2');
    initRepo(root);
    git(['checkout', '-q', '-b', 'head'], root);
    writeFileSync(join(root, 'docs/releases/facts.json'), '{ "version": "0.12.13" }\n');
    writeFileSync(join(root, 'README.md'), '# fixture + edit\n');
    git(['add', '-A'], root);
    git(['commit', '-q', '-m', 'mixed'], root);
    const res = runGuard(root, 'base', 'head');
    expect(
      'mixed change set exit 1',
      res.exitCode === 1 &&
        (res.stderr.includes('outside the allowlist') || res.stdout.includes('outside the allowlist')),
      `exit=${res.exitCode} stderr=${JSON.stringify(res.stderr)}`
    );
  }

  // Case 3: only non-stamp paths exit 1.
  {
    const root = join(tmp, 'case3');
    initRepo(root);
    git(['checkout', '-q', '-b', 'head'], root);
    writeFileSync(join(root, 'README.md'), '# fixture + edit only\n');
    git(['add', '-A'], root);
    git(['commit', '-q', '-m', 'non-stamp'], root);
    const res = runGuard(root, 'base', 'head');
    expect(
      'non-stamp-only changes exit 1',
      res.exitCode === 1,
      `exit=${res.exitCode} stderr=${JSON.stringify(res.stderr)}`
    );
  }

  // Case 4: empty diff exits 1.
  {
    const root = join(tmp, 'case4');
    initRepo(root);
    git(['checkout', '-q', '-b', 'head'], root);
    const res = runGuard(root, 'base', 'head');
    expect(
      'empty diff exits 1',
      res.exitCode === 1 && res.stderr.includes('No changed files'),
      `exit=${res.exitCode} stderr=${JSON.stringify(res.stderr)}`
    );
  }

  // Case 5: usage error on missing arguments exits 2.
  {
    const root = join(tmp, 'case5');
    initRepo(root);
    const res = runGuardRaw(['only-one-arg'], root);
    expect(
      'usage error exit 2',
      res.exitCode === 2 && res.stderr.includes('usage:'),
      `exit=${res.exitCode} stderr=${JSON.stringify(res.stderr)}`
    );
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\ncheck-stamp-only-pr.test: ${failures} case(s) failed`);
  process.exit(1);
} else {
  console.log('\ncheck-stamp-only-pr.test: all cases passed');
  process.exit(0);
}
