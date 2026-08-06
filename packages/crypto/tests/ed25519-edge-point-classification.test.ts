/**
 * Classification of the Ed25519 encodings at the edges of admissibility.
 *
 * The corpus records what each encoding is, derived from RFC 8032 decoding and group arithmetic,
 * separately from what the PEAC profile does with it. The two are distinct: an encoding can be a
 * valid curve point and still be inadmissible under a bounded profile.
 *
 * The classifier is independent of the corpus generator.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyPointEncoding } from './helpers/ed25519-point-classifier.js';

const CRYPTO_ROOT = join(__dirname, '..');
const REPO_ROOT = join(CRYPTO_ROOT, '..', '..');

interface Entry {
  encoding_hex: string;
  encoded_y_in_range: boolean;
  sign_encoding_valid: boolean | null;
  decodes_to_curve_point: boolean;
  primary_class: string;
  prime_subgroup_member: boolean | null;
  torsion_component_order: number | null;
  exact_order: string | null;
  baseline_0_16_3_table_membership: boolean;
  baseline_0_16_3_precheck: { public_key_A: string; signature_R: string };
  target_precheck: { public_key_A: string; signature_R: string };
  target_enforcement_mechanism: string;
  expected_profile_result: string;
  provenance: string[];
}

const corpus: { entries: Entry[] } = JSON.parse(
  readFileSync(join(CRYPTO_ROOT, 'tests', 'fixtures', 'ed25519-edge-point-encodings.json'), 'utf8')
);

/**
 * Byte literals of one declared point table, read from its exact declaration body.
 *
 * Extraction is scoped to the declaration body. A file-wide scan for hexadecimal literals would
 * also match the group order L, which both implementations declare for the S >= L guard.
 */
function bytesTable(source: string, declaration: RegExp): string[] {
  const body = declaration.exec(source);
  expect(body, `table not found in its expected declaration: ${declaration}`).not.toBeNull();
  const bytes = [...body![1].matchAll(/0x([0-9a-f]{2})/g)].map((m) => m[1]);
  expect(bytes.length % 32, 'a point table must be a whole number of 32-byte records').toBe(0);
  const records: string[] = [];
  for (let i = 0; i < bytes.length; i += 32) records.push(bytes.slice(i, i + 32).join(''));
  return records;
}

function typescriptTable(): string[] {
  const source = readFileSync(
    join(CRYPTO_ROOT, 'src', 'internal', 'ed25519-admissibility.ts'),
    'utf8'
  );
  return [
    ...bytesTable(source, /ED25519_TORSION_POINT_ENCODINGS = Uint8Array\.from\(\[([\s\S]*?)\]\)/),
    ...bytesTable(
      source,
      /PEAC_PROFILE_MIXED_ORDER_REJECTIONS = Uint8Array\.from\(\[([\s\S]*?)\]\)/
    ),
  ];
}

function goTable(): string[] {
  const source = readFileSync(
    join(REPO_ROOT, 'sdks', 'go', 'jws', 'ed25519_admissibility.go'),
    'utf8'
  );
  // Go records are brace groups of byte literals; trailing zero bytes may be elided.
  const records = (declaration: RegExp): string[] => {
    const body = declaration.exec(source);
    expect(body, `table not found in its expected declaration: ${declaration}`).not.toBeNull();
    return [...body![1].matchAll(/\{([^{}]*)\}: \{\}/g)].map((m) => {
      const bytes = [...m[1].matchAll(/0x([0-9a-f]{2})/g)].map((b) => b[1]);
      while (bytes.length < 32) bytes.push('00');
      return bytes.join('');
    });
  };
  return [
    ...records(
      /ed25519TorsionPointEncodings = map\[\[ed25519PointBytes\]byte\]struct\{\}\{([\s\S]*?)\n\}/
    ),
    ...records(
      /peacProfileMixedOrderRejections = map\[\[ed25519PointBytes\]byte\]struct\{\}\{([\s\S]*?)\n\}/
    ),
  ];
}

