/**
 * Smoke tests for stamp-release-state.mjs.
 *
 * The script is load-bearing for the release checklist: it stamps mutable
 * release metadata (release_date, updated, dist_tag) in three truth-surface
 * files post-tag and post-promotion. These tests exercise the public CLI
 * contract by spawning the script against an isolated fake-repo directory,
 * so a repo-root run never mutates real files.
 *
 * Contract covered:
 * - Invalid / missing args exit with code 1 and a usage message
 * - --dry-run --publish reports planned changes without writing
 * - --dry-run --promote reports planned changes without writing
 * - --check --mode publish|promote exits 0 when state matches
 * - --check --mode publish|promote exits 3 when state mismatches
 * - Apply mode actually writes the expected values
 * - Idempotency: re-running apply mode is a no-op
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(import.meta.dirname, '..', '..', 'scripts', 'stamp-release-state.mjs');

type RunResult = { stdout: string; stderr: string; exitCode: number };

function runScript(fakeRoot: string, args: string[]): RunResult {
  try {
    const stdout = execFileSync('node', [SCRIPT, '--root', fakeRoot, ...args], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

function seedFakeRepo(
  root: string,
  opts: {
    release_date: string;
    updated: string;
    dist_tag: string;
  }
) {
  mkdirSync(join(root, 'docs', 'releases'), { recursive: true });
  writeFileSync(
    join(root, 'docs', 'releases', 'facts.json'),
    JSON.stringify(
      {
        description: 'test facts',
        version: '0.99.9',
        wire_format_version: '0.2',
        dist_tag: opts.dist_tag,
        release_date: opts.release_date,
        metrics: { tests: 1, test_files: 1, published_packages: 1, build_targets: 1 },
        runtime: {},
        sdks: {},
        provenance: {},
      },
      null,
      2
    ) + '\n'
  );
  writeFileSync(
    join(root, 'docs', 'releases', 'current.json'),
    JSON.stringify(
      { description: 'test current', version: '0.99.9', dist_tag: opts.dist_tag },
      null,
      2
    ) + '\n'
  );
  writeFileSync(
    join(root, 'REPO_SURFACE_STATUS.json'),
    JSON.stringify(
      { description: 'test surface', version: '0.99.9', updated: opts.updated, surfaces: {} },
      null,
      2
    ) + '\n'
  );
}

function readFacts(root: string) {
  return JSON.parse(readFileSync(join(root, 'docs', 'releases', 'facts.json'), 'utf-8')) as Record<
    string,
    unknown
  >;
}
function readCurrent(root: string) {
  return JSON.parse(
    readFileSync(join(root, 'docs', 'releases', 'current.json'), 'utf-8')
  ) as Record<string, unknown>;
}
function readSurface(root: string) {
  return JSON.parse(readFileSync(join(root, 'REPO_SURFACE_STATUS.json'), 'utf-8')) as Record<
    string,
    unknown
  >;
}

describe('stamp-release-state.mjs (CLI)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'stamp-release-state-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Argument parsing / validation
  // -------------------------------------------------------------------------

  describe('argument validation', () => {
    it('exits 1 with usage when no mode is given', () => {
      seedFakeRepo(root, { release_date: '2026-04-10', updated: '2026-04-10', dist_tag: 'next' });
      const result = runScript(root, []);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('must specify --publish or --promote');
      expect(result.stderr).toContain('Usage:');
    });

    it('exits 1 on invalid publish date format', () => {
      seedFakeRepo(root, { release_date: '2026-04-10', updated: '2026-04-10', dist_tag: 'next' });
      const result = runScript(root, ['--publish', 'not-a-date']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('ISO 8601');
    });

    it('exits 1 on invalid promote tag format', () => {
      seedFakeRepo(root, { release_date: '2026-04-10', updated: '2026-04-10', dist_tag: 'next' });
      const result = runScript(root, ['--promote', 'NOT_VALID']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('dist-tag format');
    });
  });

  // -------------------------------------------------------------------------
  // Dry-run modes
  // -------------------------------------------------------------------------

  describe('dry-run', () => {
    it('publish dry-run reports planned changes and does not mutate files', () => {
      seedFakeRepo(root, { release_date: '2026-04-10', updated: '2026-04-10', dist_tag: 'next' });
      const result = runScript(root, ['--dry-run', '--publish', '2026-04-11']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('DRY:');
      expect(result.stdout).toContain('release_date');
      expect(result.stdout).toContain('"2026-04-10" -> "2026-04-11"');
      expect(result.stdout).toContain('updated');
      expect(result.stdout).toContain('dry run: no files written');

      // Files remain unchanged
      expect(readFacts(root).release_date).toBe('2026-04-10');
      expect(readSurface(root).updated).toBe('2026-04-10');
    });

    it('promote dry-run reports planned changes and does not mutate files', () => {
      seedFakeRepo(root, { release_date: '2026-04-10', updated: '2026-04-10', dist_tag: 'next' });
      const result = runScript(root, ['--dry-run', '--promote', 'latest']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('DRY:');
      expect(result.stdout).toContain('dist_tag');
      expect(result.stdout).toContain('"next" -> "latest"');
      expect(result.stdout).toContain('dry run: no files written');

      // Files remain unchanged
      expect(readFacts(root).dist_tag).toBe('next');
      expect(readCurrent(root).dist_tag).toBe('next');
    });
  });

  // -------------------------------------------------------------------------
  // Check modes
  // -------------------------------------------------------------------------

  describe('--check mode', () => {
    it('exits 0 when publish state matches expected', () => {
      seedFakeRepo(root, { release_date: '2026-04-11', updated: '2026-04-11', dist_tag: 'next' });
      const result = runScript(root, ['--check', '--mode', 'publish', '2026-04-11']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('OK:');
    });

    it('exits 3 when publish state does not match expected', () => {
      seedFakeRepo(root, { release_date: '2026-04-10', updated: '2026-04-10', dist_tag: 'next' });
      const result = runScript(root, ['--check', '--mode', 'publish', '2026-04-11']);
      expect(result.exitCode).toBe(3);
      expect(result.stderr).toContain('FAIL:');
    });

    it('exits 0 when promote state matches expected', () => {
      seedFakeRepo(root, { release_date: '2026-04-10', updated: '2026-04-10', dist_tag: 'latest' });
      const result = runScript(root, ['--check', '--mode', 'promote', 'latest']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('OK:');
    });

    it('exits 3 when promote state does not match expected', () => {
      seedFakeRepo(root, { release_date: '2026-04-10', updated: '2026-04-10', dist_tag: 'next' });
      const result = runScript(root, ['--check', '--mode', 'promote', 'latest']);
      expect(result.exitCode).toBe(3);
      expect(result.stderr).toContain('FAIL:');
    });
  });

  // -------------------------------------------------------------------------
  // Apply mode
  // -------------------------------------------------------------------------

  describe('apply mode', () => {
    it('publish writes release_date and updated', () => {
      seedFakeRepo(root, { release_date: '2026-04-10', updated: '2026-04-10', dist_tag: 'next' });
      const result = runScript(root, ['--publish', '2026-04-11']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('WROTE:');

      expect(readFacts(root).release_date).toBe('2026-04-11');
      expect(readSurface(root).updated).toBe('2026-04-11');
    });

    it('promote writes dist_tag on both facts and current', () => {
      seedFakeRepo(root, { release_date: '2026-04-10', updated: '2026-04-10', dist_tag: 'next' });
      const result = runScript(root, ['--promote', 'latest']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('WROTE:');

      expect(readFacts(root).dist_tag).toBe('latest');
      expect(readCurrent(root).dist_tag).toBe('latest');
    });

    it('is idempotent: re-running publish with the same date is a no-op', () => {
      seedFakeRepo(root, { release_date: '2026-04-11', updated: '2026-04-11', dist_tag: 'next' });
      const result = runScript(root, ['--publish', '2026-04-11']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('SKIP:');
      expect(result.stdout).toContain('No changes written');
    });

    it('is idempotent: re-running promote with the same tag is a no-op', () => {
      seedFakeRepo(root, { release_date: '2026-04-10', updated: '2026-04-10', dist_tag: 'latest' });
      const result = runScript(root, ['--promote', 'latest']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('SKIP:');
      expect(result.stdout).toContain('No changes written');
    });
  });
});
