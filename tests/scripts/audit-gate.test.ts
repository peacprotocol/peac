/**
 * Tests for audit-gate-lib.mjs: allowlist parsing, advisory extraction,
 * and classification logic.
 *
 * Tests import the actual lib functions (no reimplementation).
 * Advisory extraction uses captured pnpm audit fixtures.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseAllowlist,
  extractAdvisories,
  classifyAdvisories,
  MAX_EXPIRY_DAYS,
  MAX_EXPIRY_DAYS_PROD,
  EXPIRY_WARNING_DAYS,
  REVIEW_WINDOW_DAYS,
  VALID_SCOPES,
} from '../../scripts/audit-gate-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, '..', '..', 'security', 'audit-allowlist.schema.json');
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));

const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'audit');

function loadFixture(name: string) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
}

function makeEntry(overrides = {}) {
  return {
    advisory_id: 'GHSA-test-1234-abcd',
    package: 'vulnerable',
    reason: 'Transitive dep, no exposure in our usage',
    why_not_exploitable:
      'Vulnerable code path requires user-supplied input that never reaches this transitive dependency in our usage',
    where_used: 'Root devDependency chain: parent@1.0.0 -> vulnerable@2.0.0',
    expires_at: '2026-03-15',
    remediation: 'Upgrade transitive dep in next patch',
    issue_url: 'https://github.com/peacprotocol/peac/issues/999',
    scope: 'dev',
    dependency_chain: ['parent@1.0.0', 'vulnerable@2.0.0'],
    verified_by: 'pnpm audit --prod shows clean',
    owner: 'testuser',
    added_at: '2026-02-13',
    ...overrides,
  };
}

const REF_DATE = new Date('2026-02-13T12:00:00Z');

// ---------------------------------------------------------------------------
// parseAllowlist
// ---------------------------------------------------------------------------

describe('parseAllowlist', () => {
  it('active entry within window is allowlisted', () => {
    const { active, expired, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ expires_at: '2026-03-15' })] },
      REF_DATE
    );
    expect(active.size).toBe(1);
    expect(expired).toHaveLength(0);
    expect(invalid).toHaveLength(0);
  });

  it('expired entry is ignored (not allowlisted)', () => {
    const { active, expired } = parseAllowlist(
      { allowlist: [makeEntry({ expires_at: '2026-02-12' })] },
      REF_DATE
    );
    expect(active.size).toBe(0);
    expect(expired).toHaveLength(1);
    expect(expired[0]).toBe('GHSA-test-1234-abcd');
  });

  it('malformed date fails closed (entry rejected)', () => {
    const { active, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ expires_at: 'not-a-date' })] },
      REF_DATE
    );
    expect(active.size).toBe(0);
    expect(invalid.length).toBeGreaterThan(0);
    expect(invalid[0]).toContain('bad date format');
  });

  it('missing expires_at fails closed', () => {
    const entry = makeEntry();
    delete (entry as Record<string, unknown>).expires_at;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('missing issue_url fails closed', () => {
    const entry = makeEntry();
    delete (entry as Record<string, unknown>).issue_url;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('missing remediation fails closed', () => {
    const entry = makeEntry();
    delete (entry as Record<string, unknown>).remediation;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('missing advisory_id fails closed', () => {
    const entry = makeEntry();
    delete (entry as Record<string, unknown>).advisory_id;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toBe('<missing id>');
  });

  it('expiry beyond 90-day max is rejected', () => {
    const { active, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ expires_at: '2026-06-01' })] },
      REF_DATE
    );
    expect(active.size).toBe(0);
    expect(invalid.length).toBeGreaterThan(0);
    expect(invalid[0]).toContain(`exceeds ${MAX_EXPIRY_DAYS}-day max`);
  });

  it('expiry exactly at 90 days is accepted', () => {
    // 90 days from Feb 13 = May 14
    const { active } = parseAllowlist(
      { allowlist: [makeEntry({ expires_at: '2026-05-14' })] },
      REF_DATE
    );
    expect(active.size).toBe(1);
  });

  it('null/undefined allowlist array returns empty', () => {
    const { active } = parseAllowlist({ allowlist: null }, REF_DATE);
    expect(active.size).toBe(0);
  });

  it('missing allowlist key returns empty', () => {
    const { active } = parseAllowlist({}, REF_DATE);
    expect(active.size).toBe(0);
  });

  it('multiple entries: mix of active, expired, and invalid', () => {
    const { active, expired, invalid } = parseAllowlist(
      {
        allowlist: [
          makeEntry({ advisory_id: 'GHSA-active-1', expires_at: '2026-03-15' }),
          makeEntry({
            advisory_id: 'GHSA-expired-1',
            expires_at: '2026-01-01',
          }),
          makeEntry({ advisory_id: 'GHSA-bad-date', expires_at: 'bad-date' }),
        ],
      },
      REF_DATE
    );
    expect(active.size).toBe(1);
    expect(active.has('GHSA-active-1')).toBe(true);
    expect(expired).toHaveLength(1);
    expect(expired[0]).toBe('GHSA-expired-1');
    expect(invalid).toHaveLength(1);
  });

  it('schema requires all fields including new ones', () => {
    const required = schema.properties.allowlist.items.required;
    expect(required).toContain('advisory_id');
    expect(required).toContain('package');
    expect(required).toContain('reason');
    expect(required).toContain('why_not_exploitable');
    expect(required).toContain('where_used');
    expect(required).toContain('issue_url');
    expect(required).toContain('remediation');
    expect(required).toContain('scope');
    expect(required).toContain('dependency_chain');
    expect(required).toContain('verified_by');
    expect(required).toContain('owner');
    expect(required).toContain('added_at');
  });

  it('missing package fails closed', () => {
    const entry = makeEntry();
    delete (entry as Record<string, unknown>).package;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('missing why_not_exploitable fails closed', () => {
    const entry = makeEntry();
    delete (entry as Record<string, unknown>).why_not_exploitable;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('missing where_used fails closed', () => {
    const entry = makeEntry();
    delete (entry as Record<string, unknown>).where_used;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  // --- New field validation tests ---

  it('missing scope fails closed', () => {
    const entry = makeEntry();
    delete (entry as Record<string, unknown>).scope;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('invalid scope value fails closed', () => {
    const { active, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ scope: 'staging' })] },
      REF_DATE
    );
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toContain('invalid scope');
  });

  it('missing dependency_chain fails closed', () => {
    const entry = makeEntry();
    delete (entry as Record<string, unknown>).dependency_chain;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('empty dependency_chain fails closed', () => {
    const { active, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ dependency_chain: [] })] },
      REF_DATE
    );
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('dependency_chain exceeding 20 entries fails closed', () => {
    const chain = Array.from({ length: 21 }, (_, i) => `pkg${i}@1.0.0`);
    const { active, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ dependency_chain: chain })] },
      REF_DATE
    );
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toContain('exceeds 20');
  });

  it('missing verified_by fails closed', () => {
    const entry = makeEntry();
    delete (entry as Record<string, unknown>).verified_by;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('missing owner fails closed', () => {
    const entry = makeEntry();
    delete (entry as Record<string, unknown>).owner;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('missing added_at fails closed', () => {
    const entry = makeEntry();
    delete (entry as Record<string, unknown>).added_at;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('non-ISO date format for added_at fails closed', () => {
    const { active, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ added_at: '02/13/2026' })] },
      REF_DATE
    );
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toContain('bad added_at format');
  });

  it('non-ISO date format for expires_at fails closed', () => {
    const { active, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ expires_at: '2026-3-15' })] },
      REF_DATE
    );
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toContain('bad date format');
  });

  it('prod scope enforces 30-day max expiry', () => {
    // 31 days from Feb 13 = March 16
    const { active, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ scope: 'prod', expires_at: '2026-03-16' })] },
      REF_DATE
    );
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toContain(`exceeds ${MAX_EXPIRY_DAYS_PROD}-day max`);
    expect(invalid[0]).toContain('scope=prod');
  });

  it('prod scope allows entry within 30-day window', () => {
    // 30 days from Feb 13 = March 15
    const { active } = parseAllowlist(
      { allowlist: [makeEntry({ scope: 'prod', expires_at: '2026-03-15' })] },
      REF_DATE
    );
    expect(active.size).toBe(1);
  });

  it('14-day expiry warning fires for near-expiry entries', () => {
    // 10 days from Feb 13 = Feb 23
    const { active, warnings } = parseAllowlist(
      { allowlist: [makeEntry({ expires_at: '2026-02-23' })] },
      REF_DATE
    );
    expect(active.size).toBe(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('expires in');
    expect(warnings[0]).toContain('2026-02-23');
  });

  it('no expiry warning for entries with more than 14 days remaining', () => {
    // 30 days from Feb 13 = March 15
    const { warnings } = parseAllowlist(
      { allowlist: [makeEntry({ expires_at: '2026-03-15' })] },
      REF_DATE
    );
    expect(warnings).toHaveLength(0);
  });

  it('all valid scopes are accepted', () => {
    for (const scope of VALID_SCOPES) {
      // Use a date within the scope's max window
      const { active, invalid } = parseAllowlist(
        { allowlist: [makeEntry({ scope, expires_at: '2026-02-28' })] },
        REF_DATE
      );
      expect(active.size).toBe(1);
      expect(invalid).toHaveLength(0);
    }
  });

  // --- reviewed_at (renewal tracking) ---

  it('accepts entry with valid reviewed_at', () => {
    const { active, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ reviewed_at: '2026-02-13' })] },
      REF_DATE
    );
    expect(active.size).toBe(1);
    expect(invalid).toHaveLength(0);
  });

  it('rejects entry with malformed reviewed_at', () => {
    const { active, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ reviewed_at: 'bad-date' })] },
      REF_DATE
    );
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toContain('bad reviewed_at format');
  });

  it('warns when entry >30 days old has no reviewed_at', () => {
    // added_at: 2026-01-01, ref: 2026-02-13 = 43 days ago
    const { active, warnings } = parseAllowlist(
      { allowlist: [makeEntry({ added_at: '2026-01-01', expires_at: '2026-03-15' })] },
      REF_DATE
    );
    expect(active.size).toBe(1);
    expect(warnings.some((w: string) => w.includes('without reviewed_at'))).toBe(true);
  });

  it('no renewal warning when reviewed_at is present', () => {
    const { warnings } = parseAllowlist(
      {
        allowlist: [
          makeEntry({
            added_at: '2026-01-01',
            reviewed_at: '2026-02-10',
            expires_at: '2026-03-15',
          }),
        ],
      },
      REF_DATE
    );
    expect(warnings.some((w: string) => w.includes('without reviewed_at'))).toBe(false);
  });

  it('no renewal warning when entry is <30 days old', () => {
    const { warnings } = parseAllowlist(
      { allowlist: [makeEntry({ added_at: '2026-02-01', expires_at: '2026-03-15' })] },
      REF_DATE
    );
    expect(warnings.some((w: string) => w.includes('without reviewed_at'))).toBe(false);
  });

  // --- strict mode reviewed_at enforcement ---

  it('strict mode rejects entry older than REVIEW_WINDOW_DAYS without reviewed_at', () => {
    // added_at: 2025-12-01, ref: 2026-02-13 = 74 days ago (> REVIEW_WINDOW_DAYS=60)
    const { active, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ added_at: '2025-12-01', expires_at: '2026-03-15' })] },
      REF_DATE,
      { strict: true }
    );
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toContain('strict mode requires review');
    expect(invalid[0]).toContain(`${REVIEW_WINDOW_DAYS} days`);
  });

  it('strict mode accepts old entry with reviewed_at', () => {
    const { active, invalid } = parseAllowlist(
      {
        allowlist: [
          makeEntry({
            added_at: '2025-12-01',
            reviewed_at: '2026-02-10',
            expires_at: '2026-03-15',
          }),
        ],
      },
      REF_DATE,
      { strict: true }
    );
    expect(active.size).toBe(1);
    expect(invalid).toHaveLength(0);
  });

  it('strict mode accepts entry within REVIEW_WINDOW_DAYS without reviewed_at', () => {
    // added_at: 2026-01-15, ref: 2026-02-13 = 29 days ago (< REVIEW_WINDOW_DAYS)
    const { active, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ added_at: '2026-01-15', expires_at: '2026-03-15' })] },
      REF_DATE,
      { strict: true }
    );
    expect(active.size).toBe(1);
    expect(invalid).toHaveLength(0);
  });

  it('default mode warns but does not reject old entries without reviewed_at', () => {
    // 74 days old, no reviewed_at, default mode
    const { active, warnings } = parseAllowlist(
      { allowlist: [makeEntry({ added_at: '2025-12-01', expires_at: '2026-03-15' })] },
      REF_DATE
    );
    expect(active.size).toBe(1);
    expect(warnings.some((w: string) => w.includes('without reviewed_at'))).toBe(true);
  });

  it('REVIEW_WINDOW_DAYS constant is exported and reasonable', () => {
    expect(REVIEW_WINDOW_DAYS).toBeGreaterThanOrEqual(30);
    expect(REVIEW_WINDOW_DAYS).toBeLessThanOrEqual(90);
  });
});

// ---------------------------------------------------------------------------
// extractAdvisories -- pnpm native shape (advisories object)
// ---------------------------------------------------------------------------

describe('extractAdvisories (advisories shape)', () => {
  const fixture = loadFixture('pnpm-advisories-shape.json');

  it('extracts all advisories from pnpm native output', () => {
    const advs = extractAdvisories(fixture);
    expect(advs).toHaveLength(3);
  });

  it('preserves numeric ID and GHSA ID', () => {
    const advs = extractAdvisories(fixture);
    const esbuild = advs.find((a: { module: string }) => a.module === 'esbuild');
    expect(esbuild).toBeDefined();
    expect(esbuild!.id).toBe('1102341');
    expect(esbuild!.ghsaId).toBe('GHSA-67mh-4wv8-2f99');
    expect(esbuild!.severity).toBe('moderate');
  });

  it('extracts critical advisories', () => {
    const advs = extractAdvisories(fixture);
    const critical = advs.filter((a: { severity: string }) => a.severity === 'critical');
    expect(critical).toHaveLength(1);
    expect(critical[0].module).toBe('fake-critical');
  });

  it('returns empty array for null input', () => {
    expect(extractAdvisories(null)).toHaveLength(0);
  });

  it('returns empty array for empty object', () => {
    expect(extractAdvisories({})).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractAdvisories -- npm-compatible shape (vulnerabilities object)
// ---------------------------------------------------------------------------

describe('extractAdvisories (vulnerabilities shape)', () => {
  const fixture = loadFixture('npm-vulnerabilities-shape.json');

  it('extracts advisories from via objects', () => {
    const advs = extractAdvisories(fixture);
    // esbuild:1102341, hono:1112134, hono:1112135 = 3 unique
    expect(advs).toHaveLength(3);
  });

  it('extracts GHSA ID from URL', () => {
    const advs = extractAdvisories(fixture);
    const esbuild = advs.find((a: { id: string }) => a.id === '1102341');
    expect(esbuild).toBeDefined();
    expect(esbuild!.ghsaId).toBe('GHSA-67mh-4wv8-2f99');
  });

  it('skips string via references (not direct advisories)', () => {
    const advs = extractAdvisories(fixture);
    // "some-transitive" has via: ["hono"] (string ref) -- should not produce an advisory
    const ids = advs.map((a: { id: string }) => a.id);
    expect(ids).not.toContain('some-transitive');
  });

  it('deduplicates advisories by source ID', () => {
    const advs = extractAdvisories(fixture);
    const ids = advs.map((a: { id: string }) => a.id);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });
});

// ---------------------------------------------------------------------------
// extractAdvisories -- mixed shape (both advisories + vulnerabilities)
// ---------------------------------------------------------------------------

describe('extractAdvisories (mixed shape)', () => {
  it('deduplicates across both shapes', () => {
    const mixed = {
      advisories: {
        '1102341': {
          id: 1102341,
          severity: 'moderate',
          module_name: 'esbuild',
          github_advisory_id: 'GHSA-67mh-4wv8-2f99',
          title: 'esbuild test',
        },
      },
      vulnerabilities: {
        esbuild: {
          name: 'esbuild',
          severity: 'moderate',
          via: [
            {
              source: 1102341,
              name: 'esbuild',
              severity: 'moderate',
              url: 'https://github.com/advisories/GHSA-67mh-4wv8-2f99',
            },
          ],
        },
      },
    };
    const advs = extractAdvisories(mixed);
    // Same advisory ID 1102341 in both -- should appear once
    expect(advs).toHaveLength(1);
    expect(advs[0].id).toBe('1102341');
  });
});

// ---------------------------------------------------------------------------
// classifyAdvisories
// ---------------------------------------------------------------------------

describe('classifyAdvisories', () => {
  it('classifies by severity', () => {
    const advs = [
      { id: '1', ghsaId: '', severity: 'critical', module: 'a', title: 'a' },
      { id: '2', ghsaId: '', severity: 'high', module: 'b', title: 'b' },
      { id: '3', ghsaId: '', severity: 'moderate', module: 'c', title: 'c' },
      { id: '4', ghsaId: '', severity: 'low', module: 'd', title: 'd' },
    ];
    const findings = classifyAdvisories(advs, new Map());
    expect(findings.critical).toEqual(['1']);
    expect(findings.high).toEqual(['2']);
    expect(findings.moderate).toEqual(['3']);
    expect(findings.low).toEqual(['4']);
  });

  it('filters out allowlisted entries by numeric ID', () => {
    const advs = [
      { id: '123', ghsaId: 'GHSA-xxxx', severity: 'critical', module: 'a', title: 'a' },
      { id: '456', ghsaId: 'GHSA-yyyy', severity: 'high', module: 'b', title: 'b' },
    ];
    const allowlist = new Map([['123', { advisory_id: '123' }]]);
    const findings = classifyAdvisories(advs, allowlist as Map<string, unknown>);
    expect(findings.critical).toHaveLength(0);
    expect(findings.high).toEqual(['456']);
  });

  it('filters out allowlisted entries by GHSA ID', () => {
    const advs = [
      { id: '123', ghsaId: 'GHSA-xxxx', severity: 'critical', module: 'a', title: 'a' },
    ];
    const allowlist = new Map([['GHSA-xxxx', { advisory_id: 'GHSA-xxxx' }]]);
    const findings = classifyAdvisories(advs, allowlist as Map<string, unknown>);
    expect(findings.critical).toHaveLength(0);
  });

  it('returns empty arrays for no advisories', () => {
    const findings = classifyAdvisories([], new Map());
    expect(findings.critical).toHaveLength(0);
    expect(findings.high).toHaveLength(0);
    expect(findings.moderate).toHaveLength(0);
    expect(findings.low).toHaveLength(0);
  });

  it('end-to-end: fixture + allowlist = correct classification', () => {
    const fixture = loadFixture('pnpm-advisories-shape.json');
    const advs = extractAdvisories(fixture);
    // Allowlist the critical one
    const allowlist = new Map([['GHSA-fake-crit-ical', { advisory_id: 'GHSA-fake-crit-ical' }]]);
    const findings = classifyAdvisories(advs, allowlist as Map<string, unknown>);
    expect(findings.critical).toHaveLength(0); // allowlisted
    expect(findings.high).toHaveLength(1); // hono
    expect(findings.moderate).toHaveLength(1); // esbuild
  });
});

// ---------------------------------------------------------------------------
// extractAdvisories -- NDJSON parse robustness
// ---------------------------------------------------------------------------

describe('extractAdvisories (NDJSON robustness)', () => {
  it('extracts from merged NDJSON lines', () => {
    // Simulate NDJSON: two separate JSON objects merged into one
    const ndjsonLines = readFileSync(join(FIXTURES_DIR, 'pnpm-ndjson-shape.ndjson'), 'utf-8')
      .split('\n')
      .filter((l: string) => l.trim());

    // Merge all objects (same logic as audit-gate.mjs)
    const merged: Record<string, Record<string, unknown>> = { advisories: {}, vulnerabilities: {} };
    for (const line of ndjsonLines) {
      const obj = JSON.parse(line);
      if (obj.advisories) Object.assign(merged.advisories, obj.advisories);
      if (obj.vulnerabilities) Object.assign(merged.vulnerabilities, obj.vulnerabilities);
    }

    const advs = extractAdvisories(merged);
    expect(advs).toHaveLength(2);
    expect(advs.map((a: { id: string }) => a.id).sort()).toEqual(['1102341', '1112134']);
  });

  it('handles empty advisories object', () => {
    const advs = extractAdvisories({ advisories: {} });
    expect(advs).toHaveLength(0);
  });

  it('handles advisories with missing optional fields', () => {
    const result = {
      advisories: {
        '999': {
          id: 999,
          severity: 'low',
        },
      },
    };
    const advs = extractAdvisories(result);
    expect(advs).toHaveLength(1);
    expect(advs[0].severity).toBe('low');
    expect(advs[0].ghsaId).toBe('');
    expect(advs[0].module).toBe('');
  });

  it('handles vulnerabilities with empty via array', () => {
    const result = {
      vulnerabilities: {
        'some-pkg': {
          name: 'some-pkg',
          severity: 'moderate',
          via: [],
        },
      },
    };
    const advs = extractAdvisories(result);
    expect(advs).toHaveLength(0);
  });

  it('handles vulnerabilities with null via entries', () => {
    const result = {
      vulnerabilities: {
        'some-pkg': {
          name: 'some-pkg',
          severity: 'moderate',
          via: [null, undefined, 42],
        },
      },
    };
    const advs = extractAdvisories(result);
    expect(advs).toHaveLength(0);
  });

  it('unknown severity is classified as low', () => {
    const advs = [
      { id: '1', ghsaId: '', severity: 'unknown', module: 'a', title: 'a' },
      { id: '2', ghsaId: '', severity: 'info', module: 'b', title: 'b' },
    ];
    const findings = classifyAdvisories(advs, new Map());
    expect(findings.low).toEqual(['1', '2']);
  });
});

// ---------------------------------------------------------------------------
// parseAuditOutput -- stdout noise resilience
// ---------------------------------------------------------------------------

describe('parseAuditOutput (stdout noise)', () => {
  /**
   * Inline reimplementation of parseAuditOutput to test the parsing logic
   * without importing the CLI wrapper (which calls process.exit).
   * Kept in sync with scripts/audit-gate.mjs.
   */
  function parseAuditOutput(output: string) {
    if (!output.trim()) return null;

    try {
      return JSON.parse(output);
    } catch {
      // Fall through to NDJSON
    }

    const merged: Record<string, Record<string, unknown>> = {
      advisories: {},
      vulnerabilities: {},
    };
    let parsed = false;
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj.advisories) {
          Object.assign(merged.advisories, obj.advisories);
          parsed = true;
        }
        if (obj.vulnerabilities) {
          Object.assign(merged.vulnerabilities, obj.vulnerabilities);
          parsed = true;
        }
      } catch {
        // Skip unparseable lines (progress messages, warnings, etc.)
      }
    }

    return parsed ? merged : null;
  }

  it('extracts advisories from stdout with non-JSON noise lines', () => {
    const noisy = readFileSync(join(FIXTURES_DIR, 'pnpm-noisy-stdout.txt'), 'utf-8');
    const result = parseAuditOutput(noisy);
    expect(result).not.toBeNull();
    const advs = extractAdvisories(result!);
    expect(advs).toHaveLength(2);
    expect(advs.map((a: { id: string }) => a.id).sort()).toEqual(['1102341', '1112134']);
  });

  it('returns null for entirely non-JSON output', () => {
    const garbage = 'Packages: +0 -0\nProgress: resolved 42\n WARN  nothing here\n';
    expect(parseAuditOutput(garbage)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseAuditOutput('')).toBeNull();
    expect(parseAuditOutput('   \n  \n')).toBeNull();
  });

  it('handles clean single JSON object', () => {
    const clean = JSON.stringify({
      advisories: {
        '999': { id: 999, severity: 'low', module_name: 'test', title: 'test' },
      },
    });
    const result = parseAuditOutput(clean);
    expect(result).not.toBeNull();
    expect(result!.advisories['999'].severity).toBe('low');
  });

  it('handles JSON with extra top-level fields (future-safe)', () => {
    const extended = JSON.stringify({
      advisories: {
        '1': { id: 1, severity: 'high', module_name: 'a', title: 'a' },
      },
      metadata: { totalDependencies: 500 },
      auditReportVersion: 2,
    });
    const result = parseAuditOutput(extended);
    expect(result).not.toBeNull();
    const advs = extractAdvisories(result!);
    expect(advs).toHaveLength(1);
  });
});