describe('every corpus entry is classified from first principles', () => {
  it.each(corpus.entries.map((e) => [e.encoding_hex.slice(0, 16), e] as const))(
    '%s',
    (_label, entry) => {
      const facts = classifyPointEncoding(entry.encoding_hex);
      expect(facts.encodedYInRange).toBe(entry.encoded_y_in_range);
      expect(facts.signEncodingValid).toBe(entry.sign_encoding_valid);
      expect(facts.decodesToCurvePoint).toBe(entry.decodes_to_curve_point);
      expect(facts.classification).toBe(entry.primary_class);
      expect(facts.primeSubgroupMember).toBe(entry.prime_subgroup_member);
      expect(facts.torsionComponentOrder).toBe(entry.torsion_component_order);
      expect(facts.exactOrder).toBe(entry.exact_order);
    }
  );
});

describe('the corpus covers the subgroup structure it claims to', () => {
  const canonicalSmall = corpus.entries.filter((e) => e.primary_class === 'canonical_small_order');

  it('contains the complete 8-torsion subgroup: orders 1, 2, 4, 4, 8, 8, 8, 8', () => {
    expect(canonicalSmall).toHaveLength(8);
    expect(canonicalSmall.map((e) => e.torsion_component_order).sort((a, b) => a! - b!)).toEqual([
      1, 2, 4, 4, 8, 8, 8, 8,
    ]);
  });

  it('classifies the two retained encodings as mixed order 4L, not prime-subgroup points', () => {
    // These are canonical curve points, so they are not decoding failures. They are also not
    // ordinary keys: they carry a torsion component, which is why the profile rejects them.
    const mixed = corpus.entries.filter((e) => e.primary_class === 'canonical_mixed_order');
    expect(mixed).toHaveLength(2);
    for (const entry of mixed) {
      expect(entry.decodes_to_curve_point).toBe(true);
      expect(entry.prime_subgroup_member).toBe(false);
      expect(entry.exact_order).toBe('4L');
      expect(entry.torsion_component_order).toBe(4);
      expect(entry.target_precheck.public_key_A).toBe('reject');
      expect(entry.target_precheck.signature_R).toBe('reject');
      expect(entry.target_enforcement_mechanism).toBe('mixed_order_profile_table');
    }
  });

  it('records non-canonical encodings with their decoding reason', () => {
    const yRange = corpus.entries.filter((e) => e.primary_class === 'invalid_y_out_of_range');
    const xZero = corpus.entries.filter((e) => e.primary_class === 'invalid_x_zero_sign_set');
    expect(yRange.length).toBeGreaterThan(0);
    expect(xZero).toHaveLength(2);
    for (const entry of [...yRange, ...xZero]) {
      expect(entry.decodes_to_curve_point).toBe(false);
      expect(entry.exact_order).toBeNull();
    }
    // Neither failure may be described as a canonical encoding.
    for (const entry of yRange) expect(entry.encoded_y_in_range).toBe(false);
    for (const entry of xZero) expect(entry.sign_encoding_valid).toBe(false);
  });

  it('carries ordinary prime-subgroup controls that the profile must keep accepting', () => {
    // Positive controls: a predicate that rejected every input would pass a rejection-only corpus.
    const ordinary = corpus.entries.filter((e) => e.primary_class === 'canonical_prime_subgroup');
    expect(ordinary.length).toBeGreaterThanOrEqual(4);
    for (const entry of ordinary) {
      expect(entry.exact_order).toBe('L');
      expect(entry.prime_subgroup_member).toBe(true);
      expect(entry.target_precheck.public_key_A).toBe('delegate');
      expect(entry.target_precheck.signature_R).toBe('delegate');
      expect(entry.expected_profile_result).toBe('accept_when_signature_valid');
    }
  });

  it('the identity is both a small-order point and a prime-subgroup member', () => {
    // [L]O = O, so prime-subgroup membership holds while the encoding is still rejected. The two
    // facts are recorded in separate fields.
    const identity = corpus.entries.find((e) => e.exact_order === '1');
    expect(identity).toBeDefined();
    expect(identity!.primary_class).toBe('canonical_small_order');
    expect(identity!.prime_subgroup_member).toBe(true);
    expect(identity!.target_precheck.public_key_A).toBe('reject');
    expect(identity!.target_precheck.signature_R).toBe('reject');
  });

  it('an off-curve encoding is delegated by the precheck and rejected by the runtime', () => {
    // The bounded precheck does not detect curve membership, so the precheck action and the
    // profile result differ here and are recorded as separate fields.
    const offCurve = corpus.entries.filter((e) => e.primary_class === 'invalid_not_on_curve');
    expect(offCurve.length).toBeGreaterThanOrEqual(1);
    for (const entry of offCurve) {
      expect(entry.encoded_y_in_range).toBe(true);
      expect(entry.sign_encoding_valid).toBe(true);
      expect(entry.decodes_to_curve_point).toBe(false);
      expect(entry.target_precheck.public_key_A).toBe('delegate');
      expect(entry.target_precheck.signature_R).toBe('delegate');
      expect(entry.target_enforcement_mechanism).toBe('runtime_primitive');
      expect(entry.expected_profile_result).toBe('reject');
    }
  });

  it('no ordinary prime-subgroup point appears in a production rejection table', () => {
    const tabled = new Set(typescriptTable());
    for (const entry of corpus.entries) {
      if (entry.primary_class === 'canonical_prime_subgroup') {
        expect(tabled.has(entry.encoding_hex)).toBe(false);
      }
    }
  });
});

