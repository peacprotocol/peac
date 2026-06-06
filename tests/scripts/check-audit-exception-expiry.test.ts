/**
 * Tests for scripts/check-audit-exception-expiry.mjs.
 *
 * Exercises the pure evaluateAllowlistExpiry() helper with synthetic
 * allowlist data and a fixed reference date, so the GREEN / YELLOW / RED
 * verdict is deterministic and clock-independent. The helper delegates all
 * validation to parseAllowlist() (no reimplementation); these tests assert
 * the verdict mapping, not the validator internals.
 */

import { describe, it, expect } from 'vitest';

import { evaluateAllowlistExpiry } from '../../scripts/check-audit-exception-expiry.mjs';

// Fixed reference date for every case.
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
