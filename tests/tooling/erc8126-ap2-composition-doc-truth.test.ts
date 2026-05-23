/**
 * Doc-truth tests for the ERC-8126 and AP2 composition spec notes and
 * their associated interop fixture corpus.
 *
 * Asserts:
 *  - Composition spec docs exist and declare required sections
 *  - Non-claims are stated explicitly
 *  - COSE is excluded from the ERC-8126 vector corpus
 *  - The vector counts are exactly 3 positive + 2 negative per family
 *  - 2 interop families total
 *  - Every negative vector declares expected_failure.kind + expected_failure.reason
 *  - No stable error namespace fields leak into the vector corpus
 *  - The interop vector schema exists and forbids stable error fields
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join as pathJoin, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathJoin(__dirname, '..', '..');

const ERC_SPEC = pathJoin(ROOT, 'docs/specs/ERC-8126-COMPOSITION.md');
const AP2_SPEC = pathJoin(ROOT, 'docs/specs/AP2-COMPOSITION.md');
const SCHEMA = pathJoin(ROOT, 'specs/conformance/schemas/interop-vector.json');
const INTEROP_ROOT = pathJoin(ROOT, 'specs/conformance/interop');
const ERC_FAMILY_DIR = pathJoin(INTEROP_ROOT, 'erc8126-attestation-format');
const AP2_FAMILY_DIR = pathJoin(INTEROP_ROOT, 'ap2-open-mandate-hash');
const VERIFIER = pathJoin(ROOT, 'scripts/verify-interop-vectors.mjs');

function readText(p: string): string {
  return readFileSync(p, 'utf8');
}

/** Collapse intra-paragraph whitespace so substring assertions tolerate hard-wrapped Markdown. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function listJson(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

describe('ERC-8126 composition spec doc-truth', () => {
  it('exists at the expected path', () => {
    expect(existsSync(ERC_SPEC), `Expected file at ${ERC_SPEC}`).toBe(true);
  });

  it('declares the required headings', () => {
    const text = readText(ERC_SPEC);
    const required = [
      '# PEAC and ERC-8126 Composition',
      '**Status:** Informative',
      '## Why this document exists',
      '## Boundary',
      '## Carrier label used by these fixtures',
      '## Composition pattern',
      '## Verifier guidance',
      '## Related work',
    ];
    const missing = required.filter((heading) => !text.includes(heading));
    expect(missing, `Missing headings:\n${missing.join('\n')}`).toEqual([]);
  });

  it('declares explicit non-claims', () => {
    const text = normalize(readText(ERC_SPEC));
    expect(text).toContain('PEAC does not standardize ERC-8126');
    expect(text).toContain('PEAC does not host the Validation Registry');
    expect(text).toContain('PEAC records references to ERC-8126-aligned attestation');
  });

  it('records the COSE scope note in durable wording', () => {
    const text = normalize(readText(ERC_SPEC));
    expect(text).toContain('This fixture set does not include a COSE-Sign1 vector');
    expect(text).toContain('This repository does not include a PEAC COSE carrier implementation');
  });

  it('points to the repository interop fixtures and verifier', () => {
    const text = readText(ERC_SPEC);
    expect(text).toContain('specs/conformance/interop/erc8126-attestation-format/');
    expect(text).toContain('scripts/verify-interop-vectors.mjs');
  });
});

describe('AP2 composition spec doc-truth', () => {
  it('exists at the expected path', () => {
    expect(existsSync(AP2_SPEC), `Expected file at ${AP2_SPEC}`).toBe(true);
  });

  it('declares the required headings', () => {
    const text = readText(AP2_SPEC);
    const required = [
      '# PEAC and AP2 Composition',
      '**Status:** Informative',
      '## Why this document exists',
      '## Boundary',
      '## Composition pattern',
      '## Verifier guidance',
      '## Repository interop fixtures',
      '## Related work',
    ];
    const missing = required.filter((heading) => !text.includes(heading));
    expect(missing, `Missing headings:\n${missing.join('\n')}`).toEqual([]);
  });

  it('declares explicit non-claims', () => {
    const text = normalize(readText(AP2_SPEC));
    expect(text).toContain('PEAC does not extend AP2');
    expect(text).toContain('PEAC does not mint mandates');
    expect(text).toContain('PEAC records references to AP2 mandate artifacts');
  });

  it('points to the repository interop fixtures and verifier and AP2 #265', () => {
    const text = readText(AP2_SPEC);
    expect(text).toContain('specs/conformance/interop/ap2-open-mandate-hash/');
    expect(text).toContain('scripts/verify-interop-vectors.mjs');
    expect(text).toContain('google-agentic-commerce/AP2/issues/265');
  });
});

describe('Interop vector schema doc-truth', () => {
  it('exists at the expected path', () => {
    expect(existsSync(SCHEMA), `Expected schema at ${SCHEMA}`).toBe(true);
  });

  it('uses the documented PEAC schema $id namespace', () => {
    const schema = readJson(SCHEMA);
    expect(schema.$id).toBe(
      'https://www.peacprotocol.org/schemas/conformance/interop-vector.schema.json'
    );
  });

  it('enumerates only fixture-scoped expected_failure.kind values', () => {
    const schema = readJson(SCHEMA) as {
      properties: { expected_failure: { properties: { kind: { enum: string[] } } } };
    };
    const enumValues = schema.properties.expected_failure.properties.kind.enum;
    expect(enumValues.sort()).toEqual(
      ['canonicalization_failure', 'digest_failure', 'validation_failure'].sort()
    );
  });
});

describe('Interop fixture corpus doc-truth', () => {
  it('contains exactly 2 interop families (no extras)', () => {
    const families = readdirSync(INTEROP_ROOT)
      .filter((name) => !name.startsWith('.'))
      .sort();
    expect(families).toEqual(['ap2-open-mandate-hash', 'erc8126-attestation-format']);
  });

  it('ERC-8126 family contains 3 positive + 2 negative vectors only', () => {
    expect(listJson(pathJoin(ERC_FAMILY_DIR, 'positive'))).toHaveLength(3);
    expect(listJson(pathJoin(ERC_FAMILY_DIR, 'negative'))).toHaveLength(2);
  });

  it('AP2 family contains 3 positive + 2 negative vectors only', () => {
    expect(listJson(pathJoin(AP2_FAMILY_DIR, 'positive'))).toHaveLength(3);
    expect(listJson(pathJoin(AP2_FAMILY_DIR, 'negative'))).toHaveLength(2);
  });

  it('exactly 10 interop vectors across both families', () => {
    const erc =
      listJson(pathJoin(ERC_FAMILY_DIR, 'positive')).length +
      listJson(pathJoin(ERC_FAMILY_DIR, 'negative')).length;
    const ap2 =
      listJson(pathJoin(AP2_FAMILY_DIR, 'positive')).length +
      listJson(pathJoin(AP2_FAMILY_DIR, 'negative')).length;
    expect(erc + ap2).toBe(10);
  });

  it('ERC-8126 family does not contain a COSE vector', () => {
    const allFiles = [
      ...listJson(pathJoin(ERC_FAMILY_DIR, 'positive')),
      ...listJson(pathJoin(ERC_FAMILY_DIR, 'negative')),
    ];
    for (const filename of allFiles) {
      expect(filename.toLowerCase()).not.toContain('cose');
    }
    const allInputs = allFiles.map((filename) => {
      const v = readJson(
        pathJoin(
          ERC_FAMILY_DIR,
          filename.startsWith('v0') && /^v0[123]/.test(filename) ? 'positive' : 'negative',
          filename
        )
      );
      return (v.input as { attestationFormat?: string }).attestationFormat ?? '';
    });
    for (const label of allInputs) {
      expect(label.toLowerCase()).not.toBe('cose');
    }
  });

  it('every negative vector across both families declares expected_failure.kind + reason', () => {
    const negatives = [
      ...listJson(pathJoin(ERC_FAMILY_DIR, 'negative')).map((n) =>
        pathJoin(ERC_FAMILY_DIR, 'negative', n)
      ),
      ...listJson(pathJoin(AP2_FAMILY_DIR, 'negative')).map((n) =>
        pathJoin(AP2_FAMILY_DIR, 'negative', n)
      ),
    ];
    expect(negatives).toHaveLength(4);
    for (const p of negatives) {
      const v = readJson(p) as {
        expected_failure?: { kind?: string; reason?: string };
      };
      expect(v.expected_failure, `${p} missing expected_failure`).toBeTypeOf('object');
      expect(typeof v.expected_failure!.kind).toBe('string');
      expect(typeof v.expected_failure!.reason).toBe('string');
      expect(v.expected_failure!.reason).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('no vector declares a stable PEAC error code, error class, or error namespace', () => {
    const allPaths = [
      ...listJson(pathJoin(ERC_FAMILY_DIR, 'positive')).map((n) =>
        pathJoin(ERC_FAMILY_DIR, 'positive', n)
      ),
      ...listJson(pathJoin(ERC_FAMILY_DIR, 'negative')).map((n) =>
        pathJoin(ERC_FAMILY_DIR, 'negative', n)
      ),
      ...listJson(pathJoin(AP2_FAMILY_DIR, 'positive')).map((n) =>
        pathJoin(AP2_FAMILY_DIR, 'positive', n)
      ),
      ...listJson(pathJoin(AP2_FAMILY_DIR, 'negative')).map((n) =>
        pathJoin(AP2_FAMILY_DIR, 'negative', n)
      ),
    ];
    expect(allPaths).toHaveLength(10);
    for (const p of allPaths) {
      const text = readText(p);
      expect(text).not.toMatch(/"error_code"/);
      expect(text).not.toMatch(/"error_class"/);
      expect(text).not.toMatch(/"error_namespace"/);
      expect(text).not.toMatch(/"peac_error"/);
    }
  });

  it('every vector has only allowed top-level keys', () => {
    const allowedTopLevel = new Set([
      '$schema',
      'vector_id',
      'description',
      'input',
      'expected',
      'expected_failure',
    ]);
    const allPaths = [
      ...listJson(pathJoin(ERC_FAMILY_DIR, 'positive')).map((n) =>
        pathJoin(ERC_FAMILY_DIR, 'positive', n)
      ),
      ...listJson(pathJoin(ERC_FAMILY_DIR, 'negative')).map((n) =>
        pathJoin(ERC_FAMILY_DIR, 'negative', n)
      ),
      ...listJson(pathJoin(AP2_FAMILY_DIR, 'positive')).map((n) =>
        pathJoin(AP2_FAMILY_DIR, 'positive', n)
      ),
      ...listJson(pathJoin(AP2_FAMILY_DIR, 'negative')).map((n) =>
        pathJoin(AP2_FAMILY_DIR, 'negative', n)
      ),
    ];
    for (const p of allPaths) {
      const v = readJson(p);
      const unknown = Object.keys(v).filter((k) => !allowedTopLevel.has(k));
      expect(unknown, `${p}: unexpected top-level keys: ${unknown.join(', ')}`).toEqual([]);
    }
  });

  it('every negative vector restricts expected_failure to kind + reason', () => {
    const allowedFailureKeys = new Set(['kind', 'reason']);
    const allNegatives = [
      ...listJson(pathJoin(ERC_FAMILY_DIR, 'negative')).map((n) =>
        pathJoin(ERC_FAMILY_DIR, 'negative', n)
      ),
      ...listJson(pathJoin(AP2_FAMILY_DIR, 'negative')).map((n) =>
        pathJoin(AP2_FAMILY_DIR, 'negative', n)
      ),
    ];
    for (const p of allNegatives) {
      const v = readJson(p) as { expected_failure?: Record<string, unknown> };
      expect(v.expected_failure, `${p}: missing expected_failure`).toBeTypeOf('object');
      const unknown = Object.keys(v.expected_failure!).filter((k) => !allowedFailureKeys.has(k));
      expect(unknown, `${p}: unexpected expected_failure keys: ${unknown.join(', ')}`).toEqual([]);
    }
  });

  it('verifier script exists at the expected path', () => {
    expect(existsSync(VERIFIER), `Expected verifier at ${VERIFIER}`).toBe(true);
  });
});
