/**
 * The supported Node lines must all block a merge, transitively.
 *
 * Two failure modes are asserted:
 *
 *   1. a lane that reports failure but is not a protected context. Only `Build, Lint, Test` is
 *      protected, so other lanes block only by being in its `needs` and having their result
 *      inspected;
 *   2. a lane exempted with `continue-on-error`, which reports success when it failed.
 *
 * Parsed as YAML rather than matched as text: the matrix mixes exact and floating selectors.
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
    // This lane is the compatibility floor and must equal the declared engines range.
    const floor = lanes.find((l) => String(l['node-version']).startsWith('22'));
    expect(floor).toBeDefined();
    expect(floor!['node-version']).toBe('22.13.0');
    expect(rootEngines).toBeDefined();
    expect(rootEngines).toContain('22.13.0');
  });

  it('floats the primary LTS line and resolves newest', () => {
    // Ed25519 admissibility changed within the 24 line at 24.19.0, so the lane floats.
    const primary = lanes.find((l) => String(l['node-version']).startsWith('24'));
    expect(primary).toBeDefined();
    expect(String(primary!['node-version'])).toBe('24');
    expect(primary!['check-latest']).toBe(true);
  });

  it('keeps the Current line a floating major that resolves newest', () => {
    // Reproducibility comes from recording the resolved version, asserted below.
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
    // "Build, Lint, Test" is the protected context; the matrix gates merges through it.
    expect(aggregate.needs).toContain('node-compat');
  });

  it('the aggregate fails unless node-compat succeeded', () => {
    // `needs` membership alone blocks nothing under `if: always()`. The matrix is unconditional,
    // so a skipped result means it did not run and must not pass.
    const evaluate = (aggregate.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(evaluate).toMatch(/needs\.node-compat\.result.*!=.*["']success["'][\s\S]{0,200}exit 1/);
  });

  it('reports the lane result so a reader can see what was decided', () => {
    const evaluate = (aggregate.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(evaluate).toContain('needs.node-compat.result');
  });
});
