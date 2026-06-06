#!/usr/bin/env node
/**
 * Tests for scripts/verify-release-closeout.mjs.
 *
 * Standalone Node test (NOT a Vitest file). Run it with
 * `node scripts/verify-release-closeout.test.mjs` or
 * `pnpm verify:release-closeout:test`.
 *
 * Two layers:
 *   - CLI behavior: argument parsing, stage validation, and the offline
 *     --skip-remote path against the live repository artifacts (the live
 *     `docs/releases/facts.json`, `docs/releases/current.json`, and
 *     `REPO_SURFACE_STATUS.json` are read against the current shipped
 *     version 0.15.0 which is known GREEN). Remote npm / gh paths are not
 *     exercised here so tests stay deterministic.
 *   - classifyGithubRelease unit matrix: the pure stage x state classifier
 *     is imported and asserted in-process, with no GitHub access.
 *
 * Cases:
 *   1. missing --version: exit 2 with usage message
 *   2. invalid --stage: exit 2, error message lists the valid stages incl. final
 *   3. unknown argument: exit 2
 *   4. "--" sentinel accepted
 *   5. --skip-remote --stage promote on v0.15.0: exit 0 with 0 RED
 *   6. --json emits parseable JSON with rows and counts
 *   7. --strict flips exit code to 1 when any YELLOW row is present
 *   8. --allow-stamp-pending is accepted and keeps a GREEN facts.json GREEN
 *   9. --skip-remote --stage final on v0.15.0: exit 0 with 0 RED
 *  10. classifyGithubRelease stage x state matrix
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyGithubRelease } from './verify-release-closeout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, 'verify-release-closeout.mjs');

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
  if (condition) console.log(`PASS [${label}]`);
  else {
    failures += 1;
    console.error(`FAIL [${label}]: ${detail}`);
  }
}

try {
  // Case 1: missing --version.
  const noVersion = run(['--stage', 'promote']);
  expect(
    'missing --version exits 2 with usage',
    noVersion.exitCode === 2 && noVersion.stderr.includes('usage'),
    `exit=${noVersion.exitCode} stderr=${JSON.stringify(noVersion.stderr)}`
  );

  // Case 2: invalid stage; error must enumerate the valid stages incl. final.
  const badStage = run(['--version', '0.15.0', '--stage', 'nope']);
  expect(
    'invalid --stage exits 2 and lists final',
    badStage.exitCode === 2 &&
      badStage.stderr.includes('--stage must be one of') &&
      badStage.stderr.includes('final'),
    `exit=${badStage.exitCode} stderr=${JSON.stringify(badStage.stderr)}`
  );

  // Case 3: unknown argument.
  const unknown = run(['--version', '0.15.0', '--stage', 'promote', '--what']);
  expect(
    'unknown argument exits 2',
    unknown.exitCode === 2 && unknown.stderr.includes('unknown argument'),
    `exit=${unknown.exitCode} stderr=${JSON.stringify(unknown.stderr)}`
  );

  // Case 4: "--" sentinel accepted.
  const sentinel = run([
    '--',
    '--version',
    '0.15.0',
    '--stage',
    'promote',
    '--skip-remote',
    '--max-updated-age-hours',
    '2000',
  ]);
  expect(
    '"--" sentinel is accepted',
    sentinel.exitCode === 0 && sentinel.stdout.includes('version=0.15.0 stage=promote'),
    `exit=${sentinel.exitCode} stdout=${JSON.stringify(sentinel.stdout.slice(0, 200))}`
  );

  // Case 5: --skip-remote --stage promote on v0.15.0: exit 0, zero RED.
  const offline = run([
    '--version',
    '0.15.0',
    '--stage',
    'promote',
    '--skip-remote',
    '--max-updated-age-hours',
    '2000',
  ]);
  expect(
    '--skip-remote --stage promote on v0.15.0 exits 0 with zero RED',
    offline.exitCode === 0 &&
      offline.stdout.includes('0 RED') &&
      offline.stdout.includes('[GREEN] git-tag'),
    `exit=${offline.exitCode} stdout=${JSON.stringify(offline.stdout)}`
  );

  // Case 6: --json emits valid JSON with rows and counts.
  const jsonRun = run([
    '--version',
    '0.15.0',
    '--stage',
    'promote',
    '--skip-remote',
    '--max-updated-age-hours',
    '2000',
    '--json',
  ]);
  let parsed = null;
  try {
    parsed = JSON.parse(jsonRun.stdout);
  } catch {
    parsed = null;
  }
  expect(
    '--json emits parseable JSON with rows and counts',
    jsonRun.exitCode === 0 &&
      parsed &&
      parsed.version === '0.15.0' &&
      parsed.stage === 'promote' &&
      Array.isArray(parsed.rows) &&
      parsed.rows.length >= 4 &&
      typeof parsed.counts === 'object' &&
      typeof parsed.counts.GREEN === 'number',
    `exit=${jsonRun.exitCode} parsed=${JSON.stringify(parsed).slice(0, 200)}`
  );

  // Case 7: --strict flips exit code to 1 when YELLOW rows are present.
  // Offline mode emits YELLOW rows for npm-dist-tags and github-release, so
  // --strict must produce a nonzero exit.
  const strict = run([
    '--version',
    '0.15.0',
    '--stage',
    'promote',
    '--skip-remote',
    '--max-updated-age-hours',
    '2000',
    '--strict',
  ]);
  expect(
    '--strict fails on YELLOW rows',
    strict.exitCode === 1 && strict.stdout.includes('YELLOW'),
    `exit=${strict.exitCode} stdout=${JSON.stringify(strict.stdout)}`
  );

  // Case 8: --allow-stamp-pending is accepted at stage=promote and does
  // not regress an already-stamped facts.json. Live facts.json has
  // dist_tag=latest, so the facts.json row stays GREEN either way.
  const allowPending = run([
    '--version',
    '0.15.0',
    '--stage',
    'promote',
    '--skip-remote',
    '--max-updated-age-hours',
    '2000',
    '--allow-stamp-pending',
  ]);
  expect(
    '--allow-stamp-pending keeps a GREEN facts.json GREEN',
    allowPending.exitCode === 0 &&
      allowPending.stdout.includes('[GREEN] facts.json') &&
      allowPending.stdout.includes('0 RED'),
    `exit=${allowPending.exitCode} stdout=${JSON.stringify(allowPending.stdout)}`
  );

  // Case 9: --skip-remote --stage final on v0.15.0: exit 0, zero RED.
  // The github-release row is skipped (YELLOW) offline; facts.json and
  // current.json must still be GREEN against the live 0.15.0 artifacts.
  const finalStage = run([
    '--version',
    '0.15.0',
    '--stage',
    'final',
    '--skip-remote',
    '--max-updated-age-hours',
    '2000',
  ]);
  expect(
    '--skip-remote --stage final on v0.15.0 exits 0 with zero RED',
    finalStage.exitCode === 0 &&
      finalStage.stdout.includes('version=0.15.0 stage=final') &&
      finalStage.stdout.includes('0 RED') &&
      finalStage.stdout.includes('[GREEN] facts.json') &&
      finalStage.stdout.includes('[GREEN] current.json'),
    `exit=${finalStage.exitCode} stdout=${JSON.stringify(finalStage.stdout)}`
  );

  // Case 10: classifyGithubRelease stage x state matrix (pure, no network).
  const DRAFT = { tagName: 'v0.15.0', isDraft: true, isPrerelease: false };
  const PRERELEASE = { tagName: 'v0.15.0', isDraft: false, isPrerelease: true };
  const FINALIZED = { tagName: 'v0.15.0', isDraft: false, isPrerelease: false };

  const matrix = [
    ['publish', DRAFT, 'GREEN'],
    ['publish', PRERELEASE, 'GREEN'],
    ['publish', FINALIZED, 'RED'],
    ['promote', DRAFT, 'GREEN'],
    ['promote', PRERELEASE, 'GREEN'],
    ['promote', FINALIZED, 'YELLOW'],
    ['final', DRAFT, 'RED'],
    ['final', PRERELEASE, 'RED'],
    ['final', FINALIZED, 'GREEN'],
    ['mode1', DRAFT, 'RED'],
    ['mode1', PRERELEASE, 'RED'],
    ['mode1', FINALIZED, 'GREEN'],
  ];

  for (const [stage, release, wantStatus] of matrix) {
    const state = release.isDraft
      ? 'draft'
      : release.isPrerelease
        ? 'prerelease'
        : 'finalized';
    const verdict = classifyGithubRelease(stage, release);
    expect(
      `classifyGithubRelease(${stage}, ${state}) -> ${wantStatus}`,
      verdict &&
        verdict.status === wantStatus &&
        typeof verdict.detail === 'string' &&
        verdict.detail.length > 0,
      `got=${JSON.stringify(verdict)}`
    );
  }
} catch (err) {
  failures += 1;
  console.error('FAIL unexpected error:', err && err.stack ? err.stack : err);
}

if (failures > 0) {
  console.error(`\nverify-release-closeout.test: ${failures} case(s) failed`);
  process.exit(1);
} else {
  console.log('\nverify-release-closeout.test: all cases passed');
  process.exit(0);
}
