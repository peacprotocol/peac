/**
 * Corpus-loader smoke test.
 *
 * Asserts that every parity-corpus family loads successfully, schema-validates,
 * meets its floor count, and has unique vector ids. No validator code is
 * exercised here; this commit ships the loader only.
 */

import { describe, it, expect } from 'vitest';
import {
  PARITY_FAMILIES,
  PARITY_FLOOR_COUNTS,
  loadAllFamilies,
  loadFamily,
} from '../../src/_internal/test-helpers/corpus-loader';

describe('parity-corpus loader', () => {
  it('declares the expected nine families (a2a-handoff + cli-execution + lifecycle-observation + provisioning-lifecycle + agent-action added)', () => {
    expect(PARITY_FAMILIES).toEqual([
      'default-flows',
      'jose-hardening',
      'runtime-governance',
      'commerce-bridges',
      'a2a-handoff',
      'cli-execution',
      'lifecycle-observation',
      'provisioning-lifecycle',
      'agent-action',
    ]);
  });

  it('declares the expected floor counts', () => {
    expect(PARITY_FLOOR_COUNTS).toEqual({
      'default-flows': 12,
      'jose-hardening': 8,
      'runtime-governance': 7,
      'commerce-bridges': 4,
      'a2a-handoff': 15,
      'cli-execution': 6,
      'lifecycle-observation': 11,
      'provisioning-lifecycle': 29,
      'agent-action': 6,
    });
  });

  it('loads all nine families in declared order', () => {
    const families = loadAllFamilies();
    expect(families).toHaveLength(9);
    expect(families.map((f) => f.family)).toEqual([
      'default-flows',
      'jose-hardening',
      'runtime-governance',
      'commerce-bridges',
      'a2a-handoff',
      'cli-execution',
      'lifecycle-observation',
      'provisioning-lifecycle',
      'agent-action',
    ]);
  });

  for (const family of PARITY_FAMILIES) {
    describe(`family: ${family}`, () => {
      const loaded = loadFamily(family);

      it('matches its declared family identifier', () => {
        expect(loaded.family).toBe(family);
      });

      it('meets the v0.13.1 floor count', () => {
        expect(loaded.vectors.length).toBeGreaterThanOrEqual(PARITY_FLOOR_COUNTS[family]);
      });

      it('has unique vector ids', () => {
        const ids = loaded.vectors.map((v) => v.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('every vector has a non-empty payload', () => {
        for (const v of loaded.vectors) {
          expect(typeof v.input.payload).toBe('object');
          expect(v.input.payload).not.toBeNull();
        }
      });
    });
  }
});
