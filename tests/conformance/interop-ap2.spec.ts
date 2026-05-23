/**
 * AP2 open_mandate_hash interop vector conformance tests.
 *
 * Repository interop fixtures under specs/conformance/interop/ap2-open-mandate-hash/
 * are validated for envelope shape, deterministic JCS canonical-bytes
 * regeneration, SHA-256 derivation matching the AP2 #265 rule, and
 * declared composition-failure modes on negative vectors.
 * Negative-vector reason strings are fixture-scoped and not stable PEAC
 * error codes.
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
  'ap2-open-mandate-hash'
);

interface PositiveVector {
  $schema: string;
  vector_id: string;
  description: string;
  input: Record<string, unknown>;
  expected: {
    canonical_bytes_utf8_length?: number;
    open_mandate_hash: string;
  };
}

interface NegativeV04 {
  $schema: string;
  vector_id: string;
  description: string;
  input: {
    body: Record<string, unknown>;
    candidate_open_mandate_hash_via_sha1: string;
  };
  expected_failure: { kind: 'digest_failure'; reason: 'non_sha256_digest' };
}

interface NegativeV05 {
  $schema: string;
  vector_id: string;
  description: string;
  input: {
    body: Record<string, unknown>;
    candidate_non_jcs_bytes_utf8: string;
    candidate_open_mandate_hash_via_non_jcs: string;
  };
  expected_failure: { kind: 'canonicalization_failure'; reason: 'non_jcs_canonicalization' };
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

function sha1Hex(input: Uint8Array | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return createHash('sha1').update(buf).digest('hex');
}

describe('AP2 open_mandate_hash interop vectors', () => {
  it('contains exactly 3 positive and 2 negative vectors', () => {
    const positives = listFixtures('positive');
    const negatives = listFixtures('negative');
    expect(positives).toHaveLength(3);
    expect(negatives).toHaveLength(2);
  });

  describe('positive vectors', () => {
    for (const filename of listFixtures('positive')) {
      describe(filename, () => {
        const vector = readVector<PositiveVector>(join('positive', filename));

        it('declares envelope fields', () => {
          expect(vector.$schema).toBeTypeOf('string');
          expect(vector.vector_id).toBeTypeOf('string');
          expect(vector.description.length).toBeGreaterThan(0);
          expect(vector.input).toBeTypeOf('object');
          expect(vector.expected.open_mandate_hash).toMatch(/^[0-9a-f]{64}$/);
          expect(vector).not.toHaveProperty('expected_failure');
        });

        it('open_mandate_hash matches sha256_hex(JCS(input))', () => {
          const bytes = canonicalizeBytes(vector.input);
          const actual = sha256Hex(bytes);
          expect(actual).toBe(vector.expected.open_mandate_hash);
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
    it('declares envelope fields and stable-error-namespace absence on every negative', () => {
      for (const filename of listFixtures('negative')) {
        const vector = readVector<{
          $schema: string;
          vector_id: string;
          description: string;
          input: Record<string, unknown>;
          expected_failure: { kind: string; reason: string };
        }>(join('negative', filename));
        expect(vector.$schema).toBeTypeOf('string');
        expect(vector.vector_id).toBeTypeOf('string');
        expect(vector.description.length).toBeGreaterThan(0);
        expect(vector.expected_failure.reason).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(['validation_failure', 'canonicalization_failure', 'digest_failure']).toContain(
          vector.expected_failure.kind
        );
        expect(vector).not.toHaveProperty('expected');
        expect(vector.expected_failure).not.toHaveProperty('error_code');
        expect(vector.expected_failure).not.toHaveProperty('error_class');
        expect(vector.expected_failure).not.toHaveProperty('error_namespace');
        expect(vector).not.toHaveProperty('error_code');
        expect(vector).not.toHaveProperty('error_class');
        expect(vector).not.toHaveProperty('error_namespace');
      }
    });

    describe('v04-non-sha256-digest.json', () => {
      const vector = readVector<NegativeV04>(join('negative', 'v04-non-sha256-digest.json'));

      it('declares the expected fixture-scoped reason', () => {
        expect(vector.expected_failure.kind).toBe('digest_failure');
        expect(vector.expected_failure.reason).toBe('non_sha256_digest');
      });

      it('candidate digest equals sha1_hex(JCS(body)) and not sha256_hex(JCS(body))', () => {
        const bytes = canonicalizeBytes(vector.input.body);
        const sha256 = sha256Hex(bytes);
        const sha1 = sha1Hex(bytes);
        expect(vector.input.candidate_open_mandate_hash_via_sha1).toBe(sha1);
        expect(vector.input.candidate_open_mandate_hash_via_sha1).not.toBe(sha256);
      });
    });

    describe('v05-non-jcs-canonicalization.json', () => {
      const vector = readVector<NegativeV05>(join('negative', 'v05-non-jcs-canonicalization.json'));

      it('declares the expected fixture-scoped reason', () => {
        expect(vector.expected_failure.kind).toBe('canonicalization_failure');
        expect(vector.expected_failure.reason).toBe('non_jcs_canonicalization');
      });

      it('candidate bytes do not equal JCS canonical bytes', () => {
        const jcs = canonicalize(vector.input.body);
        expect(vector.input.candidate_non_jcs_bytes_utf8).not.toBe(jcs);
      });

      it('candidate digest equals sha256_hex(candidate_bytes) and not sha256_hex(JCS(body))', () => {
        const candidateBytesHash = sha256Hex(vector.input.candidate_non_jcs_bytes_utf8);
        const jcsBytes = canonicalizeBytes(vector.input.body);
        const jcsHash = sha256Hex(jcsBytes);
        expect(vector.input.candidate_open_mandate_hash_via_non_jcs).toBe(candidateBytesHash);
        expect(vector.input.candidate_open_mandate_hash_via_non_jcs).not.toBe(jcsHash);
      });
    });
  });
});
