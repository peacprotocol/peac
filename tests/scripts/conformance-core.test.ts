/**
 * Tests for the shared conformance core module.
 * Validates requirement ID parsing, namespace classification,
 * coverage-state classification, deferred-state handling,
 * deterministic sort order, and generated artifact structure.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  NAMESPACES,
  parseRequirementId,
  isValidRequirementId,
  CoverageStatus,
  VALID_COVERAGE_STATUSES,
  COVERAGE_LABELS,
  DEFERRED_PR3_SECTIONS,
  DEFERRED_V0121_SECTIONS,
  IMPLICIT_COVERAGE_CLASSES,
  VALID_ENFORCEMENT_CLASSES,
  BCP14_KEYWORDS,
  classifyCoverage,
  buildCoveredIds,
  sortRequirementIds,
  sortPaths,
  dedupeSort,
  ERROR_CODE_PATTERN,
  FRAGMENT_HASH_PATTERN,
} from '../../scripts/conformance/core.mjs';

// ---------------------------------------------------------------------------
// Requirement ID parsing
// ---------------------------------------------------------------------------

describe('parseRequirementId()', () => {
  it('parses WIRE02 IDs', () => {
    const r = parseRequirementId('WIRE02-KIND-001');
    expect(r).toEqual({ namespace: 'WIRE02', section: 'KIND', number: '001' });
  });

  it('parses CARRIER IDs', () => {
    const r = parseRequirementId('CARRIER-MCP-001');
    expect(r).toEqual({ namespace: 'CARRIER', section: 'MCP', number: '001' });
  });

  it('parses IDs with digits in section (A2A)', () => {
    const r = parseRequirementId('CARRIER-A2A-001');
    expect(r).toEqual({ namespace: 'CARRIER', section: 'A2A', number: '001' });
  });

  it('returns null for invalid IDs', () => {
    expect(parseRequirementId('WIRE02-KIND')).toBeNull();
    expect(parseRequirementId('WIRE03-KIND-001')).toBeNull();
    expect(parseRequirementId('KIND-001')).toBeNull();
    expect(parseRequirementId('')).toBeNull();
    expect(parseRequirementId('wire02-kind-001')).toBeNull();
  });
});

describe('isValidRequirementId()', () => {
  it('accepts valid WIRE02 and CARRIER IDs', () => {
    expect(isValidRequirementId('WIRE02-JOSE-009')).toBe(true);
    expect(isValidRequirementId('CARRIER-MCP-001')).toBe(true);
    expect(isValidRequirementId('CARRIER-A2A-001')).toBe(true);
  });

  it('rejects malformed IDs', () => {
    expect(isValidRequirementId('WIRE02-KIND')).toBe(false);
    expect(isValidRequirementId('WIRE02-kind-001')).toBe(false);
    expect(isValidRequirementId('WIRE02-KIND-01')).toBe(false);
    expect(isValidRequirementId('WIRE02-KIND-0001')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Namespace classification
// ---------------------------------------------------------------------------

describe('NAMESPACES', () => {
  it('contains WIRE02 and CARRIER', () => {
    expect(NAMESPACES).toContain('WIRE02');
    expect(NAMESPACES).toContain('CARRIER');
    expect(NAMESPACES).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Coverage status enum
// ---------------------------------------------------------------------------

describe('CoverageStatus', () => {
  it('has exactly 5 states', () => {
    expect(Object.keys(CoverageStatus)).toHaveLength(5);
  });

  it('has all expected values', () => {
    expect(CoverageStatus.COVERED).toBe('covered');
    expect(CoverageStatus.IMPLICIT).toBe('implicit');
    expect(CoverageStatus.DEFERRED_PR3).toBe('deferred_pr3');
    expect(CoverageStatus.DEFERRED_V0121).toBe('deferred_v0121');
    expect(CoverageStatus.UNCOVERED).toBe('uncovered');
  });

  it('matches VALID_COVERAGE_STATUSES set', () => {
    for (const v of Object.values(CoverageStatus)) {
      expect(VALID_COVERAGE_STATUSES.has(v)).toBe(true);
    }
    expect(VALID_COVERAGE_STATUSES.size).toBe(5);
  });

  it('has a label for every status', () => {
    for (const v of Object.values(CoverageStatus)) {
      expect(COVERAGE_LABELS[v]).toBeDefined();
      expect(typeof COVERAGE_LABELS[v]).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// Coverage classification
// ---------------------------------------------------------------------------

describe('classifyCoverage()', () => {
  const coveredIds = new Set(['WIRE02-KIND-001', 'WIRE02-JOSE-003']);

  it('returns COVERED when ID is in coveredIds', () => {
    expect(
      classifyCoverage({
        id: 'WIRE02-KIND-001',
        enforcement_class: 'hard_fail',
        section_number: 5,
        coveredIds,
      })
    ).toBe(CoverageStatus.COVERED);
  });

  it('returns IMPLICIT for advisory class', () => {
    expect(
      classifyCoverage({
        id: 'WIRE02-KIND-002',
        enforcement_class: 'advisory',
        section_number: 5,
        coveredIds,
      })
    ).toBe(CoverageStatus.IMPLICIT);
  });

  it('returns IMPLICIT for issuance class', () => {
    expect(
      classifyCoverage({
        id: 'WIRE02-MEDIA-001',
        enforcement_class: 'issuance',
        section_number: 2,
        coveredIds,
      })
    ).toBe(CoverageStatus.IMPLICIT);
  });

  it('returns DEFERRED_PR3 for sections 13-16', () => {
    for (const s of [13, 14, 15, 16]) {
      expect(
        classifyCoverage({
          id: `WIRE02-X-001`,
          enforcement_class: 'hard_fail',
          section_number: s,
          coveredIds,
        })
      ).toBe(CoverageStatus.DEFERRED_PR3);
    }
  });

  it('returns DEFERRED_V0121 for sections 2-4', () => {
    for (const s of [2, 3, 4]) {
      expect(
        classifyCoverage({
          id: `WIRE02-X-001`,
          enforcement_class: 'hard_fail',
          section_number: s,
          coveredIds,
        })
      ).toBe(CoverageStatus.DEFERRED_V0121);
    }
  });

  it('returns UNCOVERED when no classification matches', () => {
    expect(
      classifyCoverage({
        id: 'WIRE02-NEW-001',
        enforcement_class: 'hard_fail',
        section_number: 99,
        coveredIds,
      })
    ).toBe(CoverageStatus.UNCOVERED);
  });

  it('COVERED takes priority over implicit class', () => {
    expect(
      classifyCoverage({
        id: 'WIRE02-KIND-001',
        enforcement_class: 'advisory',
        section_number: 5,
        coveredIds,
      })
    ).toBe(CoverageStatus.COVERED);
  });

  it('COVERED takes priority over deferred section', () => {
    expect(
      classifyCoverage({
        id: 'WIRE02-JOSE-003',
        enforcement_class: 'hard_fail',
        section_number: 13,
        coveredIds,
      })
    ).toBe(CoverageStatus.COVERED);
  });
});

// ---------------------------------------------------------------------------
// buildCoveredIds
// ---------------------------------------------------------------------------

describe('buildCoveredIds()', () => {
  it('collects IDs from inventory and test-mappings', () => {
    const inventory = {
      entries: [
        { requirement_ids: ['WIRE02-KIND-001', 'WIRE02-KIND-002'] },
        { requirement_ids: ['WIRE02-JOSE-001'] },
        {},
      ],
    };
    const testMappings = {
      mappings: [{ requirement_id: 'WIRE02-TYPE-001' }, { requirement_id: 'WIRE02-KIND-001' }],
    };
    const ids = buildCoveredIds(inventory, testMappings);
    expect(ids.has('WIRE02-KIND-001')).toBe(true);
    expect(ids.has('WIRE02-KIND-002')).toBe(true);
    expect(ids.has('WIRE02-JOSE-001')).toBe(true);
    expect(ids.has('WIRE02-TYPE-001')).toBe(true);
    expect(ids.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Deferred section sets
// ---------------------------------------------------------------------------

describe('deferred sections', () => {
  it('PR3 sections are 13-16', () => {
    expect([...DEFERRED_PR3_SECTIONS].sort()).toEqual([13, 14, 15, 16]);
  });

  it('v0.12.1 sections are 2-4', () => {
    expect([...DEFERRED_V0121_SECTIONS].sort()).toEqual([2, 3, 4]);
  });

  it('no overlap between PR3 and v0.12.1', () => {
    for (const s of DEFERRED_PR3_SECTIONS) {
      expect(DEFERRED_V0121_SECTIONS.has(s)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Enforcement classes
// ---------------------------------------------------------------------------

describe('enforcement classes', () => {
  it('VALID_ENFORCEMENT_CLASSES has 5 members', () => {
    expect(VALID_ENFORCEMENT_CLASSES.size).toBe(5);
  });

  it('IMPLICIT_COVERAGE_CLASSES is subset of VALID_ENFORCEMENT_CLASSES', () => {
    for (const c of IMPLICIT_COVERAGE_CLASSES) {
      expect(VALID_ENFORCEMENT_CLASSES.has(c)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// BCP 14 keywords
// ---------------------------------------------------------------------------

describe('BCP14_KEYWORDS', () => {
  it('has all 10 RFC 2119/8174 keywords', () => {
    expect(BCP14_KEYWORDS).toHaveLength(10);
    expect(BCP14_KEYWORDS).toContain('MUST');
    expect(BCP14_KEYWORDS).toContain('MUST NOT');
    expect(BCP14_KEYWORDS).toContain('SHOULD');
    expect(BCP14_KEYWORDS).toContain('MAY');
    expect(BCP14_KEYWORDS).toContain('OPTIONAL');
    expect(BCP14_KEYWORDS).toContain('RECOMMENDED');
  });
});

// ---------------------------------------------------------------------------
// Deterministic sort
// ---------------------------------------------------------------------------

describe('sortRequirementIds()', () => {
  it('sorts by namespace, section, number', () => {
    const ids = ['WIRE02-TYPE-002', 'CARRIER-MCP-001', 'WIRE02-KIND-001', 'WIRE02-TYPE-001'];
    const sorted = [...ids].sort(sortRequirementIds);
    expect(sorted).toEqual([
      'CARRIER-MCP-001',
      'WIRE02-KIND-001',
      'WIRE02-TYPE-001',
      'WIRE02-TYPE-002',
    ]);
  });

  it('handles invalid IDs gracefully (falls back to localeCompare)', () => {
    const ids = ['WIRE02-KIND-001', 'bad-id', 'WIRE02-KIND-002'];
    const sorted = [...ids].sort(sortRequirementIds);
    // localeCompare puts lowercase 'bad-id' before uppercase 'WIRE02-*'
    expect(sorted).toEqual(['bad-id', 'WIRE02-KIND-001', 'WIRE02-KIND-002']);
  });
});

describe('sortPaths()', () => {
  it('sorts lexicographically', () => {
    const paths = ['b/c.json', 'a/b.json', 'a/a.json'];
    expect([...paths].sort(sortPaths)).toEqual(['a/a.json', 'a/b.json', 'b/c.json']);
  });
});

describe('dedupeSort()', () => {
  it('removes duplicates and sorts', () => {
    expect(dedupeSort(['c', 'a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('handles empty array', () => {
    expect(dedupeSort([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pattern validation
// ---------------------------------------------------------------------------

describe('patterns', () => {
  it('ERROR_CODE_PATTERN matches valid codes', () => {
    expect(ERROR_CODE_PATTERN.test('E_INVALID_FORMAT')).toBe(true);
    expect(ERROR_CODE_PATTERN.test('E_JWS_EMBEDDED_KEY')).toBe(true);
    expect(ERROR_CODE_PATTERN.test('E_123')).toBe(true);
  });

  it('ERROR_CODE_PATTERN rejects invalid codes', () => {
    expect(ERROR_CODE_PATTERN.test('INVALID_FORMAT')).toBe(false);
    expect(ERROR_CODE_PATTERN.test('E_invalid')).toBe(false);
    expect(ERROR_CODE_PATTERN.test('')).toBe(false);
  });

  it('FRAGMENT_HASH_PATTERN matches valid hashes', () => {
    expect(FRAGMENT_HASH_PATTERN.test('sha256:' + 'a'.repeat(64))).toBe(true);
    expect(FRAGMENT_HASH_PATTERN.test('sha256:' + '0123456789abcdef'.repeat(4))).toBe(true);
  });

  it('FRAGMENT_HASH_PATTERN rejects invalid hashes', () => {
    expect(FRAGMENT_HASH_PATTERN.test('sha256:' + 'a'.repeat(63))).toBe(false);
    expect(FRAGMENT_HASH_PATTERN.test('sha512:' + 'a'.repeat(64))).toBe(false);
    expect(FRAGMENT_HASH_PATTERN.test('sha256:' + 'A'.repeat(64))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Generated artifact structure (golden tests)
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

describe('generated artifact structure', () => {
  it('requirement-ids.json has required top-level keys and sorted sections', () => {
    const registry = JSON.parse(
      readFileSync(join(ROOT, 'specs/conformance/requirement-ids.json'), 'utf-8')
    );
    expect(registry.$schema).toBe(
      'https://www.peacprotocol.org/schemas/conformance/requirement-registry.schema.json'
    );
    expect(registry.version).toBeDefined();
    expect(registry.spec_file).toBe('docs/specs/WIRE-0.2.md');
    expect(Array.isArray(registry.sections)).toBe(true);
    expect(registry.sections.length).toBeGreaterThan(0);

    // Sections must be sorted by section_number
    for (let i = 1; i < registry.sections.length; i++) {
      expect(registry.sections[i].section_number).toBeGreaterThan(
        registry.sections[i - 1].section_number
      );
    }

    // Every requirement must have a valid ID
    for (const section of registry.sections) {
      for (const req of section.requirements) {
        expect(isValidRequirementId(req.id)).toBe(true);
      }
    }
  });

  it('inventory.json has required top-level keys and sorted entries', () => {
    const inventory = JSON.parse(
      readFileSync(join(ROOT, 'specs/conformance/fixtures/inventory.json'), 'utf-8')
    );
    expect(inventory.$schema).toBe(
      'https://www.peacprotocol.org/schemas/conformance/inventory.schema.json'
    );
    expect(typeof inventory.total_fixtures).toBe('number');
    expect(typeof inventory.total_with_requirements).toBe('number');
    expect(typeof inventory.total_unmapped).toBe('number');
    expect(typeof inventory.wire02_requirement_links).toBe('number');
    expect(typeof inventory.carrier_requirement_links).toBe('number');
    expect(inventory.total_fixtures).toBe(
      inventory.total_with_requirements + inventory.total_unmapped
    );
    expect(Array.isArray(inventory.entries)).toBe(true);

    // Entries must be sorted by (directory, file, fixture_name)
    for (let i = 1; i < inventory.entries.length; i++) {
      const prev = `${inventory.entries[i - 1].directory}/${inventory.entries[i - 1].file}/${inventory.entries[i - 1].fixture_name}`;
      const curr = `${inventory.entries[i].directory}/${inventory.entries[i].file}/${inventory.entries[i].fixture_name}`;
      expect(prev < curr).toBe(true);
    }
  });

  it('CONFORMANCE-MATRIX.md has required sections', () => {
    const matrix = readFileSync(join(ROOT, 'docs/specs/CONFORMANCE-MATRIX.md'), 'utf-8');
    expect(matrix).toContain('# PEAC Conformance Matrix');
    expect(matrix).toContain('## Wire 0.2 Protocol Requirements');
    expect(matrix).toContain('## Carrier Contract Requirements');
    expect(matrix).toContain('## Summary');
    // Prettier pads table columns; match header words, not exact spacing
    expect(matrix).toMatch(/\|\s*Metric\s*\|\s*Count\s*\|/);
  });

  it('test-mappings.json has valid structure', () => {
    const mappings = JSON.parse(
      readFileSync(join(ROOT, 'specs/conformance/test-mappings.json'), 'utf-8')
    );
    expect(Array.isArray(mappings.mappings)).toBe(true);
    for (const m of mappings.mappings) {
      expect(isValidRequirementId(m.requirement_id)).toBe(true);
      expect(typeof m.test_file).toBe('string');
    }
  });
});