describe('the two reference implementations declare the same table', () => {
  it('TypeScript and Go tables are byte-for-byte identical', () => {
    expect([...typescriptTable()].sort()).toEqual([...goTable()].sort());
  });

  it('entries are unique and exactly 32 bytes', () => {
    for (const table of [typescriptTable(), goTable()]) {
      expect(new Set(table).size).toBe(table.length);
      for (const entry of table) expect(entry).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('the group order is a scalar constant and never a table member', () => {
    // A file-wide hexadecimal scan reports L as a table entry, because both implementations
    // legitimately declare it for the S >= L malleability guard. Structural extraction must not.
    const groupOrderBigEndian = '1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed';
    expect(typescriptTable()).not.toContain(groupOrderBigEndian);
    expect(goTable()).not.toContain(groupOrderBigEndian);
    // L is present in the Go source as a declared constant, outside the table.
    const go = readFileSync(join(REPO_ROOT, 'sdks', 'go', 'jws', 'ed25519.go'), 'utf8');
    expect(go).toContain(groupOrderBigEndian);
    expect(go).toContain('ed25519GroupOrderL');
  });

  it('every tabled encoding is one the corpus classifies as inadmissible', () => {
    for (const entry of typescriptTable()) {
      const classified = corpus.entries.find((e) => e.encoding_hex === entry);
      expect(classified, `${entry} is tabled but absent from the corpus`).toBeDefined();
      expect(classified!.target_precheck.public_key_A).toBe('reject');
    }
  });
});

describe('the historical baseline records the A versus R asymmetry', () => {
  it('a baseline-tabled encoding was rejected as A but delegated as R', () => {
    // PEAC 0.16.3 applied its table to the public key only, so the corpus records the baseline
    // action for the A and R positions separately.
    const tabled = corpus.entries.filter((e) => e.baseline_0_16_3_table_membership);
    expect(tabled.length).toBeGreaterThan(0);
    for (const entry of tabled) {
      expect(entry.baseline_0_16_3_precheck.public_key_A).toBe('reject');
      expect(entry.baseline_0_16_3_precheck.signature_R).toBe('delegate');
    }
  });

  it('an untabled encoding was delegated in both positions', () => {
    for (const entry of corpus.entries.filter((e) => !e.baseline_0_16_3_table_membership)) {
      expect(entry.baseline_0_16_3_precheck.public_key_A).toBe('delegate');
      expect(entry.baseline_0_16_3_precheck.signature_R).toBe('delegate');
    }
  });

  it("speccheck-2's R is the encoding that exhibits the asymmetry", () => {
    // Its R is a small-order point present in the baseline table, which the baseline applied to
    // the public key position only.
    const speccheck2R = 'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa';
    const entry = corpus.entries.find((e) => e.encoding_hex === speccheck2R);
    expect(entry).toBeDefined();
    expect(entry!.primary_class).toBe('canonical_small_order');
    expect(entry!.baseline_0_16_3_table_membership).toBe(true);
    expect(entry!.baseline_0_16_3_precheck.public_key_A).toBe('reject');
    expect(entry!.baseline_0_16_3_precheck.signature_R).toBe('delegate');
    expect(entry!.target_precheck.signature_R).toBe('reject');
  });

  it('the target policy closes the gap in both positions', () => {
    for (const entry of corpus.entries) {
      const rejected = entry.target_precheck.public_key_A === 'reject';
      expect(entry.target_precheck.signature_R).toBe(rejected ? 'reject' : 'delegate');
    }
  });
});

describe('the corpus is verifiably regenerable', () => {
  const GENERATOR = join(CRYPTO_ROOT, 'tests', 'tools', 'generate-ed25519-edge-corpus.mjs');
  const FIXTURE = join(CRYPTO_ROOT, 'tests', 'fixtures', 'ed25519-edge-point-encodings.json');

  const check = (fixture?: string): number => {
    const args = fixture ? [GENERATOR, '--check', '--fixture', fixture] : [GENERATOR, '--check'];
    try {
      execFileSync('node', args, { encoding: 'utf8', stdio: 'pipe' });
      return 0;
    } catch (e) {
      return (e as { status?: number }).status ?? 1;
    }
  };

  it('the committed fixture matches a fresh generation', () => {
    // Runs --check rather than only asserting that the flag is accepted.
    expect(check()).toBe(0);
  }, 30_000);

  it('a modified fixture field fails the check', () => {
    // Verified against a disposable copy. Mutating the tracked fixture would race parallel
    // workers and could leave the worktree dirty if the process died mid-test.
    const dir = mkdtempSync(join(tmpdir(), 'peac-edge-corpus-'));
    try {
      const copy = join(dir, 'fixture.json');
      copyFileSync(FIXTURE, copy);
      expect(check(copy)).toBe(0);

      const tampered = JSON.parse(readFileSync(copy, 'utf8'));
      tampered.entries[0].exact_order = 'tampered';
      writeFileSync(copy, `${JSON.stringify(tampered, null, 2)}\n`);
      expect(check(copy)).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(check()).toBe(0);
  }, 60_000);
});

describe('the historical baseline cannot be derived from live production source', () => {
  const GENERATOR_SOURCE = readFileSync(
    join(CRYPTO_ROOT, 'tests', 'tools', 'generate-ed25519-edge-corpus.mjs'),
    'utf8'
  );

  it('the generator reads the pinned snapshot, never the live implementation', () => {
    // While the live table still equals the baseline, reading either yields the same answer, so a
    // value comparison cannot tell them apart. That stops being true the moment production changes,
    // which is exactly when a silent redefinition of "baseline" would matter. Assert the source
    // structurally instead.
    expect(GENERATOR_SOURCE).toContain('ed25519-baseline-0.16.3.json');
    expect(GENERATOR_SOURCE).not.toContain("'src', 'ed25519.ts'");
    expect(GENERATOR_SOURCE).not.toContain('src/ed25519.ts');
  });

  it('the pinned snapshot records the tag it was taken from', () => {
    const pinned = JSON.parse(
      readFileSync(join(CRYPTO_ROOT, 'tests', 'fixtures', 'ed25519-baseline-0.16.3.json'), 'utf8')
    );
    expect(pinned.source_tag).toBe('v0.16.3');
    expect(pinned.source_commit).toMatch(/^[0-9a-f]{40}$/);
    expect(pinned.tables_identical).toBe(true);
    expect(pinned.typescript_table).toHaveLength(11);
    expect([...pinned.typescript_table].sort()).toEqual([...pinned.go_table].sort());
  });
});

describe('the classifier accepts only exact lowercase 32-byte hex', () => {
  // Reproducible fixture identity depends on one spelling per encoding, so uppercase is rejected
  // rather than normalized.
  it.each([
    ['uppercase', 'ECFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF7F'],
    ['63 characters', '0'.repeat(63)],
    ['65 characters', '0'.repeat(65)],
    ['62 characters', '0'.repeat(62)],
    ['66 characters', '0'.repeat(66)],
    ['non-hex characters', 'z'.repeat(64)],
    ['empty', ''],
    ['0x prefix', `0x${'0'.repeat(62)}`],
  ])('rejects %s', (_label, input) => {
    expect(() => classifyPointEncoding(input)).toThrow();
  });

  it('accepts the canonical lowercase spelling of the same value', () => {
    expect(() =>
      classifyPointEncoding('ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f')
    ).not.toThrow();
  });
});

describe('named encoded-y boundaries classify exactly, in both sign variants', () => {
  const FIELD_PRIME = 2n ** 255n - 19n;
  const encode = (y: bigint, signBit: 0 | 1): string => {
    const bytes = new Uint8Array(32);
    let rest = y & (2n ** 255n - 1n);
    for (let i = 0; i < 32 && rest > 0n; i++) {
      bytes[i] = Number(rest & 0xffn);
      rest >>= 8n;
    }
    if (signBit) bytes[31] |= 0x80;
    return Buffer.from(bytes).toString('hex');
  };

  it.each([
    ['y = p - 1, sign 0', FIELD_PRIME - 1n, 0 as const, 'canonical_small_order'],
    ['y = p - 1, sign 1', FIELD_PRIME - 1n, 1 as const, 'invalid_x_zero_sign_set'],
    ['y = p, sign 0', FIELD_PRIME, 0 as const, 'invalid_y_out_of_range'],
    ['y = p, sign 1', FIELD_PRIME, 1 as const, 'invalid_y_out_of_range'],
    ['y = p + 1, sign 0', FIELD_PRIME + 1n, 0 as const, 'invalid_y_out_of_range'],
    ['y = p + 1, sign 1', FIELD_PRIME + 1n, 1 as const, 'invalid_y_out_of_range'],
    ['maximum 255-bit y, sign 0', 2n ** 255n - 1n, 0 as const, 'invalid_y_out_of_range'],
    ['maximum 255-bit y, sign 1', 2n ** 255n - 1n, 1 as const, 'invalid_y_out_of_range'],
  ])('%s', (_label, y, signBit, expected) => {
    expect(classifyPointEncoding(encode(y, signBit)).classification).toBe(expected);
  });

  it('the off-curve control classifies identically in both sign variants', () => {
    const offCurve = corpus.entries.find((e) => e.primary_class === 'invalid_not_on_curve');
    expect(offCurve).toBeDefined();
    const bytes = Buffer.from(offCurve!.encoding_hex, 'hex');
    bytes[31] &= 0x7f;
    const unsigned = bytes.toString('hex');
    bytes[31] |= 0x80;
    const signed = bytes.toString('hex');
    for (const variant of [unsigned, signed]) {
      const facts = classifyPointEncoding(variant);
      expect(facts.encodedYInRange).toBe(true);
      expect(facts.decodesToCurvePoint).toBe(false);
      expect(facts.classification).toBe('invalid_not_on_curve');
    }
  });
});
