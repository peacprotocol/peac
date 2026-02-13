/**
 * Tests for audit-gate.mjs allowlist enforcement logic.
 *
 * These tests validate the allowlist parsing and expiry behavior
 * without actually running pnpm audit. They exercise:
 * - Expired entries are treated as not-allowlisted
 * - Malformed dates fail closed (entry rejected)
 * - Missing required fields fail closed (entry rejected)
 * - Max expiry window enforcement (90 days)
 * - Active entries within window are correctly applied
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the allowlist schema to validate test fixtures
const SCHEMA_PATH = join(__dirname, '..', '..', 'security', 'audit-allowlist.schema.json');
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));

/**
 * Minimal reimplementation of loadAllowlist logic for testing.
 * This mirrors the logic in audit-gate.mjs so we can unit-test it
 * without forking the audit process.
 */
function parseAllowlist(raw, now = new Date()) {
  const MAX_EXPIRY_DAYS = 90;

  if (!raw || !Array.isArray(raw.allowlist)) {
    return { active: new Map(), expired: [], invalid: [] };
  }

  const active = new Map();
  const expired = [];
  const invalid = [];

  for (const entry of raw.allowlist) {
    // Fail closed: all required fields must be present
    if (
      !entry.advisory_id ||
      !entry.reason ||
      !entry.expires_at ||
      !entry.remediation ||
      !entry.issue_url
    ) {
      invalid.push(entry.advisory_id || '<missing id>');
      continue;
    }

    // Fail closed: date must parse
    const expiry = new Date(entry.expires_at + 'T00:00:00Z');
    if (isNaN(expiry.getTime())) {
      invalid.push(`${entry.advisory_id} (bad date: ${entry.expires_at})`);
      continue;
    }

    // Enforce max expiry window
    const daysDiff = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (daysDiff > MAX_EXPIRY_DAYS) {
      invalid.push(
        `${entry.advisory_id} (expiry ${entry.expires_at} exceeds ${MAX_EXPIRY_DAYS}-day max)`
      );
      continue;
    }

    if (expiry < now) {
      expired.push(entry.advisory_id);
      continue;
    }

    active.set(entry.advisory_id, entry);
  }

  return { active, expired, invalid };
}

function makeEntry(overrides = {}) {
  return {
    advisory_id: 'GHSA-test-1234-abcd',
    reason: 'Transitive dep, no exposure in our usage',
    expires_at: '2026-03-15',
    remediation: 'Upgrade transitive dep in next patch',
    issue_url: 'https://github.com/peacprotocol/peac/issues/999',
    ...overrides,
  };
}

const REF_DATE = new Date('2026-02-13T12:00:00Z');

describe('audit-gate allowlist enforcement', () => {
  it('active entry within window is allowlisted', () => {
    const { active, expired, invalid } = parseAllowlist(
      { allowlist: [makeEntry({ expires_at: '2026-03-15' })] },
      REF_DATE
    );
    expect(active.size).toBe(1);
    expect(expired).toHaveLength(0);
    expect(invalid).toHaveLength(0);
  });

  it('expired entry is treated as NOT allowlisted', () => {
    const { active, expired, invalid } = parseAllowlist(
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
    expect(invalid[0]).toContain('bad date');
  });

  it('missing expires_at fails closed', () => {
    const entry = makeEntry();
    delete entry.expires_at;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('missing issue_url fails closed', () => {
    const entry = makeEntry();
    delete entry.issue_url;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('missing remediation fails closed', () => {
    const entry = makeEntry();
    delete entry.remediation;
    const { active, invalid } = parseAllowlist({ allowlist: [entry] }, REF_DATE);
    expect(active.size).toBe(0);
    expect(invalid).toHaveLength(1);
  });

  it('missing advisory_id fails closed', () => {
    const entry = makeEntry();
    delete entry.advisory_id;
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
    expect(invalid[0]).toContain('exceeds 90-day max');
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
          makeEntry({ advisory_id: 'GHSA-expired-1', expires_at: '2026-01-01' }),
          makeEntry({ advisory_id: 'GHSA-bad-date', expires_at: 'xyz' }),
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

  it('schema requires issue_url and remediation', () => {
    const required = schema.properties.allowlist.items.required;
    expect(required).toContain('issue_url');
    expect(required).toContain('remediation');
  });
});
