/**
 * External mathematical oracle for the point classifier.
 *
 * The corpus generator and the classifier are structurally independent but implement the same
 * Edwards arithmetic, so agreement between them does not establish correctness. This test checks
 * the classifier against an external authority.
 *
 * C2SP CCTV flags each vector independently and distinguishes:
 *   low_order_X            the point itself has small order;
 *   low_order_component_X  the point carries a low-order component, i.e. it is mixed order.
 *
 * Vendored test-only under BSD-3-Clause; nothing is fetched at test time.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyPointEncoding } from './helpers/ed25519-point-classifier.js';

const EXTERNAL = join(__dirname, 'fixtures', 'external');
const SUBSET_PATH = join(EXTERNAL, 'ed25519-cctv-subset.json');
const MANIFEST_PATH = join(EXTERNAL, 'ed25519-cctv-subset.manifest.json');

const corpus: {
  license: string;
  form: string;
  vectors: { number: number; key: string; sig: string; flags: string[] }[];
} = JSON.parse(readFileSync(SUBSET_PATH, 'utf8'));

const manifest: {
  upstream_commit: string;
  upstream_source_sha256: string;
  selection_algorithm_version: string;
  selected_vector_numbers: number[];
  subset_sha256: string;
  license_sha256: string;
} = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

const sha256 = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

/**
 * What the upstream flags mathematically imply for a position.
 *
 * CCTV flags are not PEAC classes. Each flag is mapped to the classification it implies, and where
 * the implication is narrow the assertion is correspondingly narrow.
 */
function expectedFrom(flags: string[], position: 'A' | 'R'): string[] {
  if (flags.includes(`non_canonical_${position}`)) {
    // Upstream non-canonical vectors are alternative encodings of low-order points, so RFC 8032
    // decoding must reject them. A canonical classification here would mean the encoding decoded
    // successfully, which contradicts the flag. Every vendored vector in this class decodes-fails
    // on the encoded-y range; the sign-bit failure is admitted because it is the only other
    // decoding rule that can produce a non-canonical low-order encoding.
    return ['invalid_y_out_of_range', 'invalid_x_zero_sign_set'];
  }
  if (flags.includes(`low_order_${position}`)) return ['canonical_small_order'];
  if (flags.includes(`low_order_component_${position}`)) return ['canonical_mixed_order'];
  return ['canonical_prime_subgroup'];
}

describe('PEAC classification agrees with the mathematical implications of CCTV flags', () => {
  it('the committed bytes match the integrity manifest', () => {
    // Recomputed from the files themselves, so a stale or incorrect manifest value fails here.
    expect(sha256(SUBSET_PATH)).toBe(manifest.subset_sha256);
    expect(sha256(join(EXTERNAL, 'ed25519-cctv-LICENSE.txt'))).toBe(manifest.license_sha256);
  });

  it('the checked-in re-vendoring tool agrees', () => {
    const tool = join(__dirname, 'tools', 'vendor-ed25519-cctv-subset.mjs');
    expect(() => execFileSync('node', [tool, '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('retains upstream provenance and licence', () => {
    expect(manifest.upstream_commit).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.upstream_source_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.selection_algorithm_version).toBe('1');
    expect(corpus.license).toBe('BSD-3-Clause');
    // The vendored corpus is a derived subset; only the licence file is an exact upstream copy.
    expect(corpus.form).toContain('DERIVED SUBSET');
    expect(readFileSync(join(EXTERNAL, 'ed25519-cctv-LICENSE.txt'), 'utf8')).toContain('Copyright');
  });

  it('the selection is unique, sorted and matches the pinned expected list', () => {
    const numbers = corpus.vectors.map((v) => v.number);
    expect(numbers).toEqual(manifest.selected_vector_numbers);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
    expect(numbers).toEqual([0, 1, 2, 4, 8, 9, 10, 14, 15, 16, 305]);
  });

  it('contains exactly one unflagged ordinary control, which is all the source has', () => {
    // The pinned upstream file contains exactly one vector with no flags.
    expect(corpus.vectors.filter((v) => v.flags.length === 0)).toHaveLength(1);
  });

  it('represents every intended flag family', () => {
    const all = corpus.vectors.flatMap((v) => v.flags);
    for (const flag of [
      'low_order_A',
      'low_order_R',
      'low_order_component_A',
      'low_order_component_R',
      'non_canonical_A',
      'non_canonical_R',
    ]) {
      expect(all).toContain(flag);
    }
  });

  it.each(corpus.vectors.map((v) => [v.number, v] as const))(
    'vector %i matches what its upstream flags imply',
    (_number, vector) => {
      for (const [position, encoding] of [
        ['A', vector.key],
        ['R', vector.sig.slice(0, 64)],
      ] as const) {
        const actual = classifyPointEncoding(encoding).classification;
        expect(expectedFrom(vector.flags, position)).toContain(actual);
      }
    }
  );

  it('classifies at least one point as mixed order, the class a bounded search misses', () => {
    const mixed = corpus.vectors.filter(
      (v) => classifyPointEncoding(v.key).classification === 'canonical_mixed_order'
    );
    expect(mixed.length).toBeGreaterThan(0);
  });
});
