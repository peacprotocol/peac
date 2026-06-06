/**
 * Tests for scripts/check-audit-exception-expiry.mjs.
 *
 * Exercises the pure evaluateAllowlistExpiry() helper with synthetic
 * allowlist data and a fixed reference date, so the GREEN / YELLOW / RED
 * verdict is deterministic and clock-independent. The helper delegates all
 * validation to parseAllowlist() (no reimplementation); these tests assert
 * the verdict mapping, not the validator internals.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import { evaluateAllowlistExpiry } from '../../scripts/check-audit-exception-expiry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'check-audit-exception-expiry.mjs');

// Fixed reference date for every pure-helper case.
const NOW = new Date('2026-06-06T00:00:00Z');

let seq = 0;

function makeEntry(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return {
    advisory_id: `GHSA-test-${String(seq).padStart(4, '0')}-abcd`,
    package: 'vulnerable',
    reason: 'Transitive dev dependency, no exposure in our usage',
    why_not_exploitable:
      'The vulnerable code path requires attacker-supplied input that never reaches this transitive dev dependency in our usage',
    where_used: 'Root devDependency chain: parent@1.0.0 -> vulnerable@2.0.0',
    expires_at: '2026-08-01',
    remediation: 'Upstream fix tracked; bump when released',
    issue_url: 'https://github.com/peacprotocol/peac/issues/1',
    scope: 'dev',
    dependency_chain: ['parent@1.0.0', 'vulnerable@2.0.0'],
    verified_by: 'pnpm why vulnerable',
    owner: 'maintainer',
    added_at: '2026-06-01',
    ...overrides,
  };
}

function withAllowlist(entries: Array<Record<string, unknown>>) {
  return { allowlist: entries };
}

describe('evaluateAllowlistExpiry', () => {
  it('returns GREEN for a healthy allowlist', () => {
    const raw = withAllowlist([
      makeEntry({ expires_at: '2026-08-01', added_at: '2026-06-01', reviewed_at: '2026-06-01' }),
    ]);
    const result = evaluateAllowlistExpiry(raw, NOW);
    expect(result.status).toBe('GREEN');
    expect(result.counts.active).toBe(1);
    expect(result.counts.warnings).toBe(0);
  });

  it('returns GREEN for an empty allowlist', () => {
    expect(evaluateAllowlistExpiry(withAllowlist([]), NOW).status).toBe('GREEN');
  });

  it('returns GREEN when there is no allowlist array', () => {
    expect(evaluateAllowlistExpiry({}, NOW).status).toBe('GREEN');
  });

  it('returns RED on an expired entry', () => {
    const raw = withAllowlist([makeEntry({ expires_at: '2026-06-01' })]);
    const result = evaluateAllowlistExpiry(raw, NOW);
    expect(result.status).toBe('RED');
    expect(result.expired.length).toBe(1);
  });

  it('returns RED on an invalid entry (missing required field)', () => {
    const raw = withAllowlist([makeEntry({ package: undefined })]);
    const result = evaluateAllowlistExpiry(raw, NOW);
    expect(result.status).toBe('RED');
    expect(result.invalid.length).toBe(1);
  });

  it('returns YELLOW for an entry expiring within the warning window', () => {
    const raw = withAllowlist([
      makeEntry({ expires_at: '2026-06-15', added_at: '2026-06-01', reviewed_at: '2026-06-01' }),
    ]);
    const result = evaluateAllowlistExpiry(raw, NOW);
    expect(result.status).toBe('YELLOW');
    expect(result.counts.warnings).toBe(1);
    expect(result.counts.active).toBe(1);
  });

  it('returns YELLOW for an entry past the review window without reviewed_at', () => {
    const raw = withAllowlist([makeEntry({ added_at: '2026-04-20' })]); // 47 days before NOW
    const result = evaluateAllowlistExpiry(raw, NOW);
    expect(result.status).toBe('YELLOW');
    expect(result.counts.warnings).toBe(1);
  });

  it('fails closed: a long-unreviewed entry becomes RED under strict', () => {
    // Added more than the 60-day review window before NOW, no reviewed_at.
    const raw = withAllowlist([makeEntry({ added_at: '2026-03-01' })]);
    const lenient = evaluateAllowlistExpiry(raw, NOW, { strict: false });
    expect(lenient.status).toBe('YELLOW');
    const strict = evaluateAllowlistExpiry(raw, NOW, { strict: true });
    expect(strict.status).toBe('RED');
    expect(strict.invalid.length).toBe(1);
  });

  it('sorts active entries by ascending days-to-expiry', () => {
    const raw = withAllowlist([
      makeEntry({ expires_at: '2026-08-20', reviewed_at: '2026-06-01' }),
      makeEntry({ expires_at: '2026-07-01', reviewed_at: '2026-06-01' }),
    ]);
    const result = evaluateAllowlistExpiry(raw, NOW);
    expect(result.active.map((e: { expires_at: string }) => e.expires_at)).toEqual([
      '2026-07-01',
      '2026-08-20',
    ]);
  });
});

describe('check-audit-exception-expiry CLI', () => {
  let dir: string;
  let healthy: string;
  let warning: string;

  // Fixture dates are computed from the real current date because the CLI
  // uses new Date() at runtime; the synthetic files keep the CLI tests off
  // the live security/audit-allowlist.json.
  function ymd(offsetDays: number) {
    return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
  }

  function entry(overrides: Record<string, unknown> = {}) {
    seq += 1;
    return {
      advisory_id: `GHSA-cli-${String(seq).padStart(4, '0')}-abcd`,
      package: 'vulnerable',
      reason: 'Transitive dev dependency, no exposure in our usage',
      why_not_exploitable:
        'The vulnerable code path requires attacker-supplied input that never reaches this transitive dev dependency in our usage',
      where_used: 'Root devDependency chain: parent@1.0.0 -> vulnerable@2.0.0',
      expires_at: ymd(60),
      remediation: 'Upstream fix tracked; bump when released',
      issue_url: 'https://github.com/peacprotocol/peac/issues/1',
      scope: 'dev',
      dependency_chain: ['parent@1.0.0', 'vulnerable@2.0.0'],
      verified_by: 'pnpm why vulnerable',
      owner: 'maintainer',
      added_at: ymd(-5),
      reviewed_at: ymd(-5),
      ...overrides,
    };
  }

  function runCli(args: string[]) {
    let stdout = '';
    let exitCode = 0;
    try {
      stdout = execFileSync('node', [SCRIPT, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      });
    } catch (err) {
      const e = err as { status?: number; stdout?: Buffer | string };
      exitCode = e.status ?? -1;
      stdout = (e.stdout || '').toString();
    }
    return { stdout, exitCode };
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'peac-audit-allowlist-'));
    healthy = join(dir, 'healthy.json');
    warning = join(dir, 'warning.json');
    writeFileSync(healthy, JSON.stringify({ allowlist: [entry()] }));
    writeFileSync(warning, JSON.stringify({ allowlist: [entry({ expires_at: ymd(5) })] }));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('--allowlist healthy --json exits 0 with GREEN JSON', () => {
    const r = runCli(['--allowlist', healthy, '--json']);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.status).toBe('GREEN');
  });

  it('--allowlist warning exits 0 with YELLOW (default mode)', () => {
    const r = runCli(['--allowlist', warning]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('summary: YELLOW');
  });

  it('--allowlist warning --strict exits 1', () => {
    const r = runCli(['--allowlist', warning, '--strict']);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain('summary: YELLOW');
  });

  it('--allowlist with no path exits 2', () => {
    expect(runCli(['--allowlist']).exitCode).toBe(2);
  });

  it('unknown argument exits 2', () => {
    expect(runCli(['--nope']).exitCode).toBe(2);
  });

  it('importing the module does not execute main()', () => {
    const url = JSON.stringify(pathToFileURL(SCRIPT).href);
    const out = execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `import(${url}).then((m) => process.stdout.write(typeof m.evaluateAllowlistExpiry));`,
      ],
      { encoding: 'utf8' }
    );
    // If main() ran on import it would print the report and exit; a clean
    // "function" with no summary line proves the main guard holds.
    expect(out).toBe('function');
  });
});
