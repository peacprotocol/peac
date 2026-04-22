/**
 * cf-policy-x402-terms demo smoke test.
 *
 * Runs `tsx demo.ts` from the example directory and asserts the demo
 * exits 0 and prints the expected "Demo OK." line. Asserts the four
 * representation digest lines are present and that uri reports
 * `unavailable`. Confirms the cross-representation `failed` lock fires.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_DIR = resolve(HERE, '..');

describe('cf-policy-x402-terms demo', () => {
  it('runs end-to-end and prints expected output', () => {
    const result = spawnSync('npx', ['-y', 'tsx', 'demo.ts'], {
      cwd: EXAMPLE_DIR,
      encoding: 'utf8',
      timeout: 60_000,
    });

    if (result.status !== 0) {
      console.error('demo stdout:\n', result.stdout);
      console.error('demo stderr:\n', result.stderr);
    }
    expect(result.status).toBe(0);
    const out = result.stdout;
    expect(out).toContain('cf-policy-x402-terms demo');
    expect(out).toContain('[1] policy digest:  sha256:');
    expect(out).toContain('[2] jws issued:');
    expect(out).toMatch(/uri\s+= unavailable/);
    expect(out).toMatch(/markdown\s+= sha256:/);
    expect(out).toMatch(/plaintext\s+= sha256:/);
    expect(out).toMatch(/json\s+= sha256:/);
    expect(out).toContain('policy_binding:      verified');
    expect(out).toContain('bindings.terms.stat: verified');
    expect(out).toContain(
      '[5] cross-representation (json publisher vs plaintext verifier): failed'
    );
    expect(out).toContain('[6] omitted publisher canonical_digest: unavailable');
    expect(out).toContain('Demo OK.');
  }, 90_000);
});
