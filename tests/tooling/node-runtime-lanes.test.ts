/**
 * The supported Node lines must all block a merge, transitively.
 *
 * Two distinct failure modes are asserted, because either alone gives false assurance:
 *
 *   1. a lane that reports failure but is not a protected context, so a red result is visible
 *      yet merge-able. Only `Build, Lint, Test` is protected, so every other lane blocks only
 *      by being in its `needs` AND having its result inspected;
 *   2. a lane exempted with `continue-on-error`, which reports success even when it failed.
 *
 * Parsed as YAML rather than matched as text: the matrix deliberately mixes exact and floating
 * selectors, and substring matching over that is brittle in both directions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const ROOT = join(__dirname, '..', '..');
const CI_PATH = join(ROOT, '.github', 'workflows', 'ci.yml');
const CI_TEXT = readFileSync(CI_PATH, 'utf8');
const ci = parse(CI_TEXT) as {
  jobs: Record<
    string,
    {
      name?: string;
      needs?: string[];
      'continue-on-error'?: string;
      strategy?: { matrix?: { include?: Record<string, unknown>[] } };
      steps?: { name?: string; run?: string }[];
    }
  >;
};

const REQUIRED_CHECK = 'Build, Lint, Test';
const aggregate = Object.values(ci.jobs).find((j) => j.name === REQUIRED_CHECK)!;
const nodeCompat = ci.jobs['node-compat'];
const lanes = nodeCompat.strategy?.matrix?.include ?? [];

const rootEngines = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { engines?: { node?: string } }
).engines?.node;

describe('the Node compatibility matrix is well formed', () => {
  it('declares exactly the three supported lines', () => {
    expect(lanes).toHaveLength(3);
  });

  it('pins the declared engines floor exactly', () => {
    // An exact pin here is the point: this lane is the compatibility floor, and it must equal
    // what the package claims to support.
    const floor = lanes.find((l) => String(l['node-version']).startsWith('22'));
    expect(floor).toBeDefined();
    expect(floor!['node-version']).toBe('22.13.0');
    expect(rootEngines).toBeDefined();
    expect(rootEngines).toContain('22.13.0');
  });

  it('floats the primary LTS line and resolves newest', () => {
    // Ed25519 admissibility changed within the 24 line at 24.19.0. An exact pin one patch behind
    // would have reported compatibility the release baseline no longer had.
    const primary = lanes.find((l) => String(l['node-version']).startsWith('24'));
    expect(primary).toBeDefined();
    expect(String(primary!['node-version'])).toBe('24');
    expect(primary!['check-latest']).toBe(true);
  });

  it('keeps the Current line a floating major that resolves newest', () => {
    // A forgotten exact pin stops being a Current canary; reproducibility comes from recording
    // the resolved version, which the job does below.
    const current = lanes.find((l) => String(l['node-version']) === '26');
    expect(current).toBeDefined();
    expect(current!['check-latest']).toBe(true);
  });

  it('exempts no lane from blocking', () => {
    for (const lane of lanes) expect(lane.experimental).toBe(false);
  });

  it('drives continue-on-error from the matrix flag, so an exemption is visible in one place', () => {
    expect(nodeCompat['continue-on-error']).toBe('${{ matrix.experimental }}');
  });

  it('records the resolved version for the floating selector', () => {
    const steps = (nodeCompat.steps ?? []).map((s) => s.name ?? '');
    expect(steps.some((n) => /resolved/i.test(n))).toBe(true);
  });
});

describe('the matrix is transitively required by the protected context', () => {
  it('the aggregate depends on node-compat', () => {
    // Only "Build, Lint, Test" is protected, so the matrix gates merges through this dependency.
    expect(aggregate.needs).toContain('node-compat');
  });

  it('the aggregate fails unless node-compat succeeded', () => {
    // `needs` membership alone blocks nothing under `if: always()`. The result must be inspected,
    // and skipped must not pass: the matrix is unconditional, so a skip means it did not run.
    const evaluate = (aggregate.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(evaluate).toMatch(/needs\.node-compat\.result.*!=.*["']success["'][\s\S]{0,200}exit 1/);
  });

  it('reports the lane result so a reader can see what was decided', () => {
    const evaluate = (aggregate.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(evaluate).toContain('needs.node-compat.result');
  });
});
