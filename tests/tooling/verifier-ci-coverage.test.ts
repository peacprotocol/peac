/**
 * The browser verifier's tests must run on the required CI path.
 *
 * The verifier is a private application, so it is not covered by the root test project or by the
 * core-package test lane. Without an explicit job step its suite never executes in CI, and a
 * regression can merge while every required check reports success. That failure mode is invisible:
 * a green required check looks identical whether the suite ran or was never invoked.
 *
 * These assertions pin the wiring itself rather than the workflow file's exact shape, so ordinary
 * edits to unrelated steps do not break them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const CI = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

const OWNING_JOB = 'examples-apps';
const REQUIRED_CHECK = 'Build, Lint, Test';

/** The body of one top-level job, from its key to the next job key at the same indentation. */
function jobBody(name: string): string {
  const start = CI.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name} is not defined`).toBeGreaterThan(-1);
  const rest = CI.slice(start + 1);
  const next = /\n {2}[a-z][a-z0-9-]*:\n/.exec(rest.slice(1));
  return next ? rest.slice(0, next.index + 1) : rest;
}

describe('the verifier suite runs on the required path', () => {
  const body = jobBody(OWNING_JOB);

  it.each([
    ['typecheck', 'pnpm --filter @peac/app-verifier typecheck'],
    ['tests', 'pnpm --filter @peac/app-verifier test'],
    ['build', 'pnpm --filter @peac/app-verifier build'],
    ['source boundary', 'node scripts/check-browser-verifier-boundary.mjs'],
    ['source boundary self-test', 'node scripts/check-browser-verifier-boundary.mjs --self-test'],
    ['emitted bundle', 'node scripts/check-verifier-bundle.mjs'],
    ['emitted bundle self-test', 'node scripts/check-verifier-bundle.mjs --self-test'],
  ])('the %s command is present in the owning job', (_label, command) => {
    expect(body).toContain(command);
  });

  it('builds the verifier before inspecting its emitted bundle', () => {
    // The bundle check reads build output. Running it first would inspect a stale or absent dist
    // and could pass without examining anything this commit produced.
    const build = body.indexOf('pnpm --filter @peac/app-verifier build');
    const bundle = body.indexOf('node scripts/check-verifier-bundle.mjs');
    expect(build).toBeGreaterThan(-1);
    expect(bundle).toBeGreaterThan(-1);
    expect(build).toBeLessThan(bundle);
  });
});

describe('the owning job is genuinely required', () => {
  it('is listed in the required aggregator dependencies', () => {
    const required = new RegExp(
      `name: ${REQUIRED_CHECK}\\s*\\n\\s*needs:\\s*\\n\\s*\\[([^\\]]+)\\]`
    );
    const match = required.exec(CI);
    expect(match, `the ${REQUIRED_CHECK} aggregator was not found`).not.toBeNull();
    expect(match?.[1]).toContain(OWNING_JOB);
  });

  it('blocks the aggregator when it fails', () => {
    // Being in `needs` is not sufficient: the aggregator runs with `if: always()` and decides per
    // lane, so a lane whose failure is not inspected would never block a merge.
    const aggregator = CI.slice(CI.indexOf(`name: ${REQUIRED_CHECK}`));
    expect(aggregator).toMatch(
      new RegExp(`needs\\.${OWNING_JOB}\\.result.*==.*["']failure["'][\\s\\S]{0,200}exit 1`)
    );
  });

  it('runs whenever the verifier changes', () => {
    // The job is conditional, so the path filter that gates it must cover the verifier's tree.
    expect(CI).toMatch(/apps:\s*\n\s*- 'apps\/\*\*'/);
    const body = jobBody(OWNING_JOB);
    expect(body).toContain("needs.detect-changes.outputs.apps == 'true'");
  });
});
