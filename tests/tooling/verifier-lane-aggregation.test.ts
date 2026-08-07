/**
 * The required aggregate must refuse a verifier lane that did not run.
 *
 * GitHub reports a conditionally skipped job as `success` to its dependents. An aggregate that only
 * rejects `failure` therefore stays green when the lane never executed, which is indistinguishable
 * from the lane having passed.
 *
 * These tests extract the aggregate's decision script from the workflow and execute it under bash
 * with substituted lane results, observing the decision itself.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const CI = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

/** The `run:` script of the aggregate's evaluation step, dedented to column zero. */
function aggregatorScript(): string {
  const marker = '      - name: Evaluate lane results\n        run: |\n';
  const start = CI.indexOf(marker);
  expect(start, 'the aggregate evaluation step was not found').toBeGreaterThan(-1);
  const rest = CI.slice(start + marker.length);
  const lines: string[] = [];
  for (const line of rest.split('\n')) {
    // The block ends at the first line that is neither blank nor indented past the script body.
    if (line.trim() !== '' && !line.startsWith('          ')) break;
    lines.push(line.slice(10));
  }
  return lines.join('\n');
}

/**
 * Run the aggregate's decision with the given lane results substituted for their expressions.
 * Returns the exit status, which is what actually gates a merge.
 */
function evaluate(values: Record<string, string>): number {
  let script = aggregatorScript();
  script = script.replace(/\$\{\{\s*([a-zA-Z0-9_.\-]+)\s*\}\}/g, (_m, expr: string) => {
    if (!(expr in values)) throw new Error(`unsubstituted workflow expression: ${expr}`);
    return values[expr];
  });
  try {
    execFileSync('bash', ['-c', script], { encoding: 'utf8', stdio: 'pipe' });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

/** All lanes passing, with the verifier activation flag and lane result under test. */
function lanes(verifierCi: string, examplesApps: string): Record<string, string> {
  return {
    'needs.detect-changes.outputs.verifier_ci': verifierCi,
    // Unrelated activation outputs, held at values that keep the other rules satisfied so each
    // test isolates the verifier rule.
    'needs.detect-changes.outputs.stamp_any': 'false',
    'needs.detect-changes.outputs.non_stamp': 'true',
    'needs.workflow-lint.result': 'success',
    'needs.fast-guards.result': 'success',
    'needs.type-build.result': 'success',
    'needs.tests-core.result': 'success',
    'needs.tooling-gates.result': 'success',
    'needs.examples-apps.result': examplesApps,
    'needs.pack-smoke.result': 'success',
    'needs.node-compat.result': 'success',
  };
}

describe('a verifier lane that did not run cannot pass the aggregate', () => {
  it('verifier paths changed and the lane succeeded: accepted', () => {
    expect(evaluate(lanes('true', 'success'))).toBe(0);
  });

  it('verifier paths changed and the lane was SKIPPED: rejected', () => {
    // The exact defect this exists to prevent: skipped reads as success to dependents.
    expect(evaluate(lanes('true', 'skipped'))).not.toBe(0);
  });

  it('verifier paths changed and the lane failed: rejected', () => {
    expect(evaluate(lanes('true', 'failure'))).not.toBe(0);
  });

  it('verifier paths unchanged and the lane was skipped: allowed', () => {
    // Unrelated changes must not be forced through the application lane.
    expect(evaluate(lanes('false', 'skipped'))).toBe(0);
  });

  it('verifier paths unchanged and the lane failed: still rejected', () => {
    // The pre-existing generic failure handling must survive the added rule.
    expect(evaluate(lanes('false', 'failure'))).not.toBe(0);
  });
});
