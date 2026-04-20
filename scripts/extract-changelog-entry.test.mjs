#!/usr/bin/env node
/**
 * Tests for scripts/extract-changelog-entry.mjs.
 *
 * Drives the extractor against a synthetic CHANGELOG fixture under a
 * temp directory so test runs do not depend on the live CHANGELOG.md.
 *
 * Cases:
 *   1. body extraction: existing version prints the trimmed release body
 *   2. --title-only: theme is derived from the first prose line
 *   3. --title-only --theme "<text>": explicit override wins
 *   4. --title-only on an entry with no prose body: falls back to vX.Y.Z
 *   5. missing version: exit 1 with stderr message
 *   6. unknown argument: exit 2 with usage
 *   7. "--" sentinel is accepted and skipped
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, 'extract-changelog-entry.mjs');

const tmp = mkdtempSync(join(tmpdir(), 'extract-changelog-test-'));
let failures = 0;

function run(args) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  try {
    stdout = execFileSync('node', [SCRIPT, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (err) {
    exitCode = err.status ?? -1;
    stdout = (err.stdout || '').toString();
    stderr = (err.stderr || '').toString();
  }
  return { stdout, stderr, exitCode };
}

function expect(label, condition, detail) {
  if (condition) {
    console.log(`PASS [${label}]`);
  } else {
    failures += 1;
    console.error(`FAIL [${label}]: ${detail}`);
  }
}

try {
  // Fixture CHANGELOG with three entries.
  const changelog = join(tmp, 'CHANGELOG.md');
  writeFileSync(
    changelog,
    [
      '# Changelog',
      '',
      '## [0.99.1] - 2099-01-15',
      '',
      'Compliance mapping, verifier closeout, and external proof loop. No wire change.',
      '',
      '### Added',
      '',
      '- Item one.',
      '- Item two.',
      '',
      '## [0.99.0] - 2099-01-01',
      '',
      '### Added',
      '',
      '- Only a bullet list here; no prose summary at the top.',
      '',
      '## [0.98.0] - 2098-12-01',
      '',
      'Prior release body.',
      '',
    ].join('\n')
  );

  // Case 1: body extraction on 0.99.1.
  const body = run(['--version', '0.99.1', '--file', changelog]);
  expect(
    'body extraction prints trimmed release body',
    body.exitCode === 0 &&
      body.stdout.includes('Compliance mapping, verifier closeout') &&
      body.stdout.includes('- Item one.') &&
      !body.stdout.includes('## [0.99.0]'),
    `exit=${body.exitCode} stdout=${JSON.stringify(body.stdout.slice(0, 120))}`
  );

  // Case 2: --title-only derives a theme from the first prose line.
  const titleDerived = run(['--version', '0.99.1', '--file', changelog, '--title-only']);
  expect(
    '--title-only derives theme from first prose line',
    titleDerived.exitCode === 0 &&
      titleDerived.stdout.trim() ===
        'v0.99.1 - Compliance mapping, verifier closeout, and external proof loop',
    `stdout=${JSON.stringify(titleDerived.stdout)}`
  );

  // Case 3: --theme override wins.
  const titleOverride = run([
    '--version',
    '0.99.1',
    '--file',
    changelog,
    '--title-only',
    '--theme',
    'Explicit theme override',
  ]);
  expect(
    '--theme override wins over derived theme',
    titleOverride.exitCode === 0 &&
      titleOverride.stdout.trim() === 'v0.99.1 - Explicit theme override',
    `stdout=${JSON.stringify(titleOverride.stdout)}`
  );

  // Case 4: --title-only on an entry with no prose body.
  const titleFallback = run(['--version', '0.99.0', '--file', changelog, '--title-only']);
  expect(
    '--title-only falls back to vX.Y.Z when no prose exists',
    titleFallback.exitCode === 0 && titleFallback.stdout.trim() === 'v0.99.0',
    `stdout=${JSON.stringify(titleFallback.stdout)}`
  );

  // Case 5: missing version exits 1.
  const missing = run(['--version', '9.9.9', '--file', changelog]);
  expect(
    'missing version exits 1 with stderr',
    missing.exitCode === 1 && missing.stderr.includes('release entry not found'),
    `exit=${missing.exitCode} stderr=${JSON.stringify(missing.stderr)}`
  );

  // Case 6: unknown argument exits 2.
  const unknown = run(['--nope']);
  expect(
    'unknown argument exits 2',
    unknown.exitCode === 2 && unknown.stderr.includes('unknown argument'),
    `exit=${unknown.exitCode} stderr=${JSON.stringify(unknown.stderr)}`
  );

  // Case 7: "--" sentinel is accepted and skipped.
  const sentinel = run(['--', '--version', '0.99.1', '--file', changelog, '--title-only']);
  expect(
    '"--" sentinel passes through',
    sentinel.exitCode === 0 && sentinel.stdout.startsWith('v0.99.1 -'),
    `stdout=${JSON.stringify(sentinel.stdout)}`
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nextract-changelog-entry.test: ${failures} case(s) failed`);
  process.exit(1);
} else {
  console.log('\nextract-changelog-entry.test: all cases passed');
  process.exit(0);
}
