/**
 * Parity-corpus accounting.
 *
 * Locks the schema-validated parity corpus shape so the diagnostic
 * comparison taxonomy cannot silently shift. Two failure modes this
 * prevents:
 *
 *   1. A new family added without a `vectors.schema.json` and not
 *      enrolled in `PARITY_FAMILIES` would go unloaded by
 *      `loadAllFamilies()` and silently drop out of any cross-family
 *      coverage assertion.
 *
 *   2. The 31-vector floor (12 + 8 + 7 + 4) is the schema-validated
 *      corpus that supports parity-vector comparison
 *      (`{ id, description, input: { payload, header? }, expected: { accepted, errors?, warnings? } }`).
 *      The `jcs-extended/` directory exists alongside but uses a
 *      different shape (`{ id, description, input, canonical }`) for
 *      JCS canonicalization parity; it is NOT a parity-vector source
 *      and is exercised by separate cross-language JCS tests.
 *
 * The accounting test asserts the EXACT shape, the EXACT family list,
 * and the EXACT floor totals. It is the single place a contributor
 * must consult before declaring "the parity corpus is N vectors".
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PARITY_FAMILIES,
  PARITY_FLOOR_COUNTS,
  loadAllFamilies,
  loadFamily,
  resolveCorpusRoot,
} from '../../src/_internal/test-helpers/corpus-loader';

const CORPUS_ROOT = resolveCorpusRoot();
// Total: 12 + 8 + 7 + 4 + 15 + 6 + 11 + 29 + 6 + 7 = 105 (a2a-handoff: 10 positive + 5 negative; cli-execution: 6 positive; lifecycle-observation: 11 envelope-accepted positives covering all 9 event kinds plus 2 optional-field shape vectors; provisioning-lifecycle: 10 positive (one per *-observed event family) plus 19 negative (one per validator-emitted stable error code under provisioning.*; provisioning.structure_too_deep and provisioning.invalid_utf8 are intentionally omitted from the corpus and covered in schema unit tests); agent-action: 6 positive (one per event kind); commerce-mandate: 7 positive (one per event kind)).
const SCHEMA_VALIDATED_TOTAL = 105;

describe('parity-corpus accounting (schema-validated families)', () => {
  it('PARITY_FAMILIES enrolls exactly 10 schema-validated families (a2a-handoff + cli-execution + lifecycle-observation + provisioning-lifecycle + agent-action + commerce-mandate added)', () => {
    expect([...PARITY_FAMILIES].sort()).toEqual([
      'a2a-handoff',
      'agent-action',
      'cli-execution',
      'commerce-bridges',
      'commerce-mandate',
      'default-flows',
      'jose-hardening',
      'lifecycle-observation',
      'provisioning-lifecycle',
      'runtime-governance',
    ]);
  });

  it('PARITY_FLOOR_COUNTS matches per-family floor: 12 + 8 + 7 + 4 + 15 + 6 + 11 + 29 + 6 + 7 = 105', () => {
    expect(PARITY_FLOOR_COUNTS['default-flows']).toBe(12);
    expect(PARITY_FLOOR_COUNTS['jose-hardening']).toBe(8);
    expect(PARITY_FLOOR_COUNTS['runtime-governance']).toBe(7);
    expect(PARITY_FLOOR_COUNTS['commerce-bridges']).toBe(4);
    expect(PARITY_FLOOR_COUNTS['a2a-handoff']).toBe(15);
    expect(PARITY_FLOOR_COUNTS['cli-execution']).toBe(6);
    expect(PARITY_FLOOR_COUNTS['lifecycle-observation']).toBe(11);
    expect(PARITY_FLOOR_COUNTS['provisioning-lifecycle']).toBe(29);
    expect(PARITY_FLOOR_COUNTS['agent-action']).toBe(6);
    expect(PARITY_FLOOR_COUNTS['commerce-mandate']).toBe(7);

    const sum = Object.values(PARITY_FLOOR_COUNTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(SCHEMA_VALIDATED_TOTAL);
  });

  it('loadAllFamilies() returns exactly 10 families (a2a-handoff + cli-execution + lifecycle-observation + provisioning-lifecycle + agent-action + commerce-mandate added)', () => {
    const families = loadAllFamilies();
    expect(families).toHaveLength(10);
    const names = families.map((f) => f.family).sort();
    expect(names).toEqual([
      'a2a-handoff',
      'agent-action',
      'cli-execution',
      'commerce-bridges',
      'commerce-mandate',
      'default-flows',
      'jose-hardening',
      'lifecycle-observation',
      'provisioning-lifecycle',
      'runtime-governance',
    ]);
  });

  it('loadAllFamilies() vector counts meet floor (>= 92 total)', () => {
    const families = loadAllFamilies();
    const total = families.reduce((acc, f) => acc + f.vectors.length, 0);
    expect(total).toBeGreaterThanOrEqual(SCHEMA_VALIDATED_TOTAL);
  });

  it('every schema-validated family has both vectors.json and vectors.schema.json on disk', () => {
    for (const family of PARITY_FAMILIES) {
      const familyDir = resolve(CORPUS_ROOT, family);
      expect(existsSync(resolve(familyDir, 'vectors.json')), `${family} missing vectors.json`).toBe(
        true
      );
      expect(
        existsSync(resolve(familyDir, 'vectors.schema.json')),
        `${family} missing vectors.schema.json`
      ).toBe(true);
    }
  });

  it('every schema-validated vector carries the parity-vector shape (id + description + input.payload + expected.accepted)', () => {
    for (const family of PARITY_FAMILIES) {
      const loaded = loadFamily(family);
      for (const v of loaded.vectors) {
        expect(typeof v.id, `${family}/${v.id ?? '<no-id>'}: id`).toBe('string');
        expect(typeof v.description, `${family}/${v.id}: description`).toBe('string');
        expect(typeof v.input, `${family}/${v.id}: input`).toBe('object');
        expect(typeof v.input.payload, `${family}/${v.id}: input.payload`).toBe('object');
        expect(typeof v.expected, `${family}/${v.id}: expected`).toBe('object');
        expect(typeof v.expected.accepted, `${family}/${v.id}: expected.accepted`).toBe('boolean');
      }
    }
  });
});

describe('parity-corpus accounting (jcs-extended is excluded by design)', () => {
  it('jcs-extended directory exists alongside schema-validated families', () => {
    const jcsDir = resolve(CORPUS_ROOT, 'jcs-extended');
    expect(existsSync(jcsDir)).toBe(true);
    expect(statSync(jcsDir).isDirectory()).toBe(true);
  });

  it('jcs-extended is NOT enrolled in PARITY_FAMILIES (intentionally excluded)', () => {
    const families = PARITY_FAMILIES as readonly string[];
    expect(families).not.toContain('jcs-extended');
  });

  it('jcs-extended is NOT loaded by loadAllFamilies()', () => {
    const families = loadAllFamilies();
    const names = families.map((f) => f.family as string);
    expect(names).not.toContain('jcs-extended');
  });

  it('jcs-extended uses JCS canonicalization shape (input + canonical), not parity-vector shape', () => {
    const vectorsPath = resolve(CORPUS_ROOT, 'jcs-extended', 'vectors.json');
    expect(existsSync(vectorsPath)).toBe(true);

    const vectorsJson = JSON.parse(readFileSync(vectorsPath, 'utf8')) as {
      vectors: ReadonlyArray<Record<string, unknown>>;
    };
    expect(Array.isArray(vectorsJson.vectors)).toBe(true);
    expect(vectorsJson.vectors.length).toBeGreaterThan(0);

    for (const v of vectorsJson.vectors) {
      // JCS canonicalization shape carries `input` + `canonical` per vector.
      expect(v).toHaveProperty('id');
      expect(v).toHaveProperty('description');
      expect(v).toHaveProperty('input');
      expect(v).toHaveProperty('canonical');
      // It does NOT carry the parity-vector `expected.accepted` field.
      expect(v).not.toHaveProperty('expected');
    }
  });

  it('jcs-extended has no vectors.schema.json (not schema-validated as a parity family)', () => {
    const schemaPath = resolve(CORPUS_ROOT, 'jcs-extended', 'vectors.schema.json');
    expect(existsSync(schemaPath)).toBe(false);
  });
});

describe('parity-corpus accounting (no silent extra families)', () => {
  it('every directory under parity-corpus/ is either schema-validated and enrolled, or jcs-extended (the documented exception)', () => {
    const entries = readdirSync(CORPUS_ROOT, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const enrolled = new Set<string>([...(PARITY_FAMILIES as readonly string[]), 'jcs-extended']);
    const unaccounted = dirs.filter((d) => !enrolled.has(d));
    expect(unaccounted, `unaccounted parity-corpus directories: ${unaccounted.join(', ')}`).toEqual(
      []
    );
  });
});
