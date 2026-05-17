/**
 * Smoke test for the runtime-composition-records example.
 *
 * Runs the example's `demo` script and asserts that the standard
 * success markers (verify result line and "Demo OK") appear in the
 * output. If the demo silently rots (a fixture path breaks, an
 * adapter export disappears, a verifier interface changes), this
 * test surfaces the regression at PR time instead of release time.
 *
 * The test does not assert exact line counts or whitespace, so
 * harmless polish to the demo output does not break it.
 */

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const EXAMPLE_PKG = '@peac/example-runtime-composition-records';
const RUNNER = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

describe('runtime-composition-records example smoke', () => {
  it('runs the demo and verifies all records', { timeout: 60_000 }, () => {
    const output = execFileSync(RUNNER, ['--filter', EXAMPLE_PKG, 'demo'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(output).toContain('[VERIFY OK]  3 records verified, 0 failed');
    expect(output).toContain('Families: authority_scope / lifecycle_event / policy_decision');
    expect(output).toContain('Demo OK');
  });
});
