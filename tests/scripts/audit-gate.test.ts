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
    reason: 'Transitive dep, no exposure in our usage',
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
    expect(required).toContain('issue_url');
    expect(required).toContain('remediation');
    expect(required).toContain('scope');
    expect(required).toContain('dependency_chain');
    expect(required).toContain('verified_by');
    expect(required).toContain('owner');
    expect(required).toContain('added_at');
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
      const maxDays = scope === 'prod' ? MAX_EXPIRY_DAYS_PROD : MAX_EXPIRY_DAYS;
      // Use a date within the scope's max window
      const { active, invalid } = parseAllowlist(
        { allowlist: [makeEntry({ scope, expires_at: '2026-02-28' })] },
        REF_DATE
      );
      expect(active.size).toBe(1);
      expect(invalid).toHaveLength(0);
    }
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
