/**
 * The supported Node lines must all block a merge.
 *
 * Node 26 was advisory while the Ed25519 profile delegated low-order signature R to the runtime
 * primitive: the lane reported a real divergence that no CI policy could fix. Once the profile
 * decides that case itself, an advisory lane would hide a genuine regression instead.
 *
 * Node 26 is the Current line, not LTS. It is an additional blocking lane, never a replacement for
 * either LTS line, so this asserts all three are present and none is exempted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CI = readFileSync(join(__dirname, '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');

/** The node-compat job body, from its key to the next job at the same indentation. */
const nodeCompat = (() => {
  const start = CI.indexOf('\n  node-compat:\n');
  expect(start, 'the node-compat job was not found').toBeGreaterThan(-1);
  const rest = CI.slice(start + 1);
  const next = /\n {2}[a-z][a-z0-9-]*:\n/.exec(rest.slice(1));
  return next ? rest.slice(0, next.index + 1) : rest;
})();

describe('every supported Node line blocks', () => {
  it.each([
    ['22 floor', "node-version: '22"],
    ['24 primary', "node-version: '24"],
    ['26 current', "node-version: '26'"],
  ])('the %s lane is present', (_label, selector) => {
    expect(nodeCompat).toContain(selector);
  });

  it('no lane is exempted from blocking', () => {
    // `experimental` drives continue-on-error; a true value makes a red lane merge-able.
    expect(nodeCompat).not.toContain('experimental: true');
  });

  it('the job still records the resolved version for the floating selector', () => {
    // A floating major is only reproducible if the version actually tested is captured.
    expect(nodeCompat).toContain('check-latest: true');
    expect(CI).toMatch(/resolved.{0,40}[Nn]ode|node --version/);
  });
});
