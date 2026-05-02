/**
 * Self-test for the RESOURCE-LIMITS check in scripts/verify-trust-artifacts.mjs.
 *
 * Asserts:
 *   - The verifier runs cleanly against the live `docs/specs/RESOURCE-LIMITS.md`
 *     invariant tables (every Constant + Test link resolves to a tracked file,
 *     directly or via the documented `same` / bare-identifier inheritance idioms).
 *   - When the verifier is pointed at a contrived RESOURCE-LIMITS document with a
 *     deliberately-broken link, it surfaces the violation in JSON output. Proves
 *     the third check is wired correctly and is not silently passing.
 *
 * The contrived-document test runs the verifier as a subprocess against a
 * scratch repo layout under `packages/cli/__tests__/` (mirroring the
 * `verify-fetch-cleanup.test.ts` pattern), so no live repo file is mutated.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'verify-trust-artifacts.mjs');

describe('verify-trust-artifacts: RESOURCE-LIMITS check', () => {
  it('runs cleanly against the live docs/specs/RESOURCE-LIMITS.md', () => {
    const stdout = execFileSync('node', [SCRIPT, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const report = JSON.parse(stdout) as {
      ok: boolean;
      violations: Array<{ check: string; file: string; line: number; message: string }>;
    };
    const resourceLimitsViolations = report.violations.filter((v) =>
      v.check.startsWith('resource-limits-')
    );
    expect(resourceLimitsViolations).toEqual([]);
    expect(report.ok).toBe(true);
  });

  describe('contrived-document smoke', () => {
    const SCRATCH = join(REPO_ROOT, 'packages', 'cli', '__tests__', '__rl_trust_smoke');

    afterEach(() => {
      try {
        rmSync(SCRATCH, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });

    it('flags a row with a broken Test-column link', () => {
      mkdirSync(join(SCRATCH, 'docs', 'specs'), { recursive: true });
      mkdirSync(join(SCRATCH, 'docs'), { recursive: true });
      mkdirSync(join(SCRATCH, 'scripts'), { recursive: true });
      mkdirSync(join(SCRATCH, 'real-target'), { recursive: true });
      writeFileSync(join(SCRATCH, 'real-target', 'real.test.ts'), '// real\n');

      // Minimal THREAT_MODEL.md and STABILITY-CONTRACT.md so the
      // upstream checks pass without noise. We only care about the
      // RESOURCE-LIMITS check here.
      writeFileSync(join(SCRATCH, 'docs', 'THREAT_MODEL.md'), '# Threat model\n');
      writeFileSync(join(SCRATCH, 'docs', 'STABILITY-CONTRACT.md'), '# Stability contract\n');

      // RESOURCE-LIMITS doc with one row pointing at a non-existent file.
      const broken = [
        '# Resource limits',
        '',
        '## Invariant table',
        '',
        '### Smoke',
        '',
        '| Invariant | Value | Constant | Test |',
        '| --- | --- | --- | --- |',
        '| ok-row | 1 | `X` ([`real-target/real.test.ts`](../../real-target/real.test.ts)) | [`real-target/real.test.ts`](../../real-target/real.test.ts) |',
        '| broken-row | 2 | `Y` ([`nope/missing.ts`](../../nope/missing.ts)) | [`nope/missing.test.ts`](../../nope/missing.test.ts) |',
        '',
      ].join('\n');
      writeFileSync(join(SCRATCH, 'docs', 'specs', 'RESOURCE-LIMITS.md'), broken);

      // Copy the verifier into the scratch tree so its REPO_ROOT
      // resolution lands on the scratch root. Cross-platform: use
      // node:fs rather than spawning a shell utility.
      const scriptText = readFileSync(SCRIPT, 'utf8');
      writeFileSync(join(SCRATCH, 'scripts', 'verify-trust-artifacts.mjs'), scriptText);

      let stdout = '';
      let nonZeroExit = false;
      try {
        stdout = execFileSync(
          'node',
          [join(SCRATCH, 'scripts', 'verify-trust-artifacts.mjs'), '--json'],
          { cwd: SCRATCH, encoding: 'utf8' }
        );
      } catch (err) {
        nonZeroExit = true;
        stdout = (err as { stdout?: Buffer }).stdout?.toString() ?? '';
      }

      expect(nonZeroExit).toBe(true);
      const report = JSON.parse(stdout) as {
        ok: boolean;
        violations: Array<{ check: string; file: string; line: number; message: string }>;
      };
      expect(report.ok).toBe(false);
      const broken_links = report.violations.filter(
        (v) => v.check === 'resource-limits-broken-link'
      );
      // Two entries (constant + test link both broken on broken-row).
      expect(broken_links.length).toBeGreaterThanOrEqual(1);
    }, 30_000);
  });
});
