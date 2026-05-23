/**
 * ERC-8126 attestation-format interop vector conformance tests.
 *
 * Repository interop fixtures under specs/conformance/interop/erc8126-attestation-format/
 * are validated for envelope shape, deterministic JCS canonical-bytes
 * regeneration, recognized open-label set membership, and declared
 * expected_failure shape on negative vectors. Negative-vector reason
 * strings are fixture-scoped and not stable PEAC error codes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalize, canonicalizeBytes } from '@peac/crypto';

const FAMILY_DIR = join(
  __dirname,
  '..',
  '..',
  'specs',
  'conformance',
  'interop',
  'erc8126-attestation-format'
);

const RECOGNIZED_LABELS = new Set(['jws', 'eip712', 'onchain']);

interface PositiveVector {
  $schema: string;
  vector_id: string;
  description: string;
  input: Record<string, unknown> & { attestationFormat?: string };
  expected: {
    canonical_bytes_utf8_length?: number;
    canonical_bytes_sha256_hex: string;
  };
}

interface NegativeVector {
  $schema: string;
  vector_id: string;
  description: string;
  input: Record<string, unknown>;
  expected_failure: {
    kind: 'validation_failure' | 'canonicalization_failure' | 'digest_failure';
    reason: string;
  };
}

function readVector<T>(rel: string): T {
  return JSON.parse(readFileSync(join(FAMILY_DIR, rel), 'utf8')) as T;
}

function listFixtures(subdir: string): string[] {
  return readdirSync(join(FAMILY_DIR, subdir))
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function sha256Hex(input: Uint8Array | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return createHash('sha256').update(buf).digest('hex');
}

describe('ERC-8126 attestation-format interop vectors', () => {
  it('contains exactly 3 positive and 2 negative vectors', () => {
    const positives = listFixtures('positive');
    const negatives = listFixtures('negative');
    expect(positives).toHaveLength(3);
    expect(negatives).toHaveLength(2);
  });

  describe('positive vectors', () => {
    const positives = listFixtures('positive');
    for (const filename of positives) {
      describe(filename, () => {
        const vector = readVector<PositiveVector>(join('positive', filename));

        it('declares envelope fields', () => {
          expect(vector.$schema).toBeTypeOf('string');
          expect(vector.vector_id).toBeTypeOf('string');
          expect(vector.description.length).toBeGreaterThan(0);
          expect(vector.input).toBeTypeOf('object');
          expect(vector.expected).toBeTypeOf('object');
          expect(vector).not.toHaveProperty('expected_failure');
        });

        it('declares attestationFormat in the recognized open-label set', () => {
          expect(typeof vector.input.attestationFormat).toBe('string');
          expect(RECOGNIZED_LABELS.has(vector.input.attestationFormat!)).toBe(true);
        });

        it('canonical-bytes SHA-256 matches expected', () => {
          const bytes = canonicalizeBytes(vector.input);
          const actual = sha256Hex(bytes);
          expect(actual).toBe(vector.expected.canonical_bytes_sha256_hex);
          if (typeof vector.expected.canonical_bytes_utf8_length === 'number') {
            expect(bytes.length).toBe(vector.expected.canonical_bytes_utf8_length);
          }
        });

        it('canonical-bytes regeneration is deterministic', () => {
          const a = canonicalize(vector.input);
          const b = canonicalize(vector.input);
          expect(a).toBe(b);
        });
      });
    }
  });

  describe('negative vectors', () => {
    const expectedReasons: Record<string, string> = {
      'v04-unknown-format.json': 'unsupported_attestation_format',
      'v05-missing-format.json': 'missing_attestation_format',
    };

    for (const filename of listFixtures('negative')) {
      describe(filename, () => {
        const vector = readVector<NegativeVector>(join('negative', filename));

        it('declares envelope fields', () => {
          expect(vector.$schema).toBeTypeOf('string');
          expect(vector.vector_id).toBeTypeOf('string');
          expect(vector.description.length).toBeGreaterThan(0);
          expect(vector.input).toBeTypeOf('object');
          expect(vector).not.toHaveProperty('expected');
        });

        it('declares expected_failure.kind and expected_failure.reason', () => {
          expect(['validation_failure', 'canonicalization_failure', 'digest_failure']).toContain(
            vector.expected_failure.kind
          );
          expect(vector.expected_failure.reason).toMatch(/^[a-z][a-z0-9_]*$/);
        });

        it('declares the expected fixture-scoped reason', () => {
          expect(vector.expected_failure.reason).toBe(expectedReasons[filename]);
        });

        it('does not declare a stable PEAC error code or error class', () => {
          expect(vector.expected_failure).not.toHaveProperty('error_code');
          expect(vector.expected_failure).not.toHaveProperty('error_class');
          expect(vector.expected_failure).not.toHaveProperty('error_namespace');
          expect(vector).not.toHaveProperty('error_code');
          expect(vector).not.toHaveProperty('error_class');
          expect(vector).not.toHaveProperty('error_namespace');
        });

        it('exercises the declared failure mode', () => {
          if (filename === 'v04-unknown-format.json') {
            const attestationFormat = (vector.input as { attestationFormat?: string })
              .attestationFormat;
            expect(typeof attestationFormat).toBe('string');
            expect(RECOGNIZED_LABELS.has(attestationFormat!)).toBe(false);
          } else if (filename === 'v05-missing-format.json') {
            expect(vector.input).not.toHaveProperty('attestationFormat');
          }
        });
      });
    }
  });
});
